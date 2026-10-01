'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Loader2, RotateCcw } from 'lucide-react';
import { toast } from '@/lib/notify';
import { toastError } from '@/lib/errors';
import { cn } from '@/lib/utils';
import {
  isRenewPatientInfoConfirmed,
  isRequiredRenewDocument,
  isRtlHandoutLanguage,
  normalizeHandoutLanguage,
  PRESCRIBE_DOC_ID_TO_RENEW_KIND,
  RENEW_KIND_TO_PRESCRIBE_DOC_ID,
  providerNotificationFaxState,
  providerNotificationFaxHint,
  type RenewCommunicationMethod,
  type RenewCommunicationRecipient,
  type RenewDocumentKind,
  type RenewGeneratedDocument,
  type RenewalPatientInfo,
  type RenewPrescriberCommunication,
} from '@safescript/shared';
import {
  DocumentCard,
  DocumentProgressSummary,
  DocumentReviewBanner,
  DocumentsPrivacyFooter,
} from '@/features/consultations/documents/documents-review-ui';
import { documentationReadyCopy } from '@/features/consultations/documents/documentation-generation';
import { Progress } from '@/components/ui/progress';
import { DocumentsPatientInfoPanel } from '@/features/consultations/documents/documents-patient-info-panel';
import {
  DOCUMENT_DEFINITIONS,
  getDocumentsByCategory,
} from '@/features/consultations/documents/document-definitions';
import { isFaxablePrescribeDocument } from '@/features/consultations/documents/document-keys';
import { PrescriptionDocumentCard } from '@/features/consultations/documents/prescription-document-card';
import { RegenerateDocumentsDialog } from '@/features/consultations/documents/regenerate-documents-dialog';
import { SendFaxDialog } from '@/features/consultations/documents/send-fax-dialog';
import {
  blobToBase64,
  openPdfForPrint,
} from '@/features/consultations/documents/pdf-generator';
import { fieldToPlainText } from '@/features/consultations/documents/tiptap-text';
import { writeClipboardText } from '@/features/consultations/documents/copy-document-text';
import { useSendConsultationFax } from '@/features/consultations/hooks';
import { useAuthStore } from '@/features/auth/auth-store';
import type {
  DocumentState,
  DocumentTypeId,
  PatientDocumentInfo,
} from '@/features/consultations/documents/types';
import {
  downloadAllRenewDocuments,
  generateRenewDocumentPdf,
  isRenewDocumentReviewed,
  renewPdfFileName,
  type RenewPdfMeta,
} from './renew-document-download';
import { downloadRenewDocumentBlob, renewDocumentToHtml } from './renew-document-html';
import { printPatientHandout } from '@/features/consultations/documents/print-handout';
import { RenewDocumentWorkspaceDialog } from './renew-document-workspace-dialog';

export function renewPatientToDocumentInfo(
  info: RenewalPatientInfo | null | undefined,
  extras?: Pick<PatientDocumentInfo, 'phone' | 'address'>,
): PatientDocumentInfo {
  return {
    name: info?.patientName ?? '',
    dateOfBirth: info?.dateOfBirth ?? '',
    patientId: info?.phn ?? '',
    phone: extras?.phone ?? '',
    address: extras?.address ?? '',
    skipped: info?.skipped === true,
  };
}

function toDocumentState(doc: RenewGeneratedDocument, generating: boolean): DocumentState {
  const id = RENEW_KIND_TO_PRESCRIBE_DOC_ID[doc.kind];
  const versionId = `${doc.kind}:${doc.generatedAt ?? 'none'}`;
  if (generating) {
    return { id, status: 'GENERATING', versionId };
  }
  if (isRenewDocumentReviewed(doc)) {
    return {
      id,
      status: 'REVIEWED',
      versionId,
      reviewedVersionId: versionId,
      reviewedAt: doc.reviewedAt ?? undefined,
    };
  }
  if (doc.status === 'stale') {
    return { id, status: 'UPDATED_REVIEW_REQUIRED', versionId };
  }
  return { id, status: 'REVIEW_REQUIRED', versionId };
}

