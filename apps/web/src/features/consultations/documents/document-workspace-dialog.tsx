'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ClipboardCopy,
  Cloud,
  CloudOff,
  FileText,
  Globe,
  Loader2,
  Printer,
  Send,
  Sparkles,
  AlertTriangle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useBlockParentDialogClose } from '@/components/ui/nested-dialog-dismiss';
import { cn } from '@/lib/utils';
import { usesClinicalJudgmentDap, type Consultation } from '../types';
import { useSendConsultationFax, useTranslatePatientHandout } from '../hooks';
import { useAuthStore } from '@/features/auth/auth-store';
import { getDocumentDefinition } from './document-definitions';
import { isFaxablePrescribeDocument } from './document-keys';
import { mergePcpCommunicationFields, PCP_LETTER_TITLE } from './pcp-format';
import { applyDapAttestationToFields, DAP_NOTE_TITLE } from './dap-note-format';
import {
  applyPrescriptionEdits,
  formatPrescriptionRxTitle,
  generatePrescriptionContent,
  isPrescriptionPatientStub,
  prescriptionMedicationsLookLegacy,
  prescriptionToEditableFields,
  upsertPrescriptionRxTitlesPlain,
} from './generators/prescription-generator';
import {
  isRtlHandoutLanguage,
  mergePatientHandoutFields,
  normalizeHandoutLanguage,
} from './handout-format';
import { generatePatientHandoutFields } from './generators/patient-handout-generator';
import { generatePcpCommunicationFields } from './generators/pcp-communication-generator';
import { PcpPatientInformationCard } from './pcp-patient-information-card';
import {
  assemblePcpWorkspaceHtml,
  pcpEditorBodyHtml,
  pcpIdentityFromPatientInfo,
} from './pcp-patient-information';
import {
  handoutLanguagesPhase1,
  handoutLanguagesPhase2,
  handoutLanguageMenuLabel,
  handoutTranslationBanner,
} from '@safescript/shared';
import { NotionDocumentEditor } from './notion-document-editor';
import {
  DOCUMENT_HTML_KEY,
  fieldsToNotionHtml,
  notionHtmlToFields,
} from './notion-document-model';
import { copyDocumentToClipboard } from './copy-document-text';
import {
  blobToBase64,
  buildPdfContext,
  generateDocumentPdf,
  openPdfForPrint,
} from './pdf-generator';
import { printPatientHandout } from './print-handout';
import { SendFaxDialog } from './send-fax-dialog';
import { toast } from '@/lib/notify';
import { toastError } from '@/lib/errors';
import type {
  DocumentationPackage,
  DocumentMeta,
  DocumentTypeId,
  PatientDocumentInfo,
} from './types';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

interface Props {
  open: boolean;
  typeId: DocumentTypeId;
  definition?: DocumentMeta;
  pkg: DocumentationPackage;
  consultation: Consultation;
  patientInfo: PatientDocumentInfo;
  onClose: () => void;
  onAutosave: (next: DocumentationPackage) => Promise<void>;
  onPatientInfoChange?: (info: PatientDocumentInfo) => void | Promise<void>;
  isReviewed?: boolean;
  onMarkReviewed?: () => boolean | void | Promise<boolean | void>;
  /** Next document in the review sequence (null = this is the last). */
  nextDocument?: { typeId: DocumentTypeId; name: string } | null;
  /** Advance workspace to the next document after marking reviewed. */
  onAdvanceToNext?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  /** True when a sibling dialog (card-level Send fax) is open over this preview. */
  nestedOpen?: boolean;
}

const AUTOSAVE_MS = 700;

/**
 * Notion-like TipTap document workspace — one continuous editable page.
 * Structured PDF fields are derived from the document HTML on save.
 */
