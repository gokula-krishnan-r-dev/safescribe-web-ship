'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Download,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/notify';
import { toastError } from '@/lib/errors';
import {
  calendarDateInTimeZone,
  documentationDobFieldError,
  isRtlHandoutLanguage,
  normalizeHandoutLanguage,
  preferClinicalReferences,
  recordedAgeForDocumentation,
  seedDocumentationDateOfBirth,
  validateOptionalDob,
} from '@safescript/shared';
import type { Consultation } from '../types';
import { useAuthStore } from '@/features/auth/auth-store';
import {
  useCompleteConsultation,
  useCreateConsultation,
  useGenerateDocumentation,
  useSaveStep,
  useSendConsultationFax,
  useTranslatePatientHandout,
} from '../hooks';
import {
  DOCUMENT_DEFINITIONS,
  getDocumentsByCategory,
  resolveConsultationDocuments,
} from '../documents/document-definitions';
import { isFaxablePrescribeDocument } from '../documents/document-keys';
import { usePublishedDocFormats } from '@/features/doc-format/hooks';
import {
  DocumentWorkspaceDialog,
} from '../documents/document-workspace-dialog';
import { applyClinicalReferencesToDapFields, applyDapAttestationToFields } from '../documents/dap-note-format';
import { consultationHasPrescription, finalizePatientDocumentInfo } from '../documents/patient-address';
import { DocumentsPatientInfoPanel } from '../documents/documents-patient-info-panel';
import { useWizardBeforeLeave } from '../wizard-nav';
import {
  readConsultationDraft,
  writeConsultationDraft,
} from '../consultation-draft-cache';
import {
  docsAffectedByPatientChange,
  enrichPrescriptionBullets,
  getPrescriptionCompletionBlocker,
  PATIENT_DEPENDENT_DOCS,
  patientInfoFingerprint,
  prescriptionCompletionMessage,
  validatePrescriptionDocument,
} from '../documents/document-dependencies';
import { RegenerateDocumentsDialog } from '../documents/regenerate-documents-dialog';
import { PrescriptionDocumentCard } from '../documents/prescription-document-card';
import { generatePrescriptionContent } from '../documents/generators/prescription-generator';
import { generateAllDocumentFields } from '../documents/generators';
import {
  documentationReadyCopy,
  isDocumentCardGenerating,
  llmDocumentTargets,
} from '../documents/documentation-generation';
import { generatePatientHandoutFields } from '../documents/generators/patient-handout-generator';
import { generatePcpCommunicationFields } from '../documents/generators/pcp-communication-generator';
import {
  pcpIdentityFromPatientInfo,
  upsertPcpPatientInformationHtml,
} from '../documents/pcp-patient-information';
import { generateConsultationNoteFields } from '../documents/generators/consultation-note-generator';
import { mergePatientHandoutFields } from '../documents/handout-format';
import {
  DocumentCard,
  DocumentProgressSummary,
  DocumentReviewBanner,
  DocumentsPrivacyFooter,
  FinishConsultationButton,
  footerReviewHint,
} from '../documents/documents-review-ui';
import { CompleteConsultationModal } from '../documents/complete-consultation-modal';
import {
  downloadAllDocuments,
  downloadSingleDocument,
} from '../documents/download-manager';
import { purgeConsultationLocalState } from '../purge-consultation-local-state';
import {
  bumpDocumentationRevision,
  clearDocumentHtml,
  mergePatientInfo,
  normalizeDocumentation,
  refreshPatientDependentDocuments,
} from '../documents/normalize-documentation';
import {
  applyPatientInfoToDocumentationPackage,
  awaitDocumentationPrefetch,
  clearDocumentationPrefetch,
  getDocumentationPrefetchStatus,
  peekDocumentationPrefetch,
  startDocumentationPrefetch,
} from '../documents/documentation-prefetch';
import { copyDocumentToClipboard } from '../documents/copy-document-text';
import { SendFaxDialog } from '../documents/send-fax-dialog';
import {
  blobToBase64,
  buildPdfContext,
  generateDocumentPdf,
  openPdfForPrint,
} from '../documents/pdf-generator';
import { printPatientHandout } from '../documents/print-handout';
import { fieldsToNotionHtml } from '../documents/notion-document-model';
import { resolveHandoutTitle } from '../documents/handout-format';
import type {
  DocumentationPackage,
  DocumentMeta,
  DocumentReviewMeta,
  DocumentState,
  DocumentStatus,
  DocumentTypeId,
  PatientDocumentInfo,
} from '../documents/types';
import {
  isDocumentReviewed,
  makeDocumentVersionId,
} from '../documents/types';

interface Props {
  consultation: Consultation;
  onBack: () => void;
  backLabel?: string;
  onSubmitted: (nextConsultationId?: string) => void;
  /** Kept for wizard wiring; age review happens on Patient Assessment. */
  onReviewAge?: () => void;
  /**
   * Override PATCH step metadata (Adapt uses DOCUMENTS_AND_COMPLETE / stepIndex 3).
   * Defaults match Prescribe guided pathway Step 6.
   */
  persistStep?: { stepIndex: number; currentStep: string };
}

type Phase = 'generating' | 'ready';

/** Drafted when treatment plan is confirmed (before Documents). */
const CONFIRM_DRAFT_DOC_TYPES: DocumentTypeId[] = [
  'consultation_note',
  'patient_care_summary',
];

/** Created after patient details Skip/Save on Documents. */
const PATIENT_GATE_DOC_TYPES: DocumentTypeId[] = [
  'prescriber_communication',
  'prescription',
];

function documentHasDraftContent(
  pkg: DocumentationPackage | undefined,
  id: DocumentTypeId,
): boolean {
  const docs = pkg?.documents;
  if (!docs) return false;
  switch (id) {
    case 'prescription':
      return Boolean(docs.prescription?.medications?.length);
    case 'prescriber_communication': {
      const p = docs.prescriber_communication;
      return Boolean(
        p?.assessment?.trim() ||
          p?.openingSentence?.trim() ||
          p?.documentHtml?.trim(),
      );
    }
    case 'consultation_note': {
      const n = docs.consultation_note;
      return Boolean(
        n?.data?.trim() ||
          n?.assessment?.trim() ||
          n?.plan?.trim() ||
          n?.documentHtml?.trim(),
      );
    }
    case 'patient_care_summary': {
      const h = docs.patient_care_summary;
      return Boolean(
        h?.treatment?.trim() ||
          h?.diagnosis?.trim() ||
          h?.documentHtml?.trim(),
      );
    }
    default:
      return false;
  }
}

function remainingDocsAfterPatientGate(
  availableIds: DocumentTypeId[],
  pkg: DocumentationPackage,
  includePrescription: boolean,
): DocumentTypeId[] {
  const targets: DocumentTypeId[] = [];
  for (const id of PATIENT_GATE_DOC_TYPES) {
    if (!availableIds.includes(id)) continue;
    if (id === 'prescription' && !includePrescription) continue;
    if (!documentHasDraftContent(pkg, id)) targets.push(id);
  }
  for (const id of CONFIRM_DRAFT_DOC_TYPES) {
    if (!availableIds.includes(id)) continue;
    if (!documentHasDraftContent(pkg, id)) targets.push(id);
  }
  return targets;
}

function initDocumentStates(
  definitions: DocumentMeta[] = DOCUMENT_DEFINITIONS,
  revision = 1,
  reviews?: DocumentationPackage['documentReviews'],
): DocumentState[] {
  const stamp = new Date().toISOString();
  return definitions.map((d) => {
    const saved = reviews?.[d.id];
    const versionId =
      saved?.versionId ?? makeDocumentVersionId(d.id, revision, stamp);
    const reviewed =
      saved?.status === 'REVIEWED' &&
      saved.reviewedVersionId &&
      saved.reviewedVersionId === versionId;
    return {
      id: d.id,
      status: reviewed
        ? 'REVIEWED'
        : ((saved?.status as DocumentStatus | undefined) ?? 'pending'),
      versionId,
      reviewedVersionId: saved?.reviewedVersionId,
      reviewedAt: saved?.reviewedAt,
      lastGeneratedAt: stamp,
    };
  });
}

