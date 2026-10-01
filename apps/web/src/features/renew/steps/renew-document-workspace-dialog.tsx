'use client';

import { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
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
} from 'lucide-react';
import { toast } from '@/lib/notify';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useBlockParentDialogClose } from '@/components/ui/nested-dialog-dismiss';
import { NotionDocumentEditor } from '@/features/consultations/documents/notion-document-editor';
import { fieldToPlainText } from '@/features/consultations/documents/tiptap-text';
import { writeClipboardText } from '@/features/consultations/documents/copy-document-text';
import { SendFaxDialog, type SendFaxFormValues } from '@/features/consultations/documents/send-fax-dialog';
import type { FaxRecipientScope } from '@/features/consultations/documents/fax-recipient-storage';
import { isFaxablePrescribeDocument } from '@/features/consultations/documents/document-keys';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  handoutLanguageMenuLabel,
  handoutLanguagesPhase1,
  handoutLanguagesPhase2,
  handoutTranslationBanner,
  isRtlHandoutLanguage,
  isRequiredRenewDocument,
  normalizeHandoutLanguage,
  providerNotificationFaxHint,
  providerNotificationFaxState,
  providerNotificationRequirementCopy,
  RENEW_COMMUNICATION_METHOD_OPTIONS,
  RENEW_KIND_TO_PRESCRIBE_DOC_ID,
  type RenewCommunicationMethod,
  type RenewCommunicationRecipient,
  type RenewDocumentKind,
  type RenewGeneratedDocument,
  type RenewPrescriberCommunication,
} from '@safescript/shared';
import { useTranslateRenewPatientHandout } from '../hooks';
import { renewDocumentToHtml } from './renew-document-html';
import {
  generateRenewDocumentPdf,
  type RenewPdfMeta,
} from './renew-document-download';
import { renewPrescriptionToEditorHtml } from './renew-prescription-template';
import { openPdfForPrint } from '@/features/consultations/documents/pdf-generator';
import { printPatientHandout } from '@/features/consultations/documents/print-handout';

type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

const AUTOSAVE_MS = 700;

function renewWorkspaceHtml(kind: RenewDocumentKind, body: string, title: string): string {
  if (kind === 'renewal_summary') return renewPrescriptionToEditorHtml(body, title);
  return renewDocumentToHtml(body, title);
}

const KIND_HINT: Record<RenewDocumentKind, { banner: string; detail: string }> = {
  consultation_note: {
    banner: 'Pharmacist Renewal Assessment · pharmacist reviews.',
    detail:
      'This is the clinical record of care. Confirm that Data, Assessment, and Plan match the encounter. Copy uses this same edited document.',
  },
  renewal_summary: {
    banner: 'Prescription · pharmacist reviews.',
    detail:
      'Clinical pharmacist prescription in the same format as Prescribe. Medication names, directions, quantity, and refills stay as confirmed. Print or fax uses this same edited document.',
  },
  patient_handout: {
    banner: 'Your Medication Renewal · optional written output.',
    detail:
      'Plain-language medication renewal handout. Directions stay as confirmed on the prescription. Print uses this same edited document. Optional — never blocks completing the consultation.',
  },
  prescriber_notification: {
    banner: 'Prescriber Communication · pharmacist reviews.',
    detail:
      'Concise pharmacist renewal notification. Recipient stays on the fax/cover sheet. Copy or fax uses this same edited document. Generating or copying does not record that the recipient was notified.',
  },
};