export function DocumentWorkspaceDialog({
  open,
  typeId,
  definition,
  pkg,
  consultation,
  patientInfo,
  onClose,
  onAutosave,
  onPatientInfoChange,
  isReviewed = false,
  onMarkReviewed,
  nextDocument = null,
  onAdvanceToNext,
  onDirtyChange,
  nestedOpen = false,
}: Props) {
  const def = definition ?? getDocumentDefinition(typeId);
  const translateHandout = useTranslatePatientHandout(consultation.id);
  const sendFax = useSendConsultationFax(consultation.id);
  const authUser = useAuthStore((s) => s.user);
  const canFax = isFaxablePrescribeDocument(typeId);
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

  const currentFields = useMemo(() => {
    const docs = pkg.documents ?? {};
    if (typeId === 'prescription') {
      const generated = generatePrescriptionContent(consultation, patientInfo);
      const raw = prescriptionToEditableFields(docs.prescription);
      const rxTitles = (generated.medications ?? []).map((m) =>
        formatPrescriptionRxTitle(m),
      );
      const livePatient =
        generated.patientBlock?.trim() &&
        !isPrescriptionPatientStub(generated.patientBlock)
          ? generated.patientBlock
          : raw.patientBlock?.trim() && !isPrescriptionPatientStub(raw.patientBlock)
            ? raw.patientBlock
            : generated.patientBlock || raw.patientBlock || '';

      // Rebuild auto-generated SIGs that still show bare counts ("1, BID")
      // until the pharmacist has reviewed. Reviewed documents keep TipTap edits.
      const looksLegacySig = prescriptionMedicationsLookLegacy(
        docs.prescription?.medications,
      );
      const htmlHasPatientStub =
        Boolean(raw.documentHtml?.trim()) &&
        />(\s*)Patient(\s*)</i.test(raw.documentHtml ?? '');
      const refreshMedBlock =
        !isReviewed &&
        Boolean(generated.medicationBlock?.trim()) &&
        (!raw.medicationBlock?.trim() || looksLegacySig);
      const dropStaleHtml =
        refreshMedBlock ||
        htmlHasPatientStub ||
        isPrescriptionPatientStub(raw.patientBlock);

      const next: Record<string, string> = {
        ...raw,
        patientBlock: livePatient,
        medicationBlock: upsertPrescriptionRxTitlesPlain(
          refreshMedBlock
            ? generated.medicationBlock || ''
            : raw.medicationBlock || generated.medicationBlock || '',
          rxTitles,
        ),
        rxTitles: rxTitles.join('\n'),
      };
      if (dropStaleHtml) {
        // Drop stale TipTap HTML so the editor rebuilds from upgraded fields.
        delete next.documentHtml;
      }
      return next;
    }
    const raw = (docs[typeId] ?? {}) as Record<string, string>;
    if (typeId === 'patient_care_summary') {
      const generated = generatePatientHandoutFields(consultation, patientInfo, {
        language: normalizeHandoutLanguage(raw.handoutLanguage),
      });
      return mergePatientHandoutFields(raw, generated);
    }
    if (typeId === 'consultation_note') {
      return applyDapAttestationToFields(raw, consultation);
    }
    if (typeId === 'prescriber_communication') {
      return mergePcpCommunicationFields(
        raw,
        generatePcpCommunicationFields(consultation, patientInfo),
      );
    }
    return raw;
  }, [consultation, isReviewed, patientInfo, pkg.documents, typeId]);

  const isHandout = typeId === 'patient_care_summary';
  const isPcp = typeId === 'prescriber_communication';
  const isDap = typeId === 'consultation_note';
  const isRx = typeId === 'prescription';
  const canCopy = !isRx && !isHandout;
  const canPrint = isRx || isHandout;
  const pcpFollowUpIncomplete = isPcp && currentFields.pcpFollowUpIncomplete === 'true';
  const isCjDap = isDap && usesClinicalJudgmentDap(consultation);
  const handoutLanguage = normalizeHandoutLanguage(
    currentFields.handoutLanguage,
  );
  const translationBanner =
    isHandout && !isReviewed ? handoutTranslationBanner(currentFields) : null;
  const editorTitle = isHandout
    ? currentFields.documentTitle?.trim() || 'Your Care Plan'
    : isPcp
      ? currentFields.documentTitle?.trim() || PCP_LETTER_TITLE
      : isDap
        ? currentFields.documentTitle?.trim() || DAP_NOTE_TITLE
        : def.name;

  const initialHtml = useMemo(() => {
    const full = fieldsToNotionHtml(typeId, currentFields, editorTitle);
    return isPcp ? pcpEditorBodyHtml(full) : full;
  }, [typeId, currentFields, editorTitle, isPcp]);

  const [html, setHtml] = useState(initialHtml);
  const [dirty, setDirty] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [marking, setMarking] = useState(false);
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);
  const [languageBusy, setLanguageBusy] = useState(false);
  const [formatToolbarOpen, setFormatToolbarOpen] = useState(false);
  const [faxOpen, setFaxOpen] = useState(false);
  const [printing, setPrinting] = useState(false);
  const { shouldBlock: shouldBlockPreviewClose, arm: armPreviewCloseHold } =
    useBlockParentDialogClose(faxOpen || sendFax.isPending || printing || nestedOpen);

  const closeFaxDialog = () => {
    if (sendFax.isPending) return;
    armPreviewCloseHold();
    setFaxOpen(false);
  };

  const htmlRef = useRef(html);
  const savingRef = useRef(false);
  const latestPkgRef = useRef(pkg);
  const counsellingHydratedRef = useRef(false);
  const rxHydratedRef = useRef(false);

  useEffect(() => {
    latestPkgRef.current = pkg;
  }, [pkg]);

  useEffect(() => {
    htmlRef.current = html;
  }, [html]);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  // Remount editor when opening / switching documents
  useEffect(() => {
    if (!open) return;
    setHtml(initialHtml);
    htmlRef.current = initialHtml;
    setDirty(false);
    setSaveStatus('idle');
    setMarking(false);
    setCopied(false);
    setCopying(false);
    setFormatToolbarOpen(false);
    setFaxOpen(false);
    setPrinting(false);
    setEditorEpoch((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed from open/type only
  }, [open, typeId]);

  // Persist confirmed counselling cards when a saved draft omitted them.
  useEffect(() => {
    if (!open) {
      counsellingHydratedRef.current = false;
      return;
    }
    if (typeId !== 'patient_care_summary' || counsellingHydratedRef.current) return;
    const raw = (pkg.documents?.patient_care_summary ?? {}) as Record<string, string>;
    const counsellingKeys = [
      'expectedResponse',
      'selfCare',
      'seekCare',
      'followUp',
    ] as const;
    const filledMissing = counsellingKeys.some(
      (key) => !raw[key]?.trim() && currentFields[key]?.trim(),
    );
    const htmlPatched =
      Boolean(currentFields.documentHtml?.trim()) &&
      currentFields.documentHtml !== raw.documentHtml;
    if (!filledMissing && !htmlPatched) return;
    counsellingHydratedRef.current = true;
    void onAutosave({
      ...latestPkgRef.current,
      documents: {
        ...(latestPkgRef.current.documents ?? {}),
        patient_care_summary: currentFields,
      },
    });
  }, [currentFields, onAutosave, open, pkg.documents?.patient_care_summary, typeId]);

  // Upgrade legacy Rx stubs ("Patient", "1, BID") into the saved package for PDF/print.
  useEffect(() => {
    if (!open) {
      rxHydratedRef.current = false;
      return;
    }
    if (typeId !== 'prescription' || rxHydratedRef.current || isReviewed) return;
    const existing = pkg.documents?.prescription;
    const looksLegacy = prescriptionMedicationsLookLegacy(existing?.medications);
    const patientStub =
      isPrescriptionPatientStub(existing?.patientBlock) ||
      Boolean(
        existing &&
          'documentHtml' in existing &&
          />(\s*)Patient(\s*)</i.test(
            String((existing as { documentHtml?: string }).documentHtml ?? ''),
          ),
      );
    if (!looksLegacy && !patientStub) return;
    if (!currentFields.medicationBlock?.trim() && !currentFields.patientBlock?.trim()) {
      return;
    }
    rxHydratedRef.current = true;
    const generated = generatePrescriptionContent(consultation, patientInfo);
    const nextRx = {
      ...(existing ?? {}),
      diagnosis: existing?.diagnosis?.trim() || generated.diagnosis,
      notes: existing?.notes?.trim() || generated.notes,
      specialInstructions:
        existing?.specialInstructions?.trim() || generated.specialInstructions,
      patientBlock: currentFields.patientBlock || generated.patientBlock,
      medicationBlock: looksLegacy
        ? currentFields.medicationBlock || generated.medicationBlock
        : existing?.medicationBlock || currentFields.medicationBlock,
      medications: looksLegacy
        ? generated.medications
        : existing?.medications ?? generated.medications,
      sigBlock: looksLegacy
        ? generated.sigBlock
        : existing?.sigBlock || generated.sigBlock,
      [DOCUMENT_HTML_KEY]: htmlRef.current,
    };
    const nextPkg = {
      ...latestPkgRef.current,
      documents: {
        ...(latestPkgRef.current.documents ?? {}),
        prescription: nextRx,
      },
    };
    latestPkgRef.current = nextPkg;
    void onAutosave(nextPkg);
  }, [
    consultation,
    currentFields.medicationBlock,
    currentFields.patientBlock,
    isReviewed,
    onAutosave,
    open,
    pkg.documents?.prescription,
    patientInfo,
    typeId,
  ]);

  const buildPackage = useCallback(
    (nextHtml: string): DocumentationPackage => {
      const base = latestPkgRef.current;
      const parsed = notionHtmlToFields(typeId, nextHtml);

      if (typeId === 'prescription') {
        const existing = base.documents?.prescription;
        const generated = generatePrescriptionContent(consultation, patientInfo);
        const upgradeBase =
          !isReviewed && prescriptionMedicationsLookLegacy(existing?.medications)
            ? {
                ...(existing ?? {}),
                medications: generated.medications,
                medicationBlock:
                  currentFields.medicationBlock || generated.medicationBlock,
                patientBlock: currentFields.patientBlock || generated.patientBlock,
              }
            : existing;
        return {
          ...base,
          documents: {
            ...(base.documents ?? {}),
            prescription: {
              ...applyPrescriptionEdits(upgradeBase, {
                ...currentFields,
                ...parsed,
              }),
              [DOCUMENT_HTML_KEY]: nextHtml,
            } as ReturnType<typeof applyPrescriptionEdits> & {
              documentHtml?: string;
            },
          },
        };
      }

      if (typeId === 'prescriber_communication') {
        const assembled = assemblePcpWorkspaceHtml({
          title: currentFields.documentTitle?.trim() || PCP_LETTER_TITLE,
          identity: pcpIdentityFromPatientInfo(patientInfo, currentFields),
          headerBlock: currentFields.headerBlock || parsed.headerBlock || '',
          bodyHtml: nextHtml,
        });
        return {
          ...base,
          patientInfo,
          documents: {
            ...(base.documents ?? {}),
            prescriber_communication: {
              ...currentFields,
              ...parsed,
              headerBlock: parsed.headerBlock?.trim() || currentFields.headerBlock || '',
              patientName: patientInfo.name ?? currentFields.patientName ?? '',
              patientDob: patientInfo.dateOfBirth ?? currentFields.patientDob ?? '',
              patientPhn: patientInfo.patientId ?? currentFields.patientPhn ?? '',
              patientPhnNotAvailable: patientInfo.phnNotAvailable ? 'true' : '',
              [DOCUMENT_HTML_KEY]: assembled,
            },
          },
        };
      }

      return {
        ...base,
        documents: {
          ...(base.documents ?? {}),
          [typeId]: {
            ...currentFields,
            ...parsed,
            ...(typeId === 'patient_care_summary'
              ? { handoutLanguage: currentFields.handoutLanguage }
              : {}),
            [DOCUMENT_HTML_KEY]: nextHtml,
          },
        },
      };
    },
    [consultation, currentFields, isReviewed, patientInfo, typeId],
  );

  const flushSave = useCallback(async () => {
    if (!dirty || savingRef.current) return;
    savingRef.current = true;
    setSaveStatus('saving');
    try {
      await onAutosave(buildPackage(htmlRef.current));
      setDirty(false);
      setSaveStatus('saved');
    } catch {
      setSaveStatus('error');
    } finally {
      savingRef.current = false;
    }
  }, [buildPackage, dirty, onAutosave]);

  const handleCopyDocument = useCallback(async () => {
    if (copying || !canCopy) return;
    setCopying(true);
    try {
      if (dirty) await flushSave();
      await copyDocumentToClipboard(typeId, buildPackage(htmlRef.current));
      setCopied(true);
      toast.success('Copied to clipboard', { announce: true });
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Could not copy to clipboard');
    } finally {
      setCopying(false);
    }
  }, [buildPackage, canCopy, copying, dirty, flushSave, typeId]);

  const buildLivePdfBlob = useCallback(async () => {
    if (dirty) await flushSave();
    const nextPkg = buildPackage(htmlRef.current);
    const ctx = buildPdfContext(consultation, patientInfo);
    const blob = await generateDocumentPdf(typeId, nextPkg, ctx, def.pdfLayout);
    if (!blob.size) {
      throw new Error('This document is empty');
    }
    return blob;
  }, [
    buildPackage,
    consultation,
    def.pdfLayout,
    dirty,
    flushSave,
    patientInfo,
    typeId,
  ]);

  const handlePrintDocument = useCallback(async () => {
    if (printing) return;
    setPrinting(true);
    try {
      if (isHandout) {
        // Patient handouts need Unicode-capable browser print (not jsPDF).
        // jsPDF's built-in Helvetica is Latin-only and corrupts Indic, Arabic,
        // CJK, and other non-Latin scripts (shows "$A9>!@" instead of text).
        // We use the browser's Chromium engine with Noto Sans multilingual fonts.
        if (dirty) await flushSave();
        const dir = isRtlHandoutLanguage(handoutLanguage) ? 'rtl' : 'ltr';
        await printPatientHandout(htmlRef.current, handoutLanguage, dir);
      } else {
        const blob = await buildLivePdfBlob();
        openPdfForPrint(blob);
      }
    } catch (err) {
      toastError(err, `${def.name} could not be printed. Try again.`);
    } finally {
      setPrinting(false);
    }
  }, [buildLivePdfBlob, def.name, dirty, flushSave, handoutLanguage, isHandout, printing]);

  const handleSubmitFax = useCallback(
    async (values: { recipientName: string; faxNumber: string }) => {
      const blob = await buildLivePdfBlob();
      const pdfBase64 = await blobToBase64(blob);
      await sendFax.mutateAsync({
        recipientName: values.recipientName,
        faxNumber: values.faxNumber,
        documentTypeId: typeId,
        documentName: def.name,
        pdfBase64,
      });
      toast.success(
        `Fax submitted to ${values.recipientName}. Delivery is confirmed when the recipient receives it.`,
        { announce: true },
      );
    },
    [buildLivePdfBlob, def.name, sendFax, typeId],
  );

  useEffect(() => {
    if (!open || !dirty) return;
    const timer = window.setTimeout(() => {
      void flushSave();
    }, AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [html, dirty, flushSave, open]);

  const handleHtmlChange = useCallback((next: string) => {
    setHtml(next);
    htmlRef.current = next;
    setDirty(true);
    setSaveStatus('idle');
  }, []);

  const handlePcpPatientChange = useCallback(
    (next: PatientDocumentInfo) => {
      void onPatientInfoChange?.(next);
    },
    [onPatientInfoChange],
  );

  const handleHandoutLanguageChange = useCallback(
    async (language: string) => {
      if (!isHandout || language === handoutLanguage || languageBusy) return;
      setLanguageBusy(true);
      try {
        if (dirty) await flushSave();
        const translated = await translateHandout.mutateAsync(language);
        const generated = translated.fields;
        const next: DocumentationPackage = {
          ...latestPkgRef.current,
          documents: {
            ...(latestPkgRef.current.documents ?? {}),
            patient_care_summary: generated,
          },
        };
        latestPkgRef.current = next;
        await onAutosave(next);
        const nextHtml = fieldsToNotionHtml(
          'patient_care_summary',
          generated,
          generated.documentTitle || 'Your Care Plan',
        );
        setHtml(nextHtml);
        htmlRef.current = nextHtml;
        setDirty(false);
        setEditorEpoch((n) => n + 1);
        setSaveStatus('saved');
      } catch {
        setSaveStatus('error');
      } finally {
        setLanguageBusy(false);
      }
    },
    [
      dirty,
      flushSave,
      handoutLanguage,
      isHandout,
      languageBusy,
      onAutosave,
      translateHandout,
    ],
  );

  const handleClose = async () => {
    if (dirty) await flushSave();
    onClose();
  };

  const handleSaveAndMarkReviewed = async () => {
    if (marking) return;

    // Already reviewed — skip ahead or close
    if (isReviewed) {
      if (nextDocument && onAdvanceToNext) onAdvanceToNext();
      else await handleClose();
      return;
    }

    if (!onMarkReviewed) return;
    setMarking(true);
    try {
      if (dirty) await flushSave();
      const marked = await onMarkReviewed();
      if (marked === false) return;
      if (nextDocument && onAdvanceToNext) {
        onAdvanceToNext();
      } else {
        await handleClose();
      }
    } finally {
      setMarking(false);
    }
  };

  const primaryLabel = (() => {
    if (marking) return null;
    if (isReviewed) {
      return nextDocument ? `Next: ${nextDocument.name}` : 'Done';
    }
    return nextDocument ? 'Mark reviewed & continue' : 'Mark reviewed & finish';
  })();


  return (
    <>
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) {
          if (shouldBlockPreviewClose()) return;
          void handleClose();
        }
      }}
    >
      <DialogContent
        className="flex h-[min(94vh,960px)] w-[min(96vw,900px)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:rounded-2xl"
        onPointerDownOutside={(e) => {
          if (shouldBlockPreviewClose()) e.preventDefault();
        }}
        onInteractOutside={(e) => {
          if (shouldBlockPreviewClose()) e.preventDefault();
        }}
        onFocusOutside={(e) => {
          if (shouldBlockPreviewClose()) e.preventDefault();
        }}
        onEscapeKeyDown={(e) => {
          if (shouldBlockPreviewClose()) e.preventDefault();
        }}
      >
        <DialogHeader className="shrink-0 space-y-0 border-b border-border px-4 py-3 pr-12 sm:px-5 sm:pr-14">
          <div className="flex flex-col gap-2.5">
            <DialogTitle className="flex min-w-0 items-center gap-2 text-base font-semibold">
              <FileText className="h-4 w-4 shrink-0 text-primary" />
              <span className="truncate">{def.name}</span>
            </DialogTitle>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {isHandout ? (
                <label className="flex min-w-0 items-center gap-2 text-[12px] text-[#3e4b55]">
                  <Globe className="h-3.5 w-3.5 shrink-0 text-[#5b6b76]" />
                  <span className="shrink-0 font-medium">Language</span>
                  <div className="w-[min(100%,16.5rem)] min-w-[11rem] shrink-0">
                    <Select
                      value={handoutLanguage}
                      disabled={languageBusy}
                      onChange={(e) => void handleHandoutLanguageChange(e.target.value)}
                      options={handoutLanguagesPhase1().map((o) => ({
                        value: o.value,
                        label: handoutLanguageMenuLabel(o),
                      }))}
                      groups={[
                        {
                          label: 'More languages',
                          options: handoutLanguagesPhase2().map((o) => ({
                            value: o.value,
                            label: handoutLanguageMenuLabel(o),
                          })),
                        },
                      ]}
                      className="h-9 w-full rounded-[10px]"
                      aria-label="Patient handout language"
                    />
                  </div>
                  {languageBusy ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-[#5b6b76]">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Translating…
                    </span>
                  ) : null}
                </label>
              ) : null}

              <div className="ml-auto flex shrink-0 items-center gap-2 whitespace-nowrap">
                <SaveIndicator status={saveStatus} dirty={dirty} />
                {canCopy ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5 px-3"
                    onClick={() => void handleCopyDocument()}
                    disabled={copying || languageBusy}
                    title="Copy this document"
                  >
                    {copying ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : copied ? (
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                    ) : (
                      <ClipboardCopy className="h-3.5 w-3.5" />
                    )}
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                ) : null}
                {canPrint ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5 px-3"
                    onClick={() => void handlePrintDocument()}
                    disabled={printing || languageBusy || sendFax.isPending}
                    title={`Print ${def.name}`}
                  >
                    {printing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Printer className="h-3.5 w-3.5" />
                    )}
                    Print
                  </Button>
                ) : null}
                {canFax ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5 px-3"
                    onClick={() => setFaxOpen(true)}
                    disabled={languageBusy || sendFax.isPending || printing}
                    title={`Fax ${def.name}`}
                  >
                    {sendFax.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    Fax
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
          <DialogDescription className="mt-1.5 text-left text-xs">
            {isHandout
              ? 'This is the patient take-home care plan. Changing language translates confirmed counselling through Google Cloud Translation. Medication names and numbers stay exactly as confirmed. Print uses this same edited document.'
              : isPcp
                ? 'This is the pharmacist-to-PCP letter. Copy or fax uses this same edited document. Empty sections are omitted; the closing sentence stays fixed.'
                : isDap
                ? isCjDap
                  ? 'This is the pharmacist DAP consultation note from the clinical impression. Copy uses this same edited document. Empty sections are omitted.'
                  : 'This is the pharmacist DAP consultation note. Copy uses this same edited document. Empty sections are omitted.'
                  : isRx
                    ? 'This is the prescription. Print or fax uses this same edited document. Patient details stay in sync with Patient Information.'
                    : 'Edit in place — changes save automatically. Mark reviewed to move to the next document, or close anytime with ✕.'}
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto bg-[#f3f5f6] dark:bg-muted/20">
          {translationBanner ? (
            <div
              role="status"
              className={cn(
                'mx-auto mt-4 flex w-full max-w-[740px] items-start gap-2 rounded-lg border px-3.5 py-2.5 text-[12.5px]',
                translationBanner.tone === 'fallback'
                  ? 'border-[#efc57f] bg-[#fff8eb] text-[#9a5600]'
                  : translationBanner.tone === 'stale'
                    ? 'border-[#efc57f] bg-[#fff8eb] text-[#9a5600]'
                    : 'border-[#c7dde2] bg-[#f6fbfb] text-[#0f6f6b]',
              )}
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-2">
                <p className="font-semibold">{translationBanner.message}</p>
                {translationBanner.tone !== 'review' ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-8"
                    disabled={languageBusy}
                    onClick={() =>
                      void handleHandoutLanguageChange(
                        currentFields.requestedHandoutLanguage || handoutLanguage,
                      )
                    }
                  >
                    Refresh translation
                  </Button>
                ) : null}
              </div>
            </div>
          ) : null}
          {pcpFollowUpIncomplete ? (
            <div
              role="status"
              className="mx-auto mt-4 flex w-full max-w-[740px] items-start gap-2 rounded-lg border border-[#efc57f] bg-[#fff8eb] px-3.5 py-2.5 text-[12.5px] text-[#9a5600]"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p className="font-semibold">
                Follow-up plan incomplete. Confirm who will follow up, when
                follow-up will occur, and what will be assessed.
              </p>
            </div>
          ) : null}
          <div className="mx-auto mt-4 flex w-full max-w-[740px] items-start gap-2 rounded-lg border border-[#c7dde2] bg-[#f6fbfb] px-3.5 py-2.5 text-[12.5px] text-[#3e4b55]">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0f766e]" />
            <p>
              <span className="font-semibold text-[#0f6f6b]">
                {isHandout
                  ? 'Built from confirmed treatment and counselling · pharmacist reviews.'
                  : isPcp
                    ? 'Brief continuity-of-care letter · pharmacist reviews.'
                    : isDap
                      ? isCjDap
                        ? 'Clinical impression DAP note · pharmacist reviews.'
                        : 'Guided Pathway DAP note · pharmacist reviews.'
                      : isRx
                        ? 'Prescription from confirmed treatments · pharmacist reviews.'
                        : 'Drafted · pharmacist reviews.'}
              </span>{' '}
              {isHandout
                ? 'Empty sections are omitted. Treatment uses the confirmed name and directions. Print uses this same page.'
                  : isPcp
                    ? 'Medication names, directions, and follow-up come from confirmed pharmacist data. Empty sections are omitted. Copy uses this same letter.'
                  : isDap
                    ? 'Data, Assessment, and Plan stay easy to find. Copy uses this same note.'
                    : isRx
                      ? 'Use the toolbar or select text to format. Print or fax this same page after review.'
                    : 'Use the toolbar or select text to format. Mark reviewed when ready.'}
            </p>
          </div>

          <article
            className={cn(
              'mx-auto my-4 w-full max-w-[740px] rounded-xl border border-[#e2eaed] bg-white px-5 py-6 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_28px_rgba(16,24,40,0.06)] sm:my-6 sm:px-12 sm:py-10',
              'dark:border-border/50 dark:bg-card dark:shadow-none',
            )}
          >
            {isPcp ? (
              <>
                <h1 className="mb-4 mt-0 text-[1.7rem] font-bold leading-[1.25] tracking-[-0.025em] text-[#111827]">
                  {editorTitle}
                </h1>
                <PcpPatientInformationCard
                  patientInfo={patientInfo}
                  letterDate={currentFields.headerBlock}
                  onChange={handlePcpPatientChange}
                  formatToolbarOpen={formatToolbarOpen}
                  onToggleFormatToolbar={() => setFormatToolbarOpen((open) => !open)}
                />
              </>
            ) : null}
            {open ? (
              <NotionDocumentEditor
                editorKey={`${typeId}:${editorEpoch}`}
                initialHtml={html}
                onChange={handleHtmlChange}
                dir={isHandout && isRtlHandoutLanguage(handoutLanguage) ? 'rtl' : 'ltr'}
                lang={isHandout ? handoutLanguage : undefined}
                collapsibleToolbar
                toolbarOpen={formatToolbarOpen}
                onToolbarOpenChange={setFormatToolbarOpen}
                showToolbarToggle={!isPcp}
                editorClassName={
                  isDap
                    ? 'notion-doc-prose--dap'
                    : isRx
                      ? 'notion-doc-prose--rx'
                      : undefined
                }
              />
            ) : null}
          </article>
        </div>

        <div className="shrink-0 border-t border-[#d5e2e6] bg-white px-4 py-3.5 sm:px-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
            <div className="flex flex-wrap items-center justify-end gap-2">
              {nextDocument ? (
                <p className="mr-1 hidden text-[12px] text-muted-foreground sm:block">
                  Next up · {nextDocument.name}
                </p>
              ) : null}
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="inline-flex">
                      <Button
                        type="button"
                        className="h-11 min-w-[188px] bg-[#0f817c] hover:bg-[#0c6f6b]"
                        disabled={marking || (!isReviewed && !onMarkReviewed)}
                        onClick={() => void handleSaveAndMarkReviewed()}
                      >
                        {marking ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving…
                          </>
                        ) : (
                          primaryLabel
                        )}
                      </Button>
                    </span>
                  </TooltipTrigger>
                  {!isReviewed ? (
                    <TooltipContent side="top" className="max-w-[280px] text-center">
                      I have reviewed this document for clinical accuracy and completeness.
                    </TooltipContent>
                  ) : null}
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    {canFax ? (
      <SendFaxDialog
        open={faxOpen}
        documentName={def.name}
        storageScope={faxStorageScope}
        submitting={sendFax.isPending}
        onClose={closeFaxDialog}
        onSubmit={async (values) => {
          try {
            await handleSubmitFax(values);
            armPreviewCloseHold();
            setFaxOpen(false);
          } catch (err) {
            toastError(err, 'The fax could not be sent. Try again or print the document.');
            throw err;
          }
        }}
      />
    ) : null}
    </>
  );
}

function SaveIndicator({ status, dirty }: { status: SaveStatus; dirty: boolean }) {
  if (status === 'saving') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Saving…
      </span>
    );
  }
  if (status === 'saved' && !dirty) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
        <Check className="h-3 w-3" />
        Saved
      </span>
    );
  }
  if (status === 'error') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] text-destructive">
        <CloudOff className="h-3 w-3" />
        Save failed
      </span>
    );
  }
  if (dirty) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
        <Cloud className="h-3 w-3" />
        Unsaved
      </span>
    );
  }
  return null;
}