function reviewsFromStates(
  states: DocumentState[],
): DocumentationPackage['documentReviews'] {
  const out: NonNullable<DocumentationPackage['documentReviews']> = {};
  for (const s of states) {
    const status: DocumentReviewMeta['status'] =
      s.status === 'REVIEWED' ||
      s.status === 'UPDATED_REVIEW_REQUIRED' ||
      s.status === 'SOURCE_CHANGED' ||
      s.status === 'GENERATION_FAILED'
        ? s.status
        : 'REVIEW_REQUIRED';
    out[s.id] = {
      versionId: s.versionId,
      reviewedVersionId: s.reviewedVersionId,
      reviewedAt: s.reviewedAt,
      status,
    };
  }
  return out;
}

export function Step9Documentation({
  consultation,
  onBack,
  backLabel = 'Back',
  onSubmitted,
  persistStep,
}: Props) {
  const authUser = useAuthStore((s) => s.user);
  const generate = useGenerateDocumentation(consultation.id);
  const sendFax = useSendConsultationFax(consultation.id);
  const translateHandout = useTranslatePatientHandout(consultation.id);
  const saveStep = useSaveStep(consultation.id);
  const completeConsultation = useCompleteConsultation(consultation.id);
  const createConsultation = useCreateConsultation();
  const { data: publishedFormats } = usePublishedDocFormats();
  const documentDefinitions = useMemo(
    () => resolveConsultationDocuments(consultation, publishedFormats),
    [consultation, publishedFormats],
  );

  const faxStorageScope = useMemo(
    () => ({
      tenantId: consultation.tenantId ?? authUser?.tenantId ?? null,
      userId: authUser?.id ?? consultation.pharmacistId ?? null,
      consultationId: consultation.id,
    }),
    [
      consultation.tenantId,
      consultation.pharmacistId,
      consultation.id,
      authUser?.tenantId,
      authUser?.id,
    ],
  );

  const consultationDate = calendarDateInTimeZone(
    consultation.createdAt,
    consultation.tenant?.timezone,
  );
  const recordedAgeResolved = recordedAgeForDocumentation({
    demographics: consultation.demographics ?? {},
    consultationDate,
    narrative: [consultation.chiefComplaint, consultation.transcript]
      .filter((part) => String(part ?? '').trim())
      .join('\n'),
  });
  const recordedAge = recordedAgeResolved?.age ?? null;

  const existingPkg = consultation.documentation as DocumentationPackage | undefined;
  const hasExistingDocs = Boolean(
    existingPkg?.documents || existingPkg?.presentingComplaint,
  );

  // Wait for patient details Skip/Save before generating PCP + prescription.
  const [phase, setPhase] = useState<Phase>('ready');
  const [patientInfo, setPatientInfo] = useState<PatientDocumentInfo>(
    () => {
      const stored =
        readConsultationDraft(consultation.id, 'DOCUMENTATION_PATIENT') ??
        existingPkg?.patientInfo ??
        {};
      const dateOfBirth = seedDocumentationDateOfBirth({
        storedDob: stored.dateOfBirth,
        demographics: consultation.demographics ?? {},
        consultationDate,
      });
      return finalizePatientDocumentInfo({ ...stored, dateOfBirth });
    },
  );
  const [pkg, setPkg] = useState<DocumentationPackage>(() =>
    normalizeDocumentation(consultation.documentation, consultation, patientInfo),
  );
  const pkgRef = useRef(pkg);
  const committedRefCount = pkg.clinicalReferences?.selections?.length ?? 0;
  const liveRefCount = pkgRef.current.clinicalReferences?.selections?.length ?? 0;
  if (committedRefCount >= liveRefCount) {
    pkgRef.current = pkg;
  }
  const [docStates, setDocStates] = useState<DocumentState[]>(() =>
    initDocumentStates(
      resolveConsultationDocuments(consultation, null),
      existingPkg?.revision ?? 1,
      existingPkg?.documentReviews,
    ),
  );
  const [currentGenerating, setCurrentGenerating] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [workspace, setWorkspace] = useState<{ typeId: DocumentTypeId } | null>(null);
  const [workspaceDirty, setWorkspaceDirty] = useState(false);
  const [faxTypeId, setFaxTypeId] = useState<DocumentTypeId | null>(null);
  const [manuallyEditedIds, setManuallyEditedIds] = useState<Set<DocumentTypeId>>(
    () => new Set(),
  );
  /** Opt-in printable Rx — matches mock create → expand flow. */
  const [prescriptionIncluded, setPrescriptionIncluded] = useState(() => {
    const reviews = existingPkg?.documentReviews?.prescription;
    return Boolean(
      reviews?.status === 'REVIEWED' ||
        reviews?.status === 'REVIEW_REQUIRED' ||
        reviews?.status === 'UPDATED_REVIEW_REQUIRED' ||
        (existingPkg?.documents?.prescription?.medications?.length &&
          existingPkg?.documentReviews?.prescription),
    );
  });
  const [creatingPrescription, setCreatingPrescription] = useState(false);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [copiedId, setCopiedId] = useState<DocumentTypeId | null>(null);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [prefetchBusy, setPrefetchBusy] = useState(false);
  const [patientInfoSaving, setPatientInfoSaving] = useState(false);
  const completeRequestIdRef = useRef(
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `complete-${Date.now()}`,
  );
  /** Fresh consult opened after Complete & Delete (wizard navigates here). */
  const nextConsultationIdRef = useRef<string | null>(null);
  const generationStarted = useRef(false);
  const editRevisionBumped = useRef(false);
  const patientFingerprintRef = useRef(
    existingPkg?.patientSourceFingerprint ??
      patientInfoFingerprint(existingPkg?.patientInfo ?? {}),
  );

  const persistPackage = useCallback(
    async (next: DocumentationPackage) => {
      const refs = preferClinicalReferences(
        pkgRef.current.clinicalReferences,
        next.clinicalReferences,
      );
      const payload: DocumentationPackage = refs
        ? { ...next, clinicalReferences: refs }
        : next;
      await saveStep.mutateAsync({
        stepIndex: persistStep?.stepIndex ?? 8,
        currentStep: persistStep?.currentStep ?? 'DOCUMENTATION',
        data: payload as unknown as Record<string, unknown>,
      });
    },
    [persistStep?.currentStep, persistStep?.stepIndex, saveStep],
  );

  const dobGateStatus = recordedAge
    ? validateOptionalDob({
        dob: patientInfo.dateOfBirth,
        recordedAge,
        consultationDate,
      }).status
    : 'NOT_ENTERED';
  const dobActionsLocked =
    dobGateStatus === 'MISMATCH' || dobGateStatus === 'INVALID';
  const [patientDetailsReady, setPatientDetailsReady] = useState(() => {
    if (patientInfo.skipped) return true;
    if (existingPkg?.patientSourceFingerprint) return true;
    return Boolean(
      readConsultationDraft(consultation.id, 'DOCUMENTATION_PATIENT_GATE')?.confirmedAt,
    );
  });
  const patientGateLocked = !patientDetailsReady;
  const actionsLocked = dobActionsLocked || patientGateLocked;
  const dobActionsLockedMessage =
    dobGateStatus === 'MISMATCH'
      ? 'Date of birth does not match the recorded age. Correct it in Patient details before exporting.'
      : 'Enter a valid date of birth, or leave it blank, before exporting documents.';
  const patientGateLockedMessage =
    'Save or skip patient details before opening or exporting documents.';
  const actionsLockedMessage = patientGateLocked
    ? patientGateLockedMessage
    : dobActionsLockedMessage;

  const markPatientDetailsReady = () => {
    const confirmedAt = new Date().toISOString();
    writeConsultationDraft(consultation.id, 'DOCUMENTATION_PATIENT_GATE', { confirmedAt });
    setPatientDetailsReady(true);
  };

  useWizardBeforeLeave(() => {
    writeConsultationDraft(consultation.id, 'DOCUMENTATION_PATIENT', patientInfo);
  });

  const applyPrescriptionValidation = useCallback(
    (
      nextPkg: DocumentationPackage,
      states: DocumentState[],
    ): DocumentState[] => {
      if (!consultationHasPrescription(consultation)) return states;
      const validation = validatePrescriptionDocument({
        consultation,
        patientInfo: nextPkg.patientInfo ?? patientInfo,
        medications: nextPkg.documents?.prescription?.medications,
      });
      if (validation.ok) return states;
      return states.map((s) =>
        s.id === 'prescription'
          ? {
              ...s,
              status: 'GENERATION_FAILED' as DocumentStatus,
              error: validation.errors.join(' '),
            }
          : s,
      );
    },
    [consultation, patientInfo],
  );

  const runGenerate = useCallback(
    async (
      isRegenerate: boolean,
      selectedIds?: DocumentTypeId[],
      overridePatientInfo?: PatientDocumentInfo,
    ) => {
      const activePatient = overridePatientInfo ?? patientInfo;
      const targets =
        selectedIds?.length
          ? selectedIds
          : documentDefinitions.map((d) => d.id);
      const targetSet = new Set(targets);
      const llmTargets = llmDocumentTargets(targets);
      const stampNow = new Date().toISOString();
      const nextRevision = (pkg.revision ?? 0) + (isRegenerate ? 1 : 0) || 1;

      setFailed(false);
      setPhase('generating');
      setCurrentGenerating(
        llmTargets.length
          ? documentDefinitions
              .filter((d) => llmTargets.includes(d.id))
              .map((d) => d.shortName ?? d.name)
              .join(' and ')
          : null,
      );

      const deterministic = generateAllDocumentFields(consultation, activePatient);
      const liveRefs = preferClinicalReferences(
        pkgRef.current.clinicalReferences,
        pkg.clinicalReferences,
      );
      let nextPkg: DocumentationPackage = refreshPatientDependentDocuments(
        mergePatientInfo(
          {
            ...pkg,
            ...(liveRefs ? { clinicalReferences: liveRefs } : {}),
            documents: {
              ...(pkg.documents ?? {}),
              ...(targetSet.has('prescription')
                ? { prescription: deterministic.prescription }
                : {}),
              ...(targetSet.has('patient_care_summary')
                ? { patient_care_summary: deterministic.patient_care_summary }
                : {}),
            },
            patientInfo: activePatient,
          },
          activePatient,
        ),
        consultation,
        activePatient,
      );
      setPkg(nextPkg);
      pkgRef.current = {
        ...nextPkg,
        clinicalReferences:
          preferClinicalReferences(
            pkgRef.current.clinicalReferences,
            nextPkg.clinicalReferences,
          ) ?? nextPkg.clinicalReferences,
      };

      setDocStates((prev) => {
        const byId = new Map(prev.map((s) => [s.id, s]));
        return documentDefinitions.map((d) => {
          const existing = byId.get(d.id);
          if (!targetSet.has(d.id)) {
            return (
              existing ?? {
                id: d.id,
                status: 'REVIEW_REQUIRED' as DocumentStatus,
                versionId: makeDocumentVersionId(d.id, pkg.revision ?? 1),
              }
            );
          }
          const llm = llmTargets.includes(d.id);
          return {
            id: d.id,
            status: (llm ? 'GENERATING' : 'REVIEW_REQUIRED') as DocumentStatus,
            versionId: makeDocumentVersionId(d.id, nextRevision, stampNow),
            lastGeneratedAt: stampNow,
          };
        });
      });

      let aiFailed = false;

      try {
        if (llmTargets.length > 0) {
          const result = await generate.mutateAsync({
            requestedDocumentTypes: llmTargets,
            force: isRegenerate,
          });
          nextPkg = normalizeDocumentation(
            result as DocumentationPackage,
            consultation,
            activePatient,
          );
        }
        nextPkg = refreshPatientDependentDocuments(
          mergePatientInfo(nextPkg, activePatient),
          consultation,
          activePatient,
        );
        // Rebuild Notion canvas from fresh fields for regenerated docs
        nextPkg = clearDocumentHtml(nextPkg, targets);

        if (targetSet.has('patient_care_summary')) {
          const language = normalizeHandoutLanguage(
            pkg.documents?.patient_care_summary?.requestedHandoutLanguage ??
              pkg.documents?.patient_care_summary?.handoutLanguage ??
              nextPkg.documents?.patient_care_summary?.handoutLanguage,
          );
          const canonical = generatePatientHandoutFields(consultation, activePatient, {
            language: 'en',
          });
          let fields = mergePatientHandoutFields(
            nextPkg.documents?.patient_care_summary,
            canonical,
          );
          if (canonical.treatment) fields.treatment = canonical.treatment;
          if (language !== 'en') {
            try {
              const translated = await translateHandout.mutateAsync(language);
              fields = translated.fields;
            } catch {
              fields = {
                ...fields,
                translationFallback: 'true',
                translationRequiresReview: 'true',
                translationMessage: 'Translation requires pharmacist review',
                requestedHandoutLanguage: language,
              };
            }
          }
          nextPkg = {
            ...nextPkg,
            documents: {
              ...(nextPkg.documents ?? {}),
              patient_care_summary: fields,
            },
          };
        }

        if (targetSet.has('prescriber_communication')) {
          const existing = nextPkg.documents?.prescriber_communication;
          if (!existing?.assessment?.trim() && !existing?.openingSentence?.trim()) {
            nextPkg = {
              ...nextPkg,
              documents: {
                ...(nextPkg.documents ?? {}),
                prescriber_communication: generatePcpCommunicationFields(
                  consultation,
                  activePatient,
                ),
              },
            };
          }
        }

        if (targetSet.has('consultation_note')) {
          const existing = nextPkg.documents?.consultation_note;
          if (!existing?.data?.trim() && !existing?.assessment?.trim()) {
            nextPkg = {
              ...nextPkg,
              documents: {
                ...(nextPkg.documents ?? {}),
                consultation_note: generateConsultationNoteFields(
                  consultation,
                  activePatient,
                ),
              },
            };
          }
        }

        // For selective regenerate, keep non-selected document content
        if (isRegenerate && selectedIds?.length) {
          const mergedDocs = { ...(pkg.documents ?? {}) };
          for (const id of targets) {
            if (id === 'prescription') {
              mergedDocs.prescription = nextPkg.documents?.prescription;
            } else if (id === 'consultation_note') {
              mergedDocs.consultation_note = nextPkg.documents?.consultation_note;
            } else if (id === 'prescriber_communication') {
              mergedDocs.prescriber_communication =
                nextPkg.documents?.prescriber_communication;
            } else if (id === 'patient_care_summary') {
              mergedDocs.patient_care_summary =
                nextPkg.documents?.patient_care_summary;
            }
          }
          nextPkg = refreshPatientDependentDocuments(
            { ...nextPkg, documents: mergedDocs },
            consultation,
            activePatient,
          );
        }

        if (isRegenerate) {
          nextPkg = bumpDocumentationRevision(
            { ...nextPkg, revisions: pkg.revisions },
            'regenerate',
          );
        } else {
          nextPkg = {
            ...nextPkg,
            revision: 1,
            revisions: [
              {
                revision: 1,
                generatedAt: nextPkg.generatedAt ?? new Date().toISOString(),
                source: 'ai',
              },
            ],
          };
        }
      } catch {
        aiFailed = true;
        const fallback = refreshPatientDependentDocuments(
          mergePatientInfo(
            normalizeDocumentation(undefined, consultation, activePatient),
            activePatient,
          ),
          consultation,
          activePatient,
        );
        if (isRegenerate && selectedIds?.length) {
          const mergedDocs = { ...(pkg.documents ?? {}) };
          for (const id of targets) {
            if (id === 'prescription') {
              mergedDocs.prescription = fallback.documents?.prescription;
            } else if (id === 'consultation_note') {
              mergedDocs.consultation_note = fallback.documents?.consultation_note;
            } else if (id === 'prescriber_communication') {
              mergedDocs.prescriber_communication =
                fallback.documents?.prescriber_communication;
            } else if (id === 'patient_care_summary') {
              mergedDocs.patient_care_summary =
                fallback.documents?.patient_care_summary;
            }
          }
          nextPkg = bumpDocumentationRevision(
            refreshPatientDependentDocuments(
              {
                ...fallback,
                documents: mergedDocs,
                revisions: pkg.revisions,
              },
              consultation,
              activePatient,
            ),
            'regenerate',
          );
        } else if (isRegenerate) {
          nextPkg = bumpDocumentationRevision(
            { ...fallback, revisions: pkg.revisions },
            'regenerate',
          );
        } else {
          nextPkg = fallback;
        }
        setFailed(true);
        toast.error(
          'Drafting unavailable — documents compiled from consultation data. Pharmacist review is required.',
        );
      }

      const stamp = nextPkg.generatedAt ?? new Date().toISOString();
      const revision = nextPkg.revision ?? 1;

      // Preserve reviews for docs that were not regenerated
      const nextReviews: NonNullable<DocumentationPackage['documentReviews']> = {
        ...(pkg.documentReviews ?? {}),
      };
      for (const id of targets) {
        delete nextReviews[id];
      }
      const preservedRefs = preferClinicalReferences(
        pkgRef.current.clinicalReferences,
        nextPkg.clinicalReferences,
      );
      nextPkg = {
        ...nextPkg,
        ...(preservedRefs ? { clinicalReferences: preservedRefs } : {}),
        documentReviews: nextReviews,
        patientSourceFingerprint: patientInfoFingerprint(activePatient),
      };
      if (nextPkg.clinicalReferences && nextPkg.documents?.consultation_note) {
        nextPkg = {
          ...nextPkg,
          documents: {
            ...nextPkg.documents,
            consultation_note: applyDapAttestationToFields(
              applyClinicalReferencesToDapFields(
                nextPkg.documents.consultation_note,
                nextPkg.clinicalReferences,
              ),
              consultation,
            ),
          },
        };
      }

      setPatientInfo(activePatient);
      patientFingerprintRef.current = patientInfoFingerprint(activePatient);
      setPkg(nextPkg);
      pkgRef.current = nextPkg;
      await persistPackage(nextPkg);

      setDocStates((prev) => {
        const byId = new Map(prev.map((s) => [s.id, s]));
        let nextStates = documentDefinitions.map((d) => {
          const existing = byId.get(d.id);
          if (!targetSet.has(d.id)) {
            return (
              existing ?? {
                id: d.id,
                status: 'REVIEW_REQUIRED' as DocumentStatus,
                versionId: makeDocumentVersionId(d.id, revision, stamp),
              }
            );
          }
          return {
            id: d.id,
            status: 'REVIEW_REQUIRED' as DocumentStatus,
            versionId: makeDocumentVersionId(d.id, revision, stamp),
            lastGeneratedAt: stamp,
          };
        });
        nextStates = applyPrescriptionValidation(nextPkg, nextStates);
        return nextStates;
      });

      setManuallyEditedIds((prev) => {
        const next = new Set(prev);
        for (const id of targets) next.delete(id);
        return next;
      });

      if (targetSet.has('prescription')) {
        setPrescriptionIncluded(true);
      }

      setCurrentGenerating(null);
      setPhase('ready');
      if (aiFailed) setFailed(true);
    },
    [
      applyPrescriptionValidation,
      consultation,
      documentDefinitions,
      generate,
      patientInfo,
      persistPackage,
      pkg,
      translateHandout,
    ],
  );

  const enterDocuments = (info: PatientDocumentInfo) => {
    const sanitized: PatientDocumentInfo = {
      ...info,
      dateOfBirth: seedDocumentationDateOfBirth({
        storedDob: info.dateOfBirth,
        demographics: consultation.demographics ?? {},
        consultationDate,
      }),
    };
    const availableIds = documentDefinitions.map((d) => d.id);
    const fingerprint = patientInfoFingerprint(sanitized);
    const prefetchedPeek = peekDocumentationPrefetch(consultation.id);
    const docsAlreadyPrepared =
      hasExistingDocs || Boolean(prefetchedPeek?.documents);
    const persistedFingerprint =
      existingPkg?.patientSourceFingerprint ??
      patientInfoFingerprint(existingPkg?.patientInfo ?? {}) ??
      patientInfoFingerprint(prefetchedPeek?.patientInfo ?? {});
    const fingerprintChanged =
      fingerprint !== patientFingerprintRef.current ||
      (docsAlreadyPrepared && fingerprint !== persistedFingerprint);

    // Prefer explicit prev→next diff; if remount left state already matching
    // the form, still regenerate all patient-dependent docs on fingerprint drift.
    const affectedFromDiff = docsAffectedByPatientChange(
      patientInfo,
      sanitized,
      availableIds,
    );
    let affected = fingerprintChanged
      ? affectedFromDiff.length > 0
        ? affectedFromDiff
        : PATIENT_DEPENDENT_DOCS.filter((id) => availableIds.includes(id))
      : [];
    if (
      fingerprintChanged &&
      prescriptionIncluded &&
      !affected.includes('prescription')
    ) {
      affected = [...affected, 'prescription'];
    }

    patientFingerprintRef.current = fingerprint;
    setPatientInfo(sanitized);
    writeConsultationDraft(consultation.id, 'DOCUMENTATION_PATIENT', sanitized);

    const startRemainingDocuments = (basePkg: DocumentationPackage) => {
      const targets = remainingDocsAfterPatientGate(
        availableIds,
        basePkg,
        consultationHasPrescription(consultation),
      );
      if (targets.length === 0) {
        setPhase('ready');
        return;
      }
      generationStarted.current = true;
      void runGenerate(false, targets, sanitized);
    };

    // Patient details changed after docs already exist → refresh identity fields,
    // then create any remaining gate docs (PCP + prescription).
    if (
      (generationStarted.current || docsAlreadyPrepared) &&
      fingerprintChanged &&
      affected.length > 0
    ) {
      generationStarted.current = true;
      const stamp = new Date().toISOString();
      const seedPkg =
        (prefetchedPeek
          ? applyPatientInfoToDocumentationPackage(
              {
                ...prefetchedPeek,
                clinicalReferences:
                  preferClinicalReferences(
                    pkgRef.current.clinicalReferences,
                    prefetchedPeek.clinicalReferences,
                  ) ?? prefetchedPeek.clinicalReferences,
              },
              consultation,
              sanitized,
            )
          : null) ??
        bumpDocumentationRevision(
          clearDocumentHtml(
            refreshPatientDependentDocuments(
              mergePatientInfo(pkgRef.current, sanitized),
              consultation,
              sanitized,
            ),
            affected,
          ),
          'regenerate',
        );
      const refreshed = seedPkg;
      const nextReviews: NonNullable<DocumentationPackage['documentReviews']> = {
        ...(refreshed.documentReviews ?? pkgRef.current.documentReviews ?? {}),
      };
      for (const id of affected) {
        nextReviews[id] = {
          versionId: makeDocumentVersionId(id, refreshed.revision ?? 1, stamp),
          status: 'UPDATED_REVIEW_REQUIRED',
        };
      }
      const nextPkg: DocumentationPackage = {
        ...refreshed,
        documentReviews: nextReviews,
        patientSourceFingerprint: fingerprint,
      };
      setPkg(nextPkg);
      pkgRef.current = nextPkg;
      void persistPackage(nextPkg);
      setDocStates((prev) => {
        const byId = new Map(prev.map((s) => [s.id, s]));
        let nextStates = documentDefinitions.map((d) => {
          const existing = byId.get(d.id);
          if (!affected.includes(d.id)) {
            return (
              existing ?? {
                id: d.id,
                status: 'REVIEW_REQUIRED' as DocumentStatus,
                versionId: makeDocumentVersionId(d.id, nextPkg.revision ?? 1, stamp),
              }
            );
          }
          return {
            id: d.id,
            status: 'UPDATED_REVIEW_REQUIRED' as DocumentStatus,
            versionId: makeDocumentVersionId(d.id, nextPkg.revision ?? 1, stamp),
            reviewedVersionId: undefined,
            reviewedAt: undefined,
            lastGeneratedAt: stamp,
          };
        });
        nextStates = applyPrescriptionValidation(nextPkg, nextStates);
        return nextStates;
      });
      toast.message('Patient details applied', {
        description:
          'Document headers were updated. Review any documents marked for re-check.',
      });
      startRemainingDocuments(nextPkg);
      return;
    }

    // Same patient info, docs already exist → restore and refresh patient fields
    if (hasExistingDocs && consultation.documentation) {
      const normalized = refreshPatientDependentDocuments(
        mergePatientInfo(
          normalizeDocumentation(
            consultation.documentation,
            consultation,
            sanitized,
          ),
          sanitized,
        ),
        consultation,
        sanitized,
      );
      setPkg(normalized);
      pkgRef.current = normalized;
      void persistPackage(normalized);
      const revision = normalized.revision ?? 1;
      const stamp = normalized.generatedAt ?? new Date().toISOString();
      let states: DocumentState[] = documentDefinitions.map((d) => {
        const saved = normalized.documentReviews?.[d.id];
        const versionId =
          saved?.versionId ?? makeDocumentVersionId(d.id, revision, stamp);
        const reviewed =
          saved?.status === 'REVIEWED' &&
          saved.reviewedVersionId === versionId;
        return {
          id: d.id,
          status: (reviewed
            ? 'REVIEWED'
            : saved?.status ?? 'REVIEW_REQUIRED') as DocumentStatus,
          versionId,
          reviewedVersionId: saved?.reviewedVersionId,
          reviewedAt: saved?.reviewedAt,
          lastGeneratedAt: stamp,
        };
      });
      states = applyPrescriptionValidation(normalized, states);
      setDocStates(states);
      startRemainingDocuments(normalized);
      return;
    }

    // First unlock after patient Skip/Save: apply Confirm drafts (DAP + handout),
    // then generate remaining PCP letter + prescription only.
    if (!generationStarted.current) {
      generationStarted.current = true;
      const prefetchStatus = getDocumentationPrefetchStatus(consultation.id);
      void (async () => {
        let basePkg = mergePatientInfo(pkgRef.current, sanitized);
        try {
          if (prefetchStatus === 'pending' || prefetchStatus === 'ready') {
            setPrefetchBusy(true);
            setPhase('generating');
            setCurrentGenerating('consultation note and patient handout');
            const prefetched =
              peekDocumentationPrefetch(consultation.id) ??
              (await awaitDocumentationPrefetch(consultation.id));
            if (prefetched) {
              const liveRefs = preferClinicalReferences(
                pkgRef.current.clinicalReferences,
                prefetched.clinicalReferences ?? pkg.clinicalReferences,
              );
              basePkg = applyPatientInfoToDocumentationPackage(
                {
                  ...prefetched,
                  ...(liveRefs ? { clinicalReferences: liveRefs } : {}),
                },
                consultation,
                sanitized,
              );
            }
          }

          setPkg(basePkg);
          pkgRef.current = basePkg;
          void persistPackage(basePkg);

          const stamp = new Date().toISOString();
          let states: DocumentState[] = documentDefinitions.map((d) => {
            const ready = documentHasDraftContent(basePkg, d.id);
            return {
              id: d.id,
              status: (ready
                ? 'REVIEW_REQUIRED'
                : 'pending') as DocumentStatus,
              versionId: makeDocumentVersionId(d.id, basePkg.revision ?? 1, stamp),
              lastGeneratedAt: ready ? stamp : undefined,
            };
          });
          states = applyPrescriptionValidation(basePkg, states);
          setDocStates(states);

          const targets = remainingDocsAfterPatientGate(
            availableIds,
            basePkg,
            consultationHasPrescription(consultation),
          );
          if (targets.length === 0) {
            setCurrentGenerating(null);
            setPhase('ready');
            toast.message('Documents ready', {
              description: 'Clinical drafts are ready to review.',
            });
            return;
          }

          setCurrentGenerating(
            targets.includes('prescriber_communication')
              ? 'physician letter'
              : null,
          );
          await runGenerate(false, targets, sanitized);
        } catch {
          setPrefetchBusy(false);
          setCurrentGenerating(null);
          setFailed(true);
          setPhase('ready');
          toast.error(
            'Could not finish document drafting. Retry from a document card, or continue with available drafts.',
          );
          // Ensure remaining docs still attempt Nest/LLM generation.
          const targets = remainingDocsAfterPatientGate(
            availableIds,
            basePkg,
            consultationHasPrescription(consultation),
          );
          if (targets.length > 0) {
            try {
              await runGenerate(false, targets, sanitized);
            } catch {
              /* runGenerate already surfaces a toast */
            }
          }
        } finally {
          setPrefetchBusy(false);
        }
      })();
    }
  };

  const persistPatientDraft = (info: PatientDocumentInfo) => {
    writeConsultationDraft(consultation.id, 'DOCUMENTATION_PATIENT', info);
  };

  const handlePatientInfoSave = async (info: PatientDocumentInfo) => {
    if (recordedAge && info.dateOfBirth?.trim()) {
      const mismatch = documentationDobFieldError(
        validateOptionalDob({
          dob: info.dateOfBirth,
          recordedAge,
          consultationDate,
        }),
        recordedAgeResolved?.origin ?? 'intake',
      );
      if (mismatch) {
        toast.error(mismatch);
        return;
      }
    }
    setPatientInfoSaving(true);
    try {
      markPatientDetailsReady();
      enterDocuments({ ...info, skipped: false });
    } finally {
      window.setTimeout(() => setPatientInfoSaving(false), 180);
    }
  };

  const handlePatientInfoSkip = async () => {
    setPatientInfoSaving(true);
    try {
      markPatientDetailsReady();
      enterDocuments(
        finalizePatientDocumentInfo({
          name: '',
          dateOfBirth: '',
          patientId: '',
          phone: '',
          address: '',
          skipped: true,
        }),
      );
      toast.message('Patient details skipped', {
        description: 'Documents continue without patient identity on headers.',
      });
    } finally {
      window.setTimeout(() => setPatientInfoSaving(false), 180);
    }
  };

  // Reflect Confirm-treatment background drafts (DAP + handout) while generating.
  useEffect(() => {
    if (phase !== 'generating') return;
    const tick = () => {
      const status = getDocumentationPrefetchStatus(consultation.id);
      setPrefetchBusy(status === 'pending');
    };
    tick();
    const id = window.setInterval(tick, 1200);
    return () => window.clearInterval(id);
  }, [consultation.id, phase]);

  // Safety net: if Confirm-treatment prefetch never started, kick DAP + handout
  // while the pharmacist fills patient details (still gated until Save/Skip).
  useEffect(() => {
    if (hasExistingDocs) return;
    if (getDocumentationPrefetchStatus(consultation.id) !== 'idle') return;
    void startDocumentationPrefetch(consultation.id, async () => {
      const result = await generate.mutateAsync({
        requestedDocumentTypes: [
          'consultation_note',
          'patient_care_summary',
        ],
        force: false,
      });
      return result as DocumentationPackage;
    }).catch(() => undefined);
    // Intentionally once per consultation mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount safety net
  }, [consultation.id]);

  const confirmAndRegenerate = (selectedIds: DocumentTypeId[]) => {
    setConfirmRegenerate(false);
    generationStarted.current = true;
    clearDocumentationPrefetch(consultation.id);
    void runGenerate(true, selectedIds);
  };

  const handleCreatePrescription = async (openAfter = false) => {
    if (actionsLocked) {
      toast.error(actionsLockedMessage);
      return false;
    }
    if (creatingPrescription) {
      return false;
    }
    setCreatingPrescription(true);
    try {
      const rx = generatePrescriptionContent(consultation, patientInfo);
      const validation = validatePrescriptionDocument({
        consultation,
        patientInfo,
        medications: rx.medications,
      });
      const stamp = new Date().toISOString();
      const revision = pkg.revision ?? 1;
      const versionId = makeDocumentVersionId('prescription', revision, stamp);

      const nextPkg: DocumentationPackage = {
        ...pkg,
        patientInfo,
        documents: {
          ...(pkg.documents ?? {}),
          prescription: rx,
        },
        documentReviews: {
          ...(pkg.documentReviews ?? {}),
          prescription: {
            versionId,
            status: validation.ok ? 'REVIEW_REQUIRED' : 'GENERATION_FAILED',
          },
        },
      };

      setPkg(nextPkg);
      await persistPackage(nextPkg);

      setDocStates((prev) => {
        const others = prev.filter((s) => s.id !== 'prescription');
        return [
          ...others,
          {
            id: 'prescription' as DocumentTypeId,
            status: (validation.ok
              ? 'REVIEW_REQUIRED'
              : 'GENERATION_FAILED') as DocumentStatus,
            versionId,
            lastGeneratedAt: stamp,
            error: validation.ok ? undefined : validation.errors.join(' '),
          },
        ];
      });
      setPrescriptionIncluded(true);
      if (!validation.ok) {
        toast.error(validation.errors[0] ?? 'Could not create prescription');
        return false;
      }
      toast.success('Printable prescription created — review required');
      if (openAfter) openWorkspace('prescription');
      return true;
    } catch {
      toast.error('Could not create printable prescription');
      return false;
    } finally {
      setCreatingPrescription(false);
    }
  };

  const handleRetryDocument = (typeId: DocumentTypeId) => {
    generationStarted.current = true;
    if (typeId === 'prescription') setPrescriptionIncluded(true);
    void runGenerate(true, [typeId]);
  };

  const handleDownload = (typeId: DocumentTypeId) => {
    if (actionsLocked) {
      toast.error(actionsLockedMessage);
      return;
    }
    const state = docStates.find((s) => s.id === typeId);
    if (!state || !isDocumentReviewed(state)) {
      toast.error('Review this document before downloading');
      return;
    }
    void downloadSingleDocument(
      typeId,
      consultation,
      pkgRef.current,
      patientInfo,
      documentDefinitions,
    );
  };

  const handlePrint = async (typeId: DocumentTypeId) => {
    if (actionsLocked) {
      toast.error(actionsLockedMessage);
      return;
    }
    const state = docStates.find((s) => s.id === typeId);
    if (!state || !isDocumentReviewed(state)) {
      toast.error('Review this document before printing');
      return;
    }
    if (typeId === 'patient_care_summary') {
      const summaryFields = (pkgRef.current.documents?.patient_care_summary ?? {}) as Record<string, string>;
      const title = resolveHandoutTitle(summaryFields);
      const handoutHtml =
        summaryFields.documentHtml?.trim() ||
        fieldsToNotionHtml('patient_care_summary', summaryFields, title);
      const lang = normalizeHandoutLanguage(summaryFields.handoutLanguage);
      const dir = isRtlHandoutLanguage(lang) ? 'rtl' : 'ltr';
      await printPatientHandout(handoutHtml, lang, dir);
      return;
    }
    const def = documentDefinitions.find((d) => d.id === typeId);
    const ctx = buildPdfContext(consultation, patientInfo);
    const blob = await generateDocumentPdf(typeId, pkgRef.current, ctx, def?.pdfLayout);
    openPdfForPrint(blob);
  };

  const handleOpenFax = (typeId: DocumentTypeId) => {
    if (actionsLocked) {
      toast.error(actionsLockedMessage);
      return;
    }
    if (!isFaxablePrescribeDocument(typeId)) return;
    const state = docStates.find((s) => s.id === typeId);
    if (!state || !isDocumentReviewed(state)) {
      toast.error('Review this document before faxing');
      return;
    }
    setFaxTypeId(typeId);
  };

  const handleSendCardFax = async (values: { recipientName: string; faxNumber: string }) => {
    if (!faxTypeId || !isFaxablePrescribeDocument(faxTypeId)) {
      throw new Error('FAX_UNAVAILABLE');
    }
    const def = documentDefinitions.find((d) => d.id === faxTypeId);
    const ctx = buildPdfContext(consultation, patientInfo);
    const blob = await generateDocumentPdf(faxTypeId, pkgRef.current, ctx, def?.pdfLayout);
    if (!blob.size) {
      throw new Error('This document is empty and cannot be faxed');
    }
    const pdfBase64 = await blobToBase64(blob);
    try {
      await sendFax.mutateAsync({
        recipientName: values.recipientName,
        faxNumber: values.faxNumber,
        documentTypeId: faxTypeId,
        documentName: def?.name,
        pdfBase64,
      });
      toast.success(
        `Fax submitted to ${values.recipientName}. Delivery is confirmed when the recipient receives it.`,
        { announce: true },
      );
    } catch (err) {
      toastError(err, 'The fax could not be sent. Try again or print the document.');
      throw err;
    }
  };

  const handleCopy = async (typeId: DocumentTypeId) => {
    if (actionsLocked) {
      toast.error(actionsLockedMessage);
      return;
    }
    const state = docStates.find((s) => s.id === typeId);
    if (
      !state ||
      isDocumentCardGenerating(state) ||
      state.status === 'GENERATION_FAILED' ||
      state.status === 'error'
    ) {
      toast.error('Document is not ready to copy');
      return;
    }
    try {
      await copyDocumentToClipboard(typeId, pkgRef.current);
      setCopiedId(typeId);
      toast.success('Copied to clipboard', { announce: true });
      window.setTimeout(() => setCopiedId(null), 2500);
    } catch {
      toast.error('Could not copy to clipboard');
    }
  };

  const handleDownloadAll = async () => {
    if (actionsLocked) {
      toast.error(actionsLockedMessage);
      return;
    }
    const allReviewed = docStates.every(isDocumentReviewed);
    if (!allReviewed) {
      toast.error('Review all documents before downloading');
      return;
    }
    setDownloadingAll(true);
    try {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
      const result = await downloadAllDocuments(consultation, pkg, patientInfo, {
        definitions: documentDefinitions.filter(
          (d) => d.id !== 'prescription' || prescriptionIncluded,
        ),
      });
      toast.success(
        `Downloading ${result.fileCount} document${result.fileCount === 1 ? '' : 's'} as ${result.fileName}`,
      );
    } catch {
      toast.error('Could not download documents');
    } finally {
      setDownloadingAll(false);
    }
  };

  const openWorkspace = (typeId: DocumentTypeId) => {
    if (actionsLocked) {
      toast.error(actionsLockedMessage);
      return;
    }
    editRevisionBumped.current = false;
    setWorkspace({ typeId });
  };

  const workspaceSequence = useMemo(() => {
    return documentDefinitions
      .filter((d) => d.id !== 'prescription' || prescriptionIncluded)
      .map((d) => ({ typeId: d.id, name: d.name }));
  }, [documentDefinitions, prescriptionIncluded]);

  const workspaceNext = useMemo(() => {
    if (!workspace) return null;
    const idx = workspaceSequence.findIndex((d) => d.typeId === workspace.typeId);
    if (idx < 0 || idx >= workspaceSequence.length - 1) return null;
    return workspaceSequence[idx + 1] ?? null;
  }, [workspace, workspaceSequence]);

  const handleMarkReviewed = (typeId: DocumentTypeId): boolean => {
    if (actionsLocked) {
      setWorkspace(null);
      setWorkspaceDirty(false);
      toast.error(actionsLockedMessage);
      return false;
    }
    setDocStates((prev) => {
      const next = prev.map((s) =>
        s.id === typeId
          ? {
              ...s,
              status: 'REVIEWED' as DocumentStatus,
              reviewedVersionId: s.versionId,
              reviewedAt: new Date().toISOString(),
            }
          : s,
      );
      const withReviews = {
        ...pkg,
        documentReviews: reviewsFromStates(next),
      };
      setPkg(withReviews);
      void persistPackage(withReviews);
      return next;
    });
    return true;
  };

  const advanceWorkspaceToNext = () => {
    if (!workspaceNext) {
      setWorkspace(null);
      setWorkspaceDirty(false);
      toast.success('Document review complete');
      return;
    }
    editRevisionBumped.current = false;
    setWorkspaceDirty(false);
    setWorkspace({ typeId: workspaceNext.typeId });
    toast.message(`Opening ${workspaceNext.name}`);
  };

  const handlePcpPatientInfoChange = useCallback(
    async (info: PatientDocumentInfo) => {
      const finalized = finalizePatientDocumentInfo({
        ...info,
        dateOfBirth: seedDocumentationDateOfBirth({
          storedDob: info.dateOfBirth,
          demographics: consultation.demographics ?? {},
          consultationDate,
        }),
      });
      setPatientInfo(finalized);
      writeConsultationDraft(consultation.id, 'DOCUMENTATION_PATIENT', finalized);
      patientFingerprintRef.current = patientInfoFingerprint(finalized);
      const current = pkgRef.current;
      const pcp: Record<string, string> = {
        ...(current.documents?.prescriber_communication ?? {}),
        patientName: finalized.name ?? '',
        patientDob: finalized.dateOfBirth ?? '',
        patientPhn: finalized.patientId ?? '',
        patientPhnNotAvailable: finalized.phnNotAvailable ? 'true' : '',
      };
      if (pcp.documentHtml) {
        pcp.documentHtml = upsertPcpPatientInformationHtml(
          pcp.documentHtml,
          pcpIdentityFromPatientInfo(finalized, pcp),
        );
      }
      const nextPkg = mergePatientInfo(
        {
          ...current,
          documents: {
            ...(current.documents ?? {}),
            prescriber_communication: pcp,
          },
        },
        finalized,
      );
      setPkg(nextPkg);
      await persistPackage(nextPkg);
    },
    [consultation.demographics, consultation.id, consultationDate, persistPackage],
  );

  const handleWorkspaceAutosave = useCallback(
    async (next: DocumentationPackage) => {
      let toSave = next;
      if (!editRevisionBumped.current) {
        toSave = bumpDocumentationRevision(next, 'manual_edit');
        editRevisionBumped.current = true;
      } else {
        toSave = {
          ...next,
          lastEditedAt: new Date().toISOString(),
        };
      }

      // Editing invalidates review for the open document only
      if (workspace) {
        const stamp = toSave.lastEditedAt ?? new Date().toISOString();
        const revision = toSave.revision ?? 1;
        const versionId = makeDocumentVersionId(
          workspace.typeId,
          revision,
          stamp,
        );
        setManuallyEditedIds((prev) => new Set(prev).add(workspace.typeId));
        setDocStates((prev) =>
          prev.map((s) =>
            s.id === workspace.typeId
              ? {
                  ...s,
                  status: 'UPDATED_REVIEW_REQUIRED' as DocumentStatus,
                  versionId,
                  reviewedVersionId: undefined,
                  reviewedAt: undefined,
                }
              : s,
          ),
        );
        toSave = {
          ...toSave,
          documentReviews: {
            ...(toSave.documentReviews ?? {}),
            [workspace.typeId]: {
              versionId,
              status: 'UPDATED_REVIEW_REQUIRED',
            },
          },
        };
      }

      setPkg(toSave);
      pkgRef.current = toSave;
      await persistPackage(toSave);
    },
    [persistPackage, workspace],
  );

  const handleCompleteAndDelete = async () => {
    const dap = pkg.documents?.consultation_note;
    const dapReviewReasons = dap?.dapValidationReasons ?? '';
    if (
      dap?.dapFollowUpIncomplete === 'true' ||
      /follow-up plan incomplete|confirmed follow-up missing from plan/i.test(
        dapReviewReasons,
      )
    ) {
      throw new Error(
        'Confirmed pharmacist follow-up is missing from the DAP Plan. Please review the follow-up plan before finalizing.',
      );
    }

    const rxRequired = consultationHasPrescription(consultation);
    const rxState = docStates.find((s) => s.id === 'prescription');
    const blocker = getPrescriptionCompletionBlocker({
      rxRequired,
      rxCreated: prescriptionIncluded,
      rxReviewed: Boolean(rxState && isDocumentReviewed(rxState)),
    });
    const blocked = prescriptionCompletionMessage(blocker);
    if (blocked) {
      throw new Error(blocked);
    }

    // Persist reviews only for docs that gate completion (exclude opted-out Rx
    // unless a prescription treatment makes Rx mandatory).
    const statesForComplete = docStates.filter(
      (s) => s.id !== 'prescription' || prescriptionIncluded || rxRequired,
    );
    const withReviews = {
      ...pkg,
      documentReviews: reviewsFromStates(statesForComplete),
    };
    await persistPackage(withReviews);
    await completeConsultation.mutateAsync({
      documentationConfirmed: true,
      clientRequestId: completeRequestIdRef.current,
    });

    purgeConsultationLocalState(consultation.id, {
      tenantId: faxStorageScope.tenantId,
      userId: faxStorageScope.userId,
    });

    // Start the next empty consult so Complete lands on a fresh wizard (CJ + guided).
    nextConsultationIdRef.current = null;
    try {
      const next = await createConsultation.mutateAsync();
      nextConsultationIdRef.current = next.id;
    } catch {
      nextConsultationIdRef.current = null;
    }
  };

  const handleCompletedNavigate = useCallback(() => {
    const nextId = nextConsultationIdRef.current;
    if (nextId) {
      toast.success('Consultation completed — starting a new one');
    } else {
      toast.success('Consultation completed');
    }
    onSubmitted(nextId ?? undefined);
  }, [onSubmitted]);

  const rxValidation = useMemo(
    () =>
      validatePrescriptionDocument({
        consultation,
        patientInfo,
        medications: pkg.documents?.prescription?.medications,
      }),
    [consultation, patientInfo, pkg.documents?.prescription?.medications],
  );

  const displayDefinitions = useMemo(
    () =>
      documentDefinitions.map((def) => {
        if (def.id !== 'prescription') return def;
        return {
          ...def,
          bullets: enrichPrescriptionBullets(
            def.bullets,
            rxValidation.medicationLabels,
          ),
        };
      }),
    [documentDefinitions, rxValidation.medicationLabels],
  );
  const displayCategories = getDocumentsByCategory(displayDefinitions);

  const activeDocStates = docStates.filter(
    (s) => s.id !== 'prescription' || prescriptionIncluded,
  );
  const rxRequired = consultationHasPrescription(consultation);
  const rxReviewed = isDocumentReviewed(
    docStates.find((s) => s.id === 'prescription') ?? {
      id: 'prescription',
      status: 'REVIEW_REQUIRED',
      versionId: '',
    },
  );
  const rxBlocker = getPrescriptionCompletionBlocker({
    rxRequired,
    rxCreated: prescriptionIncluded,
    rxReviewed,
  });
  const rxBlockMessage = prescriptionCompletionMessage(rxBlocker);

  const generatedCount = activeDocStates.filter(
    (s) =>
      s.status === 'REVIEW_REQUIRED' ||
      s.status === 'REVIEWED' ||
      s.status === 'UPDATED_REVIEW_REQUIRED' ||
      s.status === 'SOURCE_CHANGED' ||
      s.status === 'ready',
  ).length;
  const reviewedCount = activeDocStates.filter(isDocumentReviewed).length;
  const remainingReview =
    activeDocStates.filter((s) => !isDocumentReviewed(s)).length +
    (rxBlocker === 'create' ? 1 : 0);
  const totalDocs =
    documentDefinitions.filter(
      (d) => d.id !== 'prescription' || prescriptionIncluded || rxRequired,
    ).length;
  const isGenerating =
    phase === 'generating' ||
    generate.isPending ||
    activeDocStates.some(isDocumentCardGenerating);
  const showPreparingBanner = isGenerating && !patientGateLocked;
  const hasErrors = activeDocStates.some(
    (s) => s.status === 'GENERATION_FAILED' || s.status === 'error',
  );
  const hasSourceChanged = activeDocStates.some(
    (s) => s.status === 'SOURCE_CHANGED',
  );
  const canFinish =
    phase === 'ready' &&
    patientDetailsReady &&
    !isGenerating &&
    !hasErrors &&
    !hasSourceChanged &&
    totalDocs > 0 &&
    activeDocStates.every(isDocumentReviewed) &&
    !rxBlocker &&
    !dobActionsLocked;
  const canDownloadAll = canFinish;
  const finishing = completeConsultation.isPending;
  const footerHint = footerReviewHint(
    remainingReview,
    isGenerating,
    hasErrors,
    hasSourceChanged,
    rxBlocker,
  );

  return (
    <div className="documents-page mx-auto w-full max-w-none space-y-0 py-1 pb-6">
      <header className="documents-page-header mb-4 grid grid-cols-1 items-center gap-3 min-[641px]:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <p className="text-sm font-semibold text-[#0f7e99]">Step 6 of 6</p>
          <h1 className="documents-page-title mt-1 text-[26px] font-bold leading-[1.25] text-[#111827]">
            Consultation Documents
          </h1>
          <p className="documents-page-subtitle mt-[5px] text-[15px] leading-[1.45] text-[#58636f]">
            Review, finalize, and export the consultation documents.
          </p>
        </div>
        {phase === 'ready' && !isGenerating && (
          <DocumentProgressSummary
            generatedCount={Math.max(generatedCount, totalDocs)}
            reviewedCount={reviewedCount}
            totalCount={totalDocs}
          />
        )}
      </header>

      <DocumentsPatientInfoPanel
        className="mb-4"
        value={patientInfo}
        onDraftChange={persistPatientDraft}
        onSave={handlePatientInfoSave}
        onSkip={patientInfo.skipped ? undefined : () => void handlePatientInfoSkip()}
        saving={patientInfoSaving}
        disabled={showPreparingBanner}
        recordedAge={recordedAge}
        recordedAgeOrigin={recordedAgeResolved?.origin}
        consultationDate={consultationDate}
      />

      {patientGateLocked ? (
        <p className="mb-5 rounded-xl border border-[#c7dde2] bg-[#f6fbfb] px-4 py-3 text-[14px] text-[#3e4b55]">
          Save or skip patient details to unlock consultation documents.
        </p>
      ) : null}

      {showPreparingBanner && (
            <div className="mb-5 space-y-3 rounded-xl border border-[#c7dde2] bg-[#f6fbfb] px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <p className="flex items-center gap-2 text-sm font-medium text-[#25303b]">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-[#0f766e]" />
                  {documentationReadyCopy(generatedCount, Math.max(totalDocs, 1))}
                </p>
              </div>
              <Progress
                value={Math.round(
                  (generatedCount / Math.max(totalDocs, 1)) * 100,
                )}
                className="h-2"
              />
              {(prefetchBusy || currentGenerating) && (
                <p className="text-xs text-[#58636f]">
                  {prefetchBusy && !currentGenerating
                    ? 'Applying background drafts…'
                    : `Drafting ${currentGenerating}…`}
                </p>
              )}
            </div>
          )}

          {failed && phase === 'ready' && (
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-[#efc57f] bg-[#fff8eb] px-4 py-3 text-[13px] text-[#9a5600]">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div>
                <p className="font-semibold">
                  Drafted with fallback · pharmacist judgment required
                </p>
                <p className="mt-0.5 text-[#9a5600]/90">
                  Documents were compiled from consultation data. Review every
                  document carefully before finishing.
                </p>
              </div>
            </div>
          )}

          {displayCategories.map((group) => (
            <section key={group.key} className="mb-5">
              <h2 className="document-group-title mb-3 mt-1 text-[17px] font-bold leading-[1.35] text-[#111827]">
                {group.label}
              </h2>
              <div className="document-list grid gap-3">
                {group.docs.map((def) => {
                  const state = docStates.find((s) => s.id === def.id) ?? {
                    id: def.id,
                    status: 'REVIEW_REQUIRED' as DocumentStatus,
                    versionId: makeDocumentVersionId(def.id, 1),
                  };

                  if (def.id === 'prescription') {
                    return (
                      <PrescriptionDocumentCard
                        key={def.id}
                        def={def}
                        state={state}
                        included={prescriptionIncluded}
                        required={rxRequired}
                        creating={creatingPrescription}
                        generating={isDocumentCardGenerating(state)}
                        medicationLabel={rxValidation.medicationLabels[0]}
                        onCreate={() => void handleCreatePrescription(false)}
                        onReviewEdit={() => {
                          if (prescriptionIncluded) openWorkspace('prescription');
                          else void handleCreatePrescription(true);
                        }}
                        onPrint={() => void handlePrint(def.id)}
                        onDownload={() => handleDownload(def.id)}
                        onFax={() => handleOpenFax(def.id)}
                        actionsLocked={actionsLocked}
                        onLockedAction={() => {
                          toast.error(actionsLockedMessage);
                        }}
                      />
                    );
                  }

                  return (
                    <DocumentCard
                      key={def.id}
                      def={def}
                      state={state}
                      copied={copiedId === def.id}
                      generating={isDocumentCardGenerating(state)}
                      onReviewEdit={() => openWorkspace(def.id)}
                      onCopy={() => void handleCopy(def.id)}
                      onDownload={() => handleDownload(def.id)}
                      onPrint={() => void handlePrint(def.id)}
                      onFax={
                        isFaxablePrescribeDocument(def.id)
                          ? () => handleOpenFax(def.id)
                          : undefined
                      }
                      onRetry={() => handleRetryDocument(def.id)}
                      actionsLocked={actionsLocked}
                      onLockedAction={() => {
                        toast.error(actionsLockedMessage);
                      }}
                    />
                  );
                })}
              </div>
            </section>
          ))}

          {phase === 'ready' && (
            <DocumentReviewBanner
              remainingRequired={remainingReview}
              prescriptionBlocker={rxBlocker}
            />
          )}

          {phase === 'ready' && (
            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <button
                type="button"
                onClick={() => setConfirmRegenerate(true)}
                disabled={isGenerating || patientGateLocked}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#aebfc5] bg-white px-4 text-[14px] font-semibold text-[#111827] hover:bg-[#f7fafb] disabled:opacity-50"
              >
                <RotateCcw className="h-4 w-4" />
                Regenerate Documents
              </button>
              <button
                type="button"
                onClick={() => void handleDownloadAll()}
                disabled={downloadingAll || isGenerating || !canDownloadAll}
                className={cn(
                  'inline-flex min-h-12 items-center justify-center gap-2 rounded-lg px-5 text-[15px] font-bold',
                  canDownloadAll
                    ? 'bg-[#008CA4] text-white hover:bg-[#007a8f]'
                    : 'cursor-not-allowed border border-[#d4dade] bg-[#eef1f2] text-[#9aa4aa]',
                )}
                title={
                  actionsLocked
                    ? actionsLockedMessage
                    : canDownloadAll
                      ? 'Download all documents to your Downloads folder'
                      : 'Review all documents before downloading'
                }
              >
                {downloadingAll ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                Download all documents
              </button>
            </div>
          )}

          {phase === 'ready' ? <DocumentsPrivacyFooter /> : null}

          <div className="documents-footer mt-5 grid grid-cols-1 items-center gap-4 border-t border-[#d5e2e6] pt-4 min-[901px]:grid-cols-[minmax(190px,1fr)_minmax(220px,auto)_minmax(300px,1fr)]">
            <button
              type="button"
              onClick={onBack}
              className="footer-button inline-flex min-h-[50px] items-center justify-center gap-2 rounded-[9px] border border-[#aebfc5] bg-white px-[18px] text-[15px] font-semibold text-[#25303b] hover:bg-[#f7fafb]"
            >
              <ArrowLeft className="h-4 w-4" />
              {backLabel}
            </button>

            <p
              className="text-center text-[13px] text-[#66727d]"
              aria-live="polite"
            >
              {footerHint ?? ''}
            </p>

            <div className="documents-footer-right flex flex-col gap-2.5 sm:flex-row sm:justify-end">
              <FinishConsultationButton
                disabled={!canFinish}
                loading={finishing}
                blockedReason={
                  patientGateLocked
                    ? patientGateLockedMessage
                    : dobActionsLocked
                      ? dobActionsLockedMessage
                      : rxBlockMessage ?? footerHint
                }
                onClick={() => {
                  if (actionsLocked) {
                    toast.error(actionsLockedMessage);
                    return;
                  }
                  if (rxBlockMessage) {
                    toast.error(rxBlockMessage);
                    return;
                  }
                  if (!canFinish) return;
                  setCompleteOpen(true);
                }}
              />
            </div>
          </div>

      {workspace && (
        <DocumentWorkspaceDialog
          open={Boolean(workspace)}
          typeId={workspace.typeId}
          definition={documentDefinitions.find((d) => d.id === workspace.typeId)}
          pkg={pkg}
          consultation={consultation}
          patientInfo={patientInfo}
          onClose={() => {
            setWorkspace(null);
            setWorkspaceDirty(false);
          }}
          onAutosave={handleWorkspaceAutosave}
          onPatientInfoChange={handlePcpPatientInfoChange}
          onDirtyChange={setWorkspaceDirty}
          isReviewed={isDocumentReviewed(
            docStates.find((s) => s.id === workspace.typeId) ?? {
              id: workspace.typeId,
              status: 'REVIEW_REQUIRED',
              versionId: '',
            },
          )}
          onMarkReviewed={() => handleMarkReviewed(workspace.typeId)}
          nextDocument={workspaceNext}
          onAdvanceToNext={advanceWorkspaceToNext}
          nestedOpen={Boolean(faxTypeId)}
        />
      )}

      {faxTypeId && isFaxablePrescribeDocument(faxTypeId) ? (
        <SendFaxDialog
          open
          documentName={
            documentDefinitions.find((d) => d.id === faxTypeId)?.name ?? 'Document'
          }
          storageScope={faxStorageScope}
          submitting={sendFax.isPending}
          onClose={() => {
            if (!sendFax.isPending) setFaxTypeId(null);
          }}
          onSubmit={async (values) => {
            await handleSendCardFax(values);
            setFaxTypeId(null);
          }}
        />
      ) : null}

      <RegenerateDocumentsDialog
        open={confirmRegenerate}
        onOpenChange={setConfirmRegenerate}
        definitions={documentDefinitions.filter(
          (d) => d.id !== 'prescription' || prescriptionIncluded,
        )}
        manuallyEditedIds={manuallyEditedIds}
        editorDirty={workspaceDirty}
        loading={isGenerating}
        onConfirm={confirmAndRegenerate}
      />

      <CompleteConsultationModal
        open={completeOpen && !rxBlocker}
        consultationId={consultation.id}
        deletionDeadline={consultation.deletionDeadline}
        onClose={() => setCompleteOpen(false)}
        onConfirmDelete={handleCompleteAndDelete}
        onCompleted={handleCompletedNavigate}
      />
    </div>
  );
}