export function RenewDocumentWorkspaceDialog({
  open,
  document,
  nextDocument,
  onClose,
  onPersist,
  onAdvanceToNext,
  nestedOpen = false,
  consultationId,
  faxStorageScope,
  faxPending = false,
  onSendFax,
  pdfMeta,
  communication,
  onMarkCommunicated,
  communicationPending = false,
}: {
  open: boolean;
  document: RenewGeneratedDocument | null;
  nextDocument?: { kind: RenewDocumentKind; title: string } | null;
  onClose: () => void;
  onPersist: (kind: RenewDocumentKind, body: string, reviewed?: boolean) => Promise<void>;
  onAdvanceToNext?: () => void;
  nestedOpen?: boolean;
  consultationId: string;
  faxStorageScope?: FaxRecipientScope;
  faxPending?: boolean;
  onSendFax?: (values: SendFaxFormValues & { bodyHtml: string }) => Promise<void>;
  /** PDF header/patient context for Print (prescription + handout). */
  pdfMeta?: RenewPdfMeta;
  communication?: RenewPrescriberCommunication | null;
  onMarkCommunicated?: (body: {
    method: RenewCommunicationMethod;
    communicatedAt: string;
    note?: string | null;
    phoneSummary?: string | null;
    recipient?: RenewCommunicationRecipient | null;
  }) => Promise<void>;
  communicationPending?: boolean;
}) {
  const [html, setHtml] = useState(() =>
    document ? renewWorkspaceHtml(document.kind, document.body, document.title) : '<p></p>',
  );
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [copied, setCopied] = useState(false);
  const [copying, setCopying] = useState(false);
  const [marking, setMarking] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [faxOpen, setFaxOpen] = useState(false);
  const [markCommunicatedOpen, setMarkCommunicatedOpen] = useState(false);

  const htmlRef = useRef(html);
  const dirtyRef = useRef(false);
  const seedRef = useRef(document?.body ?? '');
  const kindRef = useRef(document?.kind ?? null);
  const wasOpenRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);

  const reviewed = Boolean(
    document &&
      document.status === 'generated' &&
      document.reviewed === true &&
      document.body.trim(),
  );
  const required = document ? isRequiredRenewDocument(document.kind) : true;
  const kind = document?.kind ?? 'consultation_note';
  const isHandout = kind === 'patient_handout';
  const isRx = kind === 'renewal_summary';
  const handoutLanguage = normalizeHandoutLanguage(document?.handoutLanguage);
  const translateHandout = useTranslateRenewPatientHandout(consultationId);
  const translationBanner =
    isHandout && !reviewed
      ? handoutTranslationBanner({
          handoutLanguage,
          translationFallback: document?.translationFallback ? 'true' : 'false',
          translationRequiresReview: handoutLanguage === 'en' ? 'false' : 'true',
          translationMessage: document?.translationMessage ?? '',
          translationStale: 'false',
        })
      : null;
  const hint = KIND_HINT[kind];
  const isNotification = kind === 'prescriber_notification';
  const requirementCopy = isNotification
    ? providerNotificationRequirementCopy({
        requirement: communication?.requirement ?? 'NOT_REQUIRED',
        recipientNeeded: false,
      })
    : null;
  const faxState = isNotification
    ? providerNotificationFaxState({
        reviewed,
        recipientName: communication?.recipient?.name,
        faxNumber: communication?.recipient?.fax,
      })
    : reviewed
      ? 'ready'
      : 'not_reviewed';
  const faxHint = isNotification ? providerNotificationFaxHint(faxState) : null;
  const canFax =
    Boolean(onSendFax && faxStorageScope) &&
    isFaxablePrescribeDocument(RENEW_KIND_TO_PRESCRIBE_DOC_ID[kind]);
  // Match Prescribe: once reviewed, Fax opens SendFaxDialog (recipient entered there).
  const faxEnabled = canFax && faxState === 'ready';
  const canPrint = isRx || isHandout;
  const { shouldBlock: shouldBlockPreviewClose, arm: armPreviewCloseHold } =
    useBlockParentDialogClose(
      faxOpen || faxPending || printing || nestedOpen || markCommunicatedOpen,
    );

  const closeFaxDialog = () => {
    if (faxPending) return;
    armPreviewCloseHold();
    setFaxOpen(false);
  };

  useEffect(() => {
    const justOpened = open && !wasOpenRef.current;
    wasOpenRef.current = open;
    if (!open || !document) return;

    const kindChanged = document.kind !== kindRef.current;
    const draftChanged = document.body !== seedRef.current;
    if (!justOpened && !kindChanged && !draftChanged) return;

    kindRef.current = document.kind;
    seedRef.current = document.body;
    const next = renewWorkspaceHtml(document.kind, document.body, document.title);
    setHtml(next);
    htmlRef.current = next;
    dirtyRef.current = false;
    setSaveStatus('idle');
    setCopied(false);
    setPrinting(false);
    setFaxOpen(false);
    setMarkCommunicatedOpen(false);
    setEditorEpoch((n) => n + 1);
  }, [open, document]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const persist = async (reviewedFlag?: boolean) => {
    if (!document || !onPersist) return;
    if (reviewedFlag !== true && (!dirtyRef.current || savingRef.current)) return;
    let wait = 0;
    while (savingRef.current && wait < 80) {
      await new Promise((resolve) => window.setTimeout(resolve, 40));
      wait += 1;
    }
    savingRef.current = true;
    setSaveStatus('saving');
    const payload =
      document.kind === 'patient_handout' ? fieldToPlainText(htmlRef.current).trim() : htmlRef.current;
    if (!payload.trim()) {
      savingRef.current = false;
      setSaveStatus('error');
      toast.error('Add document content before continuing');
      return;
    }
    seedRef.current = payload;
    dirtyRef.current = false;
    try {
      await onPersist(document.kind, payload, reviewedFlag);
      setSaveStatus('saved');
    } catch {
      dirtyRef.current = true;
      setSaveStatus('error');
      toast.error('Could not save document edits');
      throw new Error('SAVE_FAILED');
    } finally {
      savingRef.current = false;
    }
  };

  const scheduleAutosave = () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void persist().catch(() => undefined);
    }, AUTOSAVE_MS);
  };

  const handleHtmlChange = (next: string) => {
    setHtml(next);
    htmlRef.current = next;
    dirtyRef.current = true;
    setSaveStatus('dirty');
    scheduleAutosave();
  };

  const flushPending = async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    await persist().catch(() => undefined);
  };

  const ensureContent = () => {
    const plain = fieldToPlainText(htmlRef.current).trim();
    if (!plain) {
      toast.error('Add document content before continuing');
      return false;
    }
    return true;
  };

  const handleClose = async () => {
    if (marking) return;
    await flushPending();
    onClose();
  };

  const handleMarkReviewed = async () => {
    if (!document || marking) return;
    if (reviewed) {
      if (nextDocument && onAdvanceToNext) onAdvanceToNext();
      else await handleClose();
      return;
    }
    if (!ensureContent()) return;
    setMarking(true);
    try {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      // Always persist reviewed=true — optional docs (PCP / handout) still need an
      // explicit review to unlock fax/print and clear "Review required".
      await persist(true);
      toast.success('Document marked as reviewed');
      if (nextDocument && onAdvanceToNext) onAdvanceToNext();
      else onClose();
    } catch {
      // persist already toasts
    } finally {
      setMarking(false);
    }
  };

  const handleLanguageChange = async (language: string) => {
    if (!isHandout || language === handoutLanguage || translateHandout.isPending) return;
    try {
      await flushPending();
      setSaveStatus('saving');
      const view = await translateHandout.mutateAsync(language);
      const next = view.decision.documents.find((doc) => doc.kind === 'patient_handout');
      setSaveStatus('saved');
      if (next?.translationFallback) {
        toast.error(next.translationMessage || 'Translation is unavailable. Showing English.');
      } else if (normalizeHandoutLanguage(next?.handoutLanguage) === 'en') {
        toast.success('Handout restored to English.');
      } else {
        toast.success('Handout translated. Review before sharing.');
      }
    } catch {
      setSaveStatus('error');
      toast.error('Could not change handout language');
    }
  };

  const busy =
    marking || copying || printing || faxPending || communicationPending || translateHandout.isPending;
  /** Same as Prescribe workspace: Copy for DAP + PCP letter; not for Rx or patient handout. */
  const canCopy = kind === 'consultation_note' || kind === 'prescriber_notification';

  const handlePrintDocument = async () => {
    if (!document || !canPrint || printing) return;
    if (!ensureContent()) return;
    setPrinting(true);
    try {
      await flushPending();
      if (isHandout) {
        // Patient handouts need Unicode-capable browser print (not jsPDF).
        // jsPDF's Latin-only Helvetica corrupts Indic, Arabic, CJK, and other
        // non-Latin scripts. We use Chromium with Noto Sans multilingual fonts.
        const dir = isRtlHandoutLanguage(handoutLanguage) ? 'rtl' : 'ltr';
        await printPatientHandout(htmlRef.current, handoutLanguage, dir);
      } else {
        const blob = await generateRenewDocumentPdf(
          htmlRef.current,
          document.title,
          pdfMeta ?? {},
          document.kind,
        );
        openPdfForPrint(blob);
      }
    } catch {
      toast.error('Could not prepare the PDF for printing');
    } finally {
      setPrinting(false);
    }
  };

  const handleCopyDocument = async () => {
    if (copying || marking || !canCopy) return;
    if (document?.status === 'stale') {
      toast.error('Clinical information changed. Regenerate or review this document before sharing.');
      return;
    }
    if (!ensureContent()) return;
    setCopying(true);
    try {
      await flushPending();
      await writeClipboardText(fieldToPlainText(htmlRef.current));
      setCopied(true);
      toast.success('Copied to clipboard', { announce: true });
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error('Could not copy to clipboard');
    } finally {
      setCopying(false);
    }
  };

  const communicated = communication?.status === 'COMMUNICATED';
  const canMarkCommunicated =
    isNotification &&
    Boolean(onMarkCommunicated) &&
    reviewed &&
    !communicated &&
    communication?.requirement === 'REQUIRED';
  const primaryLabel = reviewed
    ? nextDocument
      ? `Next: ${nextDocument.title}`
      : 'Done'
    : 'Save & mark reviewed';

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
                <span className="truncate">{document?.title ?? 'Document'}</span>
              </DialogTitle>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                {isHandout ? (
                  <label className="flex min-w-0 items-center gap-2 text-[12px] text-[#3e4b55]">
                    <Globe className="h-3.5 w-3.5 shrink-0 text-[#5b6b76]" />
                    <span className="shrink-0 font-medium">Language</span>
                    <div className="w-[min(100%,16.5rem)] min-w-[11rem] shrink-0">
                      <Select
                        value={handoutLanguage}
                        disabled={translateHandout.isPending || busy}
                        onChange={(e) => void handleLanguageChange(e.target.value)}
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
                    {translateHandout.isPending ? (
                      <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-[#5b6b76]">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Translating…
                      </span>
                    ) : null}
                  </label>
                ) : null}
                <div className="ml-auto flex shrink-0 items-center gap-2 whitespace-nowrap">
                  <SaveIndicator status={saveStatus} dirty={dirtyRef.current || saveStatus === 'dirty'} />
                  {canCopy ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5 px-3"
                    onClick={() => void handleCopyDocument()}
                    disabled={busy}
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
                    disabled={busy}
                    title={`Print ${document?.title ?? 'document'}`}
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
                    onClick={() => {
                      if (!faxEnabled) {
                        toast.error(faxHint ?? 'Review this document before faxing');
                        return;
                      }
                      void flushPending().then(() => setFaxOpen(true));
                    }}
                    disabled={busy || !faxEnabled}
                    title={faxHint ?? `Fax ${document?.title ?? 'document'}`}
                  >
                    {faxPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    Fax
                  </Button>
                  ) : null}
                  {canMarkCommunicated ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 gap-1.5 px-3"
                    onClick={() => setMarkCommunicatedOpen(true)}
                    disabled={busy}
                    title="Copy and fax click do not record communication until this is confirmed or a fax succeeds"
                  >
                    Mark as communicated
                  </Button>
                  ) : null}
                </div>
              </div>
            </div>
            <DialogDescription className="mt-1.5 text-left text-xs">
              {isNotification && requirementCopy
                ? `${requirementCopy.banner} ${requirementCopy.detail}`
                : isHandout
                  ? 'Patient take-home renewal handout. Directions stay as confirmed. Save & mark reviewed before printing. Optional — does not block completion.'
                  : required
                    ? 'Edit in place — changes save automatically. Save & mark reviewed when you have checked this document.'
                    : 'Edit in place — changes save automatically. Save & mark reviewed before faxing or exporting. Optional — does not block completion.'}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto bg-[#f3f5f6]">
            {translationBanner ? (
              <div
                role="status"
                className={cn(
                  'mx-auto mt-4 flex w-full max-w-[740px] items-start gap-2 rounded-lg border px-3.5 py-2.5 text-[12.5px]',
                  translationBanner.tone === 'fallback' || translationBanner.tone === 'stale'
                    ? 'border-[#efc57f] bg-[#fff8eb] text-[#9a5600]'
                    : 'border-[#c7dde2] bg-[#f6fbfb] text-[#0f6f6b]',
                )}
              >
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <p className="font-semibold">{translationBanner.message}</p>
              </div>
            ) : null}
            <div className="mx-auto mt-4 flex w-full max-w-[740px] items-start gap-2 rounded-lg border border-[#c7dde2] bg-[#f6fbfb] px-3.5 py-2.5 text-[12.5px] text-[#3e4b55]">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0f766e]" />
              <p>
                <span className="font-semibold text-[#0f6f6b]">{hint.banner}</span> {hint.detail}
              </p>
            </div>
            <article className="mx-auto my-4 w-full max-w-[740px] rounded-xl border border-[#e2eaed] bg-white px-5 py-6 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_28px_rgba(16,24,40,0.06)] sm:my-6 sm:px-12 sm:py-10">
              {open && document ? (
                <NotionDocumentEditor
                  editorKey={`${document.kind}:${handoutLanguage}:${editorEpoch}`}
                  initialHtml={html}
                  onChange={handleHtmlChange}
                  compact={!isRx}
                  collapsibleToolbar={isRx}
                  dir={isHandout && isRtlHandoutLanguage(handoutLanguage) ? 'rtl' : 'ltr'}
                  lang={isHandout ? handoutLanguage : undefined}
                  editorClassName={isRx ? 'notion-doc-prose--rx' : undefined}
                  contentClassName="min-h-[min(48vh,520px)] px-0.5 py-0.5"
                />
              ) : null}
            </article>
          </div>

          <div className="shrink-0 border-t border-[#d5e2e6] bg-white px-4 py-3.5 sm:px-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[13px] text-[#5b6b75]">
                {isNotification && communicated
                  ? 'Communication recorded. Copy still does not change that status.'
                  : isNotification && requirementCopy
                    ? `${requirementCopy.banner} ${requirementCopy.detail}`
                  : reviewed
                    ? 'This document version has been marked as reviewed.'
                    : required
                      ? 'Review the content, then save to confirm this required document.'
                      : isHandout
                        ? 'Optional handout — does not block completion. Save & mark reviewed before printing.'
                        : 'Optional document — does not block completion. Save & mark reviewed before faxing or exporting.'}
              </p>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {nextDocument ? (
                  <p className="mr-1 hidden text-[12px] text-muted-foreground sm:block">
                    Next up · {nextDocument.title}
                  </p>
                ) : null}
                <Button
                  type="button"
                  className="h-11 min-w-[188px] bg-[#0f817c] hover:bg-[#0c6f6b]"
                  disabled={marking}
                  onClick={() => void handleMarkReviewed()}
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
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      {canFax && faxStorageScope ? (
        <SendFaxDialog
          open={faxOpen}
          documentName={document?.title ?? 'Document'}
          storageScope={faxStorageScope}
          submitting={faxPending}
          defaultRecipient={
            isNotification
              ? {
                  recipientName: communication?.recipient?.name ?? '',
                  faxNumber: communication?.recipient?.fax ?? '',
                }
              : undefined
          }
          onClose={closeFaxDialog}
          onSubmit={async (values) => {
            await flushPending();
            await onSendFax?.({ ...values, bodyHtml: htmlRef.current });
            armPreviewCloseHold();
            setFaxOpen(false);
          }}
        />
      ) : null}
      {canMarkCommunicated ? (
        <MarkCommunicatedDialog
          open={markCommunicatedOpen}
          pending={communicationPending}
          defaultRecipientName={communication?.recipient?.name ?? ''}
          defaultFax={communication?.recipient?.fax ?? ''}
          onClose={() => {
            armPreviewCloseHold();
            setMarkCommunicatedOpen(false);
          }}
          onSave={async (body) => {
            await onMarkCommunicated?.(body);
            armPreviewCloseHold();
            setMarkCommunicatedOpen(false);
            toast.success('Communication recorded.');
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
      <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] text-emerald-600">
        <Check className="h-3 w-3" />
        Draft saved
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
  if (dirty || status === 'dirty') {
    return (
      <span className="inline-flex shrink-0 items-center gap-1.5 text-[11px] text-muted-foreground">
        <Cloud className="h-3 w-3" />
        Unsaved
      </span>
    );
  }
  return null;
}

function MarkCommunicatedDialog({
  open,
  pending,
  defaultRecipientName = '',
  defaultFax = '',
  onClose,
  onSave,
}: {
  open: boolean;
  pending: boolean;
  defaultRecipientName?: string;
  defaultFax?: string;
  onClose: () => void;
  onSave: (body: {
    method: RenewCommunicationMethod;
    communicatedAt: string;
    note?: string | null;
    phoneSummary?: string | null;
    recipient?: RenewCommunicationRecipient | null;
  }) => Promise<void>;
}) {
  const [method, setMethod] = useState<RenewCommunicationMethod>('SECURE_FAX');
  const [recipientName, setRecipientName] = useState(defaultRecipientName);
  const [fax, setFax] = useState(defaultFax);
  const [note, setNote] = useState('');
  const [phoneSummary, setPhoneSummary] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMethod('SECURE_FAX');
    setRecipientName(defaultRecipientName);
    setFax(defaultFax);
    setNote('');
    setPhoneSummary('');
  }, [open, defaultRecipientName, defaultFax]);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && !pending && !saving && onClose()}>
      <DialogContent data-nested-dialog overlayClassName="z-[70]" className="z-[70] sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mark as communicated</DialogTitle>
          <DialogDescription className="text-left">
            Copy and opening Fax do not complete communication. Record who was notified and how.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (recipientName.trim().length < 2) {
              toast.error('Enter the recipient name.');
              return;
            }
            if (method === 'PHONE' && !phoneSummary.trim()) {
              toast.error('Record a brief summary of the telephone communication.');
              return;
            }
            setSaving(true);
            void onSave({
              method,
              communicatedAt: new Date().toISOString(),
              note: note.trim() || null,
              phoneSummary: method === 'PHONE' ? phoneSummary.trim() : null,
              recipient: {
                recipientType: 'PRIMARY_CARE_PRESCRIBER',
                name: recipientName.trim(),
                profession: null,
                clinicName: null,
                fax: fax.trim() || null,
                phone: null,
                secureMessageAddress: null,
              } satisfies RenewCommunicationRecipient,
            }).finally(() => setSaving(false));
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="renew-comm-recipient">Recipient name</Label>
            <Input
              id="renew-comm-recipient"
              value={recipientName}
              onChange={(e) => setRecipientName(e.target.value)}
              placeholder="e.g. Dr. Smith / Clinic fax"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="renew-comm-fax">Fax number (optional)</Label>
            <Input
              id="renew-comm-fax"
              value={fax}
              onChange={(e) => setFax(e.target.value)}
              placeholder="780-555-1234"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="renew-comm-method">Method</Label>
            <Select
              id="renew-comm-method"
              value={method}
              onChange={(e) => setMethod(e.target.value as RenewCommunicationMethod)}
              options={RENEW_COMMUNICATION_METHOD_OPTIONS.map((row) => ({
                value: row.id,
                label: row.label,
              }))}
            />
          </div>
          {method === 'PHONE' ? (
            <div className="space-y-1.5">
              <Label htmlFor="renew-comm-phone">Telephone summary</Label>
              <Input
                id="renew-comm-phone"
                value={phoneSummary}
                onChange={(e) => setPhoneSummary(e.target.value)}
              />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="renew-comm-note">Note (optional)</Label>
            <Input id="renew-comm-note" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={saving || pending}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || pending}>
              {saving || pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Record communication
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