export function RenewDocumentsPanel({
  consultationId,
  documents,
  patientInfo,
  patientExtras,
  patientDraft,
  patientSaving,
  generatingKind,
  generatingAll,
  pdfMeta,
  communication,
  communicationPending,
  onPatientDraftChange,
  onPatientSave,
  onPatientSkip,
  onGenerate,
  onGenerateAll,
  onSave,
  onMarkCommunicated,
}: {
  consultationId: string;
  documents: RenewGeneratedDocument[];
  patientInfo: RenewalPatientInfo | null | undefined;
  patientExtras?: Pick<PatientDocumentInfo, 'phone' | 'address'>;
  /** In-progress form values (Name/DOB/PHN) before Save — keeps inputs editable. */
  patientDraft?: PatientDocumentInfo | null;
  patientSaving?: boolean;
  generatingKind?: RenewDocumentKind | null;
  generatingAll?: boolean;
  pdfMeta?: RenewPdfMeta;
  communication?: RenewPrescriberCommunication | null;
  communicationPending?: boolean;
  onPatientDraftChange?: (info: PatientDocumentInfo) => void;
  onPatientSave: (info: PatientDocumentInfo) => void | Promise<void>;
  onPatientSkip?: () => void | Promise<void>;
  onGenerate: (kind: RenewDocumentKind) => void;
  onGenerateAll?: (kinds?: RenewDocumentKind[]) => void;
  onSave: (kind: RenewDocumentKind, body: string, reviewed?: boolean) => Promise<void>;
  onMarkCommunicated?: (body: {
    method: RenewCommunicationMethod;
    communicatedAt: string;
    note?: string | null;
    phoneSummary?: string | null;
    recipient?: RenewCommunicationRecipient | null;
  }) => Promise<void>;
}) {
  const [openKind, setOpenKind] = useState<RenewDocumentKind | null>(null);
  const [copiedKind, setCopiedKind] = useState<RenewDocumentKind | null>(null);
  const [copyingKind, setCopyingKind] = useState<RenewDocumentKind | null>(null);
  const [printingKind, setPrintingKind] = useState<RenewDocumentKind | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [faxKind, setFaxKind] = useState<RenewDocumentKind | null>(null);
  const previousGenerating = useRef<RenewDocumentKind | null>(null);
  const authUser = useAuthStore((s) => s.user);
  const sendFax = useSendConsultationFax(consultationId);
  const openDoc = documents.find((doc) => doc.kind === openKind) ?? null;
  const patientConfirmed = isRenewPatientInfoConfirmed(patientInfo);
  const generating = Boolean(generatingAll || generatingKind);
  const patientDocumentValue = {
    ...renewPatientToDocumentInfo(patientInfo, patientExtras),
    ...(patientDraft ?? {}),
  };
  const pdfContext: RenewPdfMeta = {
    ...pdfMeta,
    consultationId,
    patientInfo: patientDocumentValue,
  };

  const definitions = useMemo(
    () =>
      DOCUMENT_DEFINITIONS.map((def) => {
        const kind = PRESCRIBE_DOC_ID_TO_RENEW_KIND[def.id];
        const doc = documents.find((row) => row.kind === kind);
        return doc
          ? {
              ...def,
              name: doc.title || def.name,
              description: doc.description || def.description,
              bullets:
                kind === 'prescriber_notification'
                  ? ['Medication renewed', 'Relevant clinical information', 'Monitoring / follow-up']
                  : def.bullets,
            }
          : def;
      }),
    [documents],
  );
  const categories = getDocumentsByCategory(definitions);

  const required = documents.filter((doc) => isRequiredRenewDocument(doc.kind));
  const reviewedCount = required.filter(isRenewDocumentReviewed).length;
  const generatedRequiredCount = required.filter(
    (doc) => doc.status === 'generated' && Boolean(doc.body.trim()),
  ).length;
  const remainingRequired = Math.max(0, required.length - reviewedCount);

  const openable = useMemo(
    () => documents.filter((doc) => Boolean(doc.body.trim()) && doc.status !== 'stale'),
    [documents],
  );
  const nextDocument = useMemo(() => {
    if (!openKind) return null;
    const idx = openable.findIndex((doc) => doc.kind === openKind);
    if (idx < 0 || idx >= openable.length - 1) return null;
    const next = openable[idx + 1];
    return next ? { kind: next.kind, title: next.title } : null;
  }, [openKind, openable]);

  useEffect(() => {
    const previous = previousGenerating.current;
    previousGenerating.current = generatingKind ?? null;
    if (previous === 'patient_handout' && !generatingKind) {
      const handout = documents.find((row) => row.kind === 'patient_handout');
      if (handout?.status === 'generated' && handout.body.trim()) {
        setOpenKind('patient_handout');
      }
    }
  }, [documents, generatingKind]);

  const handleCopy = async (doc: RenewGeneratedDocument) => {
    if (isRequiredRenewDocument(doc.kind) && !isRenewDocumentReviewed(doc)) {
      toast.error('Review this document before copying');
      return;
    }
    if (doc.status === 'stale') {
      toast.error('Clinical information changed. Regenerate or review this document before sharing.');
      return;
    }
    if (!doc.body.trim()) {
      toast.error('Document is not ready to copy');
      return;
    }
    setCopyingKind(doc.kind);
    try {
      await writeClipboardText(fieldToPlainText(doc.body));
      setCopiedKind(doc.kind);
      toast.success(
        doc.kind === 'patient_handout' ? 'Patient handout copied.' : 'Copied to clipboard.',
        { announce: true },
      );
      window.setTimeout(() => setCopiedKind(null), 2500);
    } catch {
      toast.error('Could not copy to clipboard');
    } finally {
      setCopyingKind(null);
    }
  };

  const handlePrint = async (doc: RenewGeneratedDocument) => {
    const requireReviewed = isRequiredRenewDocument(doc.kind);
    if (requireReviewed && !isRenewDocumentReviewed(doc)) {
      toast.error('Review this document before printing or downloading');
      return;
    }
    if (!requireReviewed && (doc.status === 'stale' || !doc.body.trim())) {
      toast.error('Document is not ready to print or download');
      return;
    }
    setPrintingKind(doc.kind);
    try {
      if (doc.kind === 'patient_handout') {
        const lang = normalizeHandoutLanguage(doc.handoutLanguage);
        const dir = isRtlHandoutLanguage(lang) ? 'rtl' : 'ltr';
        const html = renewDocumentToHtml(doc.body, doc.title);
        await printPatientHandout(html, lang, dir);
      } else {
        const blob = await generateRenewDocumentPdf(doc.body, doc.title, pdfContext, doc.kind);
        openPdfForPrint(blob);
      }
    } catch {
      toast.error('Could not prepare the document for printing');
    } finally {
      setPrintingKind(null);
    }
  };

  const handleDownload = async (doc: RenewGeneratedDocument) => {
    const requireReviewed = isRequiredRenewDocument(doc.kind);
    if (requireReviewed && !isRenewDocumentReviewed(doc)) {
      toast.error('Review this document before printing or downloading');
      return;
    }
    try {
      const blob = await generateRenewDocumentPdf(doc.body, doc.title, pdfContext, doc.kind);
      downloadRenewDocumentBlob(blob, renewPdfFileName(doc.kind, doc.title));
    } catch {
      toast.error('Could not prepare the PDF');
    }
  };

  const handleOpenFax = (doc: RenewGeneratedDocument) => {
    const typeId = RENEW_KIND_TO_PRESCRIBE_DOC_ID[doc.kind];
    if (!isFaxablePrescribeDocument(typeId)) return;
    if (isRequiredRenewDocument(doc.kind) && !isRenewDocumentReviewed(doc)) {
      toast.error('Review this document before faxing');
      return;
    }
    if (doc.kind === 'prescriber_notification') {
      const state = providerNotificationFaxState({
        reviewed: isRenewDocumentReviewed(doc),
        recipientName: communication?.recipient?.name,
        faxNumber: communication?.recipient?.fax,
      });
      if (state !== 'ready') {
        toast.error(providerNotificationFaxHint(state) ?? 'Review this document before faxing');
        return;
      }
    }
    setFaxKind(doc.kind);
  };

  const handleSendFax = async (
    values: { recipientName: string; faxNumber: string },
    doc: RenewGeneratedDocument,
    bodyHtml = doc.body,
  ) => {
    if (!bodyHtml.trim()) throw new Error('This document is empty and cannot be faxed');
    const blob = await generateRenewDocumentPdf(bodyHtml, doc.title, pdfContext, doc.kind);
    if (!blob.size) throw new Error('This document is empty and cannot be faxed');
    const pdfBase64 = await blobToBase64(blob);
    try {
      await sendFax.mutateAsync({
        recipientName: values.recipientName,
        faxNumber: values.faxNumber,
        documentTypeId: RENEW_KIND_TO_PRESCRIBE_DOC_ID[doc.kind],
        documentName: doc.title,
        pdfBase64,
      });
      toast.success(
        `Fax submitted to ${values.recipientName}. Delivery is confirmed when the recipient receives it.`,
        { announce: true },
      );
      if (doc.kind === 'prescriber_notification' && onMarkCommunicated) {
        await onMarkCommunicated({
          method: 'SECURE_FAX',
          communicatedAt: new Date().toISOString(),
          recipient: {
            recipientType: communication?.recipient?.recipientType ?? 'PRIMARY_CARE_PRESCRIBER',
            name: values.recipientName,
            profession: communication?.recipient?.profession ?? null,
            clinicName: communication?.recipient?.clinicName ?? null,
            fax: values.faxNumber,
            phone: communication?.recipient?.phone ?? null,
            secureMessageAddress: communication?.recipient?.secureMessageAddress ?? null,
          } satisfies RenewCommunicationRecipient,
        });
      }
    } catch (err) {
      toastError(err, 'The fax could not be sent. Try again or print the document.');
      throw err;
    }
  };

  const handleSendCardFax = async (values: { recipientName: string; faxNumber: string }) => {
    if (!faxKind) throw new Error('FAX_UNAVAILABLE');
    const doc = documents.find((row) => row.kind === faxKind);
    if (!doc) throw new Error('This document is empty and cannot be faxed');
    await handleSendFax(values, doc);
  };

  const handleSendWorkspaceFax = async (values: {
    recipientName: string;
    faxNumber: string;
    bodyHtml: string;
  }) => {
    const doc = openDoc;
    if (!doc) throw new Error('FAX_UNAVAILABLE');
    await handleSendFax(values, doc, values.bodyHtml);
  };

  const handleDownloadAll = async () => {
    setDownloadingAll(true);
    try {
      const result = await downloadAllRenewDocuments(documents, pdfContext);
      toast.success(`Downloaded ${result.fileCount} document${result.fileCount === 1 ? '' : 's'}.`);
    } catch (error) {
      if (error instanceof Error && error.message === 'NO_REVIEWED_DOCUMENTS') {
        toast.error('Review at least one document before downloading all.');
      } else {
        toast.error('Could not download documents');
      }
    } finally {
      setDownloadingAll(false);
    }
  };

  const canDownloadAll =
    remainingRequired === 0 && generatedRequiredCount >= required.length && !generating;
  const faxDoc = documents.find((doc) => doc.kind === faxKind) ?? null;
  const draftingReadyCount = documents.filter((doc) => Boolean(doc.body.trim())).length;
  const draftingTotal = Math.max(documents.length, required.length, 1);

  return (
    <div className="documents-page space-y-0">
      <header className="documents-page-header mb-4 grid grid-cols-1 items-center gap-3 min-[641px]:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <h1 className="documents-page-title text-[26px] font-bold leading-[1.25] text-[#111827]">
            Consultation Documents
          </h1>
          <p className="documents-page-subtitle mt-[5px] text-[15px] leading-[1.45] text-[#58636f]">
            Review, finalize, and export the consultation documents.
          </p>
        </div>
        {!generating ? (
          <DocumentProgressSummary
            generatedCount={generatedRequiredCount}
            reviewedCount={reviewedCount}
            totalCount={required.length}
          />
        ) : null}
      </header>

      <DocumentsPatientInfoPanel
        className="mb-4"
        value={patientDocumentValue}
        onDraftChange={onPatientDraftChange}
        onSave={onPatientSave}
        onSkip={
          !patientConfirmed
            ? onPatientSkip ??
              (() =>
                onPatientSave({
                  name: '',
                  dateOfBirth: '',
                  patientId: '',
                  phone: '',
                  address: '',
                  skipped: true,
                }))
            : undefined
        }
        saving={patientSaving}
        disabled={generating}
      />

      {generating ? (
        <div className="mb-5 space-y-3 rounded-xl border border-[#c7dde2] bg-[#f6fbfb] px-5 py-4">
          <p className="flex items-center gap-2 text-sm font-medium text-[#25303b]">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-[#0f766e]" />
            {documentationReadyCopy(draftingReadyCount, draftingTotal)}
          </p>
          <Progress
            value={Math.round((draftingReadyCount / draftingTotal) * 100)}
            className="h-2"
          />
          <p className="text-xs text-[#58636f]">
            Drafting the consultation note and PCP letter with the same Document Session as
            Prescribe. Prescription and patient handout stay on the confirmed plan.
          </p>
        </div>
      ) : null}

      {patientConfirmed ? (
        categories.map((group) => (
          <section key={group.key} className="mb-5">
            <h2 className="document-group-title mb-3 mt-1 text-[17px] font-bold leading-[1.35] text-[#111827]">
              {group.label}
            </h2>
            <div className="document-list grid gap-3">
              {group.docs.map((def) => {
                const kind = PRESCRIBE_DOC_ID_TO_RENEW_KIND[def.id];
                const doc = documents.find((row) => row.kind === kind);
                if (!doc) return null;
                const busy =
                  generatingAll || generatingKind === doc.kind || printingKind === doc.kind;
                const state = toDocumentState(doc, busy);
                const included =
                  doc.status === 'generated' || doc.status === 'stale' || Boolean(doc.body.trim());

                if (def.id === 'prescription') {
                  return (
                    <PrescriptionDocumentCard
                      key={doc.kind}
                      def={def}
                      state={state}
                      included={included}
                      required
                      generating={busy}
                      creating={generatingKind === 'renewal_summary' && !included}
                      onCreate={() => onGenerate('renewal_summary')}
                      onReviewEdit={() => setOpenKind(doc.kind)}
                      onPrint={() => void handlePrint(doc)}
                      onDownload={() => void handleDownload(doc)}
                      onFax={() => handleOpenFax(doc)}
                    />
                  );
                }

                return (
                  <DocumentCard
                    key={doc.kind}
                    def={def}
                    state={state}
                    copied={copiedKind === doc.kind}
                    generating={busy || copyingKind === doc.kind}
                    onReviewEdit={() => {
                      if (!doc.body.trim()) {
                        onGenerate(doc.kind);
                        return;
                      }
                      setOpenKind(doc.kind);
                    }}
                    onCopy={() => void handleCopy(doc)}
                    onDownload={() => void handleDownload(doc)}
                    onPrint={() => void handlePrint(doc)}
                    onFax={
                      isFaxablePrescribeDocument(def.id) ? () => handleOpenFax(doc) : undefined
                    }
                    onRetry={() => onGenerate(doc.kind)}
                  />
                );
              })}
            </div>
          </section>
        ))
      ) : (
        <p className="mb-5 rounded-xl border border-[#c7dde2] bg-[#f6fbfb] px-4 py-3 text-[14px] text-[#3e4b55]">
          Save or skip patient details to generate the consultation documents.
        </p>
      )}

      <DocumentReviewBanner remainingRequired={patientConfirmed ? remainingRequired : required.length} />

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => setConfirmRegenerate(true)}
          disabled={generating || !patientConfirmed}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-[#aebfc5] bg-white px-4 text-[14px] font-semibold text-[#111827] hover:bg-[#f7fafb] disabled:opacity-50"
        >
          <RotateCcw className="h-4 w-4" />
          Regenerate Documents
        </button>
        <button
          type="button"
          onClick={() => void handleDownloadAll()}
          disabled={downloadingAll || generating || !canDownloadAll}
          className={cn(
            'inline-flex min-h-12 items-center justify-center gap-2 rounded-lg px-5 text-[15px] font-bold',
            canDownloadAll && !downloadingAll
              ? 'bg-[#008CA4] text-white hover:bg-[#007a8f]'
              : 'cursor-not-allowed border border-[#d4dade] bg-[#eef1f2] text-[#9aa4aa]',
          )}
        >
          {downloadingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          Download all documents
        </button>
      </div>

      <DocumentsPrivacyFooter />

      <RenewDocumentWorkspaceDialog
        open={Boolean(openDoc)}
        document={openDoc}
        nextDocument={nextDocument}
        nestedOpen={Boolean(faxKind)}
        faxPending={sendFax.isPending}
        faxStorageScope={{
          tenantId: authUser?.tenantId ?? null,
          userId: authUser?.id ?? null,
          consultationId,
        }}
        onSendFax={handleSendWorkspaceFax}
        pdfMeta={pdfContext}
        onClose={() => setOpenKind(null)}
        onPersist={onSave}
        communication={communication}
        communicationPending={communicationPending}
        onMarkCommunicated={onMarkCommunicated}
        onAdvanceToNext={() => {
          if (nextDocument) setOpenKind(nextDocument.kind);
          else setOpenKind(null);
        }}
        consultationId={consultationId}
      />

      <RegenerateDocumentsDialog
        open={confirmRegenerate}
        onOpenChange={setConfirmRegenerate}
        definitions={definitions}
        manuallyEditedIds={documents
          .filter((doc) => doc.edited)
          .map((doc) => RENEW_KIND_TO_PRESCRIBE_DOC_ID[doc.kind])}
        loading={generating}
        onConfirm={(selectedIds) => {
          const kinds = selectedIds
            .map((id) => PRESCRIBE_DOC_ID_TO_RENEW_KIND[id as DocumentTypeId])
            .filter(Boolean);
          if (!kinds.length) return;
          if (kinds.length === 1) onGenerate(kinds[0]!);
          else onGenerateAll?.(kinds);
          setConfirmRegenerate(false);
        }}
      />

      <SendFaxDialog
        open={Boolean(faxDoc)}
        documentName={faxDoc?.title ?? 'Document'}
        storageScope={{
          tenantId: authUser?.tenantId ?? null,
          userId: authUser?.id ?? null,
          consultationId,
        }}
        submitting={sendFax.isPending}
        defaultRecipient={
          faxKind === 'prescriber_notification'
            ? {
                recipientName: communication?.recipient?.name ?? '',
                faxNumber: communication?.recipient?.fax ?? '',
              }
            : undefined
        }
        onClose={() => setFaxKind(null)}
        onSubmit={handleSendCardFax}
      />
    </div>
  );
}
