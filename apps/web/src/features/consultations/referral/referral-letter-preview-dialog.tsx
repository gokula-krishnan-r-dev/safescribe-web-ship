'use client';

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Check, Cloud, FileText, Info, Loader2, Printer, Send, Sparkles } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/lib/notify';
import { useBlockParentDialogClose } from '@/components/ui/nested-dialog-dismiss';
import { fieldToPlainText } from '../documents/tiptap-text';
import { writeClipboardText } from '../documents/copy-document-text';
import { printHtmlDocument } from '../documents/print-html-document';
import { SendFaxDialog } from '../documents/send-fax-dialog';
import type { FaxRecipientScope } from '../documents/fax-recipient-storage';
import { formatClinicalDobInput } from '../clinical-dob-input';
import {
  REFERRAL_LETTER_CLINICAL_DETAIL_ROWS,
  REFERRAL_LETTER_PRINT_CSS,
  buildReferralLetterPrintDocument,
  contactLine,
  dobConflictsWithRecordedAge,
  emptyClinicalDetails,
  overlayClinicalDetailsFromSeed,
  parseReferralLetterDocument,
  patientIdentityComplete,
  pharmacistDisplayName,
  referralLetterDocumentToPlainText,
  referralLetterDocumentToPrintHtml,
  senderIdentityComplete,
  serializeReferralLetterDocument,
  type ReferralLetterClinicalDetails,
  type ReferralLetterDocument,
} from '@safescript/shared';
import { ReferralReasonEditor } from './referral-reason-editor';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  letterDraft: string;
  fallbackSeed?: ReferralLetterDocument | null;
  recordedAgeYears?: number | null;
  onDraftChange?: (draft: string) => void | Promise<void>;
  onApprove?: (draft: string) => void | Promise<void>;
  approving?: boolean;
  alreadyApproved?: boolean;
  onReopenEdit?: () => void | Promise<void>;
  onSendFax?: (payload: {
    recipientName: string;
    faxNumber: string;
    html: string;
  }) => Promise<void>;
  faxSending?: boolean;
  faxStorageScope?: FaxRecipientScope;
  reasonNeedsReview?: boolean;
  reasonOrigin?: 'AI_DRAFT' | 'AI_EDITED' | 'RULE_TEMPLATE' | 'MANUAL' | 'NONE';
}

type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';
const AUTOSAVE_MS = 800;

function loadDocument(
  letterDraft: string,
  seed?: ReferralLetterDocument | null,
): { doc: ReferralLetterDocument; replacedClinical: boolean } {
  const parsed = parseReferralLetterDocument(letterDraft);
  if (parsed) {
    if (!seed) return { doc: parsed, replacedClinical: false };
    const clinicalDetails = overlayClinicalDetailsFromSeed(
      parsed.clinicalDetails,
      seed.clinicalDetails,
    );
    return {
      doc: { ...parsed, clinicalDetails },
      replacedClinical:
        JSON.stringify(parsed.clinicalDetails) !== JSON.stringify(clinicalDetails),
    };
  }
  if (seed) {
    const plain = fieldToPlainText(letterDraft).trim();
    return {
      doc: { ...seed, reasonForReferral: plain || seed.reasonForReferral },
      replacedClinical: false,
    };
  }
  return {
    doc: {
      schema: 'referral-letter-v3',
      letterDate: '',
      recipientLine: '',
      subject: '',
      salutation: 'Dear Colleague,',
      reasonForReferral: fieldToPlainText(letterDraft),
      clinicalDetails: emptyClinicalDetails(),
      patient: { fullName: '', dateOfBirth: '', healthNumber: '', healthNumberNotAvailable: false },
      pharmacist: {
        displayName: '',
        credentials: '',
        pharmacyName: '',
        pharmacyAddress: '',
        pharmacyPhone: null,
        pharmacyFax: null,
        pharmacyLicense: null,
      },
      consultationRef: '',
    },
    replacedClinical: false,
  };
}

export function ReferralLetterPreviewDialog({
  open,
  onOpenChange,
  letterDraft,
  fallbackSeed,
  recordedAgeYears,
  onDraftChange,
  onApprove,
  approving,
  alreadyApproved,
  onReopenEdit,
  onSendFax,
  faxSending = false,
  faxStorageScope,
  reasonNeedsReview = false,
  reasonOrigin = 'NONE',
}: Props) {
  const [doc, setDoc] = useState(() => loadDocument(letterDraft, fallbackSeed).doc);
  const [editorEpoch, setEditorEpoch] = useState(0);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [attemptedAction, setAttemptedAction] = useState(false);
  const [reasonEdited, setReasonEdited] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [faxOpen, setFaxOpen] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [faxNotice, setFaxNotice] = useState<{ kind: 'submitted' | 'failed'; message: string } | null>(
    null,
  );
  const { shouldBlock: shouldBlockPreviewClose, arm: armPreviewCloseHold } =
    useBlockParentDialogClose(faxOpen || faxSending || printing);

  const closeFaxDialog = () => {
    if (faxSending) return;
    armPreviewCloseHold();
    setFaxOpen(false);
  };

  const nameRef = useRef<HTMLInputElement>(null);
  const dobRef = useRef<HTMLInputElement>(null);
  const phnRef = useRef<HTMLInputElement>(null);
  const patientSectionRef = useRef<HTMLElement>(null);
  const docRef = useRef(doc);
  const dirtyRef = useRef(false);
  const seedRef = useRef(letterDraft);
  const fallbackSeedRef = useRef(fallbackSeed);
  const wasOpenRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savingRef = useRef(false);
  const alreadyApprovedRef = useRef(Boolean(alreadyApproved));
  const skipAutosaveRef = useRef(false);
  const lastSaveOkRef = useRef(true);
  fallbackSeedRef.current = fallbackSeed;
  alreadyApprovedRef.current = Boolean(alreadyApproved);

  useEffect(() => {
    if (!alreadyApproved && !approving) skipAutosaveRef.current = false;
    if (alreadyApproved) skipAutosaveRef.current = true;
  }, [alreadyApproved, approving]);

  useEffect(() => {
    const justOpened = open && !wasOpenRef.current;
    wasOpenRef.current = open;
    if (!open) {
      skipAutosaveRef.current = false;
      return;
    }
    const draftChanged = letterDraft !== seedRef.current;
    if (!justOpened && !draftChanged) return;
    seedRef.current = letterDraft;
    const { doc: next, replacedClinical } = loadDocument(letterDraft, fallbackSeedRef.current);
    setDoc(next);
    docRef.current = next;
    const freeze = alreadyApprovedRef.current || skipAutosaveRef.current;
    dirtyRef.current = freeze ? false : replacedClinical;
    setSaveStatus(freeze ? 'idle' : replacedClinical ? 'dirty' : 'idle');
    setAttemptedAction(false);
    setReasonEdited(false);
    setFaxNotice(null);
    setEditorEpoch((n) => n + 1);
  }, [open, letterDraft]);

  useEffect(() => {
    if (!open) setFaxOpen(false);
  }, [open]);

  useEffect(
    () => () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    },
    [],
  );

  const identityComplete = patientIdentityComplete(doc.patient);
  const dobConflict =
    Boolean(doc.patient.dateOfBirth) &&
    dobConflictsWithRecordedAge(doc.patient.dateOfBirth, recordedAgeYears);
  const senderMissing = !senderIdentityComplete(doc.pharmacist);
  const reasonEmpty = !fieldToPlainText(doc.reasonForReferral).trim();
  const identityBlocked = !identityComplete || senderMissing || dobConflict || reasonEmpty;
  const saving = saveStatus === 'saving';
  const exportBlocked = identityBlocked || saving;

  const persist = async (opts?: { force?: boolean }): Promise<boolean> => {
    if (alreadyApprovedRef.current) return true;
    if (skipAutosaveRef.current && !opts?.force) return true;
    if (!onDraftChange) return true;
    const started = Date.now();
    while (savingRef.current && Date.now() - started < 8000) {
      await new Promise((resolve) => setTimeout(resolve, 40));
    }
    if (alreadyApprovedRef.current) return true;
    if (skipAutosaveRef.current && !opts?.force) return true;
    if (!dirtyRef.current) return lastSaveOkRef.current && !savingRef.current;
    if (savingRef.current) return false;
    savingRef.current = true;
    setSaveStatus('saving');
    const payload = serializeReferralLetterDocument(docRef.current);
    seedRef.current = payload;
    dirtyRef.current = false;
    try {
      await onDraftChange(payload);
      if (alreadyApprovedRef.current || (skipAutosaveRef.current && !opts?.force)) {
        lastSaveOkRef.current = true;
        return true;
      }
      lastSaveOkRef.current = true;
      setSaveStatus('saved');
      return true;
    } catch {
      dirtyRef.current = true;
      lastSaveOkRef.current = false;
      setSaveStatus('error');
      toast.error('Could not save letter edits');
      return false;
    } finally {
      savingRef.current = false;
    }
  };

  const scheduleAutosave = () => {
    if (alreadyApprovedRef.current || skipAutosaveRef.current || !onDraftChange) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => void persist(), AUTOSAVE_MS);
  };

  useEffect(() => {
    if (!open || saveStatus !== 'dirty') return;
    scheduleAutosave();
    // Overlay-on-open marks the draft dirty; persist the corrected clinical rows.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- persist/schedule are render-local
  }, [open, saveStatus]);

  const patchDoc = (next: ReferralLetterDocument) => {
    setDoc(next);
    docRef.current = next;
    dirtyRef.current = true;
    setSaveStatus('dirty');
    scheduleAutosave();
  };

  const focusFirstMissing = () => {
    patientSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (!doc.patient.fullName.trim()) nameRef.current?.focus();
    else if (!doc.patient.dateOfBirth) dobRef.current?.focus();
    else if (!doc.patient.healthNumberNotAvailable && !doc.patient.healthNumber.trim()) {
      phnRef.current?.focus();
    }
  };

  const guardRestricted = (): boolean => {
    if (!identityBlocked) return true;
    setAttemptedAction(true);
    focusFirstMissing();
    toast.error(
      senderMissing
        ? 'Pharmacy or pharmacist details are missing from the verified profile.'
        : dobConflict
          ? 'Date of birth does not match the recorded age. Please review.'
          : reasonEmpty
            ? 'Add a reason for referral before approving.'
            : 'Add required patient details to approve',
    );
    return false;
  };

  const handleClose = async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    await persist();
    onOpenChange(false);
  };

  const handleApprove = async () => {
    if (!onApprove || approving) return;
    if (!guardRestricted()) return;
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    skipAutosaveRef.current = true;
    const saved = await persist({ force: true });
    if (!saved) {
      skipAutosaveRef.current = alreadyApprovedRef.current;
      return;
    }
    try {
      await onApprove(serializeReferralLetterDocument(docRef.current));
    } catch {
      skipAutosaveRef.current = alreadyApprovedRef.current;
      if (dirtyRef.current) scheduleAutosave();
    }
  };

  const handlePrint = () => {
    if (printing) return;
    if (!guardRestricted()) return;
    if (!alreadyApproved) return;
    void persist();
    setPrinting(true);
    void printHtmlDocument(
      buildReferralLetterPrintDocument(docRef.current, { draft: false }),
    )
      .catch(() => {
        toast.error('Could not open the print dialog');
      })
      .finally(() => setPrinting(false));
  };

  const handleEditLetter = async () => {
    if (!onReopenEdit || reopening) return;
    setReopening(true);
    try {
      await onReopenEdit();
    } catch {
      toast.error('Could not reopen the letter for editing');
    } finally {
      setReopening(false);
    }
  };

  const busy = Boolean(approving || printing || faxSending || reopening);
  const readOnly = Boolean(alreadyApproved);
  const canFax = Boolean(alreadyApproved && onSendFax && faxStorageScope);
  const pharmacist = pharmacistDisplayName(doc.pharmacist);
  const contacts = contactLine(doc.pharmacist.pharmacyPhone, doc.pharmacist.pharmacyFax);
  const origin = reasonEdited && (reasonOrigin === 'AI_DRAFT' || reasonOrigin === 'AI_EDITED')
    ? 'AI_EDITED'
    : reasonOrigin;
  const reasonBadge =
    origin === 'AI_EDITED'
      ? 'Assisted · edited'
      : origin === 'RULE_TEMPLATE'
        ? 'Suggested draft'
        : origin === 'MANUAL'
          ? null
          : 'Assisted · editable';

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!v) {
            if (shouldBlockPreviewClose()) return;
            void handleClose();
          } else onOpenChange(true);
        }}
      >
        <DialogContent
          className="flex h-[min(94vh,980px)] w-[min(98vw,980px)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:rounded-2xl"
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
          <DialogHeader className="shrink-0 space-y-1 border-b border-border px-5 py-3.5 pr-12 text-left">
            <DialogTitle className="flex items-center gap-2 text-base font-semibold">
              <FileText className="h-4 w-4 shrink-0 text-primary" />
              Referral letter
            </DialogTitle>
            <DialogDescription className="text-left text-xs leading-relaxed sm:text-[13px]">
              {readOnly
                ? 'The letter is approved. Copy, print or fax this version, or return to the consultation. Approval does not mean the referral has been sent.'
                : 'Review and approve this letter before it is copied, printed or faxed. Approval does not mean the referral has been sent.'}
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 overflow-y-auto bg-[#f3f5f6] px-3 py-4 sm:px-6">
            {readOnly ? (
              <div
                role="status"
                aria-live="polite"
                className="mx-auto mb-3 flex w-full max-w-[920px] items-start gap-2.5 rounded-lg border border-primary/20 bg-[#F0FAF9] px-4 py-3 text-[13px] text-[#0f3f3c]"
              >
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden />
                <div>
                  <p className="font-semibold">Referral letter approved</p>
                  <p className="mt-0.5 leading-relaxed">
                    The letter is ready to copy, print or fax. Approval does not mean it has been
                    sent.
                  </p>
                </div>
              </div>
            ) : null}
            {faxNotice ? (
              <div
                role="status"
                aria-live="polite"
                className={
                  faxNotice.kind === 'failed'
                    ? 'mx-auto mb-3 w-full max-w-[920px] rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-950'
                    : 'mx-auto mb-3 w-full max-w-[920px] rounded-lg border border-primary/20 bg-[#F0FAF9] px-4 py-3 text-[13px] text-[#0f3f3c]'
                }
              >
                <p className="font-semibold">
                  {faxNotice.kind === 'failed' ? 'Fax could not be sent' : 'Fax submitted'}
                </p>
                <p className="mt-0.5 leading-relaxed">{faxNotice.message}</p>
              </div>
            ) : null}
            {!identityComplete ? (
              <div className="mx-auto mb-3 flex w-full max-w-[920px] items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-950">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                  <div>
                    <p className="font-semibold">Patient details required</p>
                    <p className="mt-0.5 leading-relaxed">
                      Patient identification was not collected during this consultation. Add the
                      patient&apos;s name and date of birth before approving. Add PHN when available.
                    </p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="h-8 shrink-0 border-primary/40 text-primary"
                  onClick={focusFirstMissing}
                >
                  Add patient details
                </Button>
              </div>
            ) : null}
            {senderMissing ? (
              <div className="mx-auto mb-3 w-full max-w-[920px] rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-950">
                <p className="font-semibold">Practice details required</p>
                <p className="mt-0.5 leading-relaxed">
                  Pharmacist or pharmacy identity is missing from the verified profile. Approval and
                  export stay disabled until those details are configured.
                </p>
              </div>
            ) : null}
            {reasonNeedsReview ? (
              <div className="mx-auto mb-3 w-full max-w-[920px] rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[12.5px] text-amber-950">
                <span className="font-semibold">Reason for referral needs review.</span> The saved
                reason does not name the selected concern.
              </div>
            ) : null}

            <article className="mx-auto w-full max-w-[920px] rounded-[18px] border border-[#e2eaed] bg-white px-5 py-6 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_12px_28px_rgba(16,24,40,0.06)] sm:px-10 sm:py-8">
              <header className="border-b-2 border-primary pb-4">
                <div className="text-[14px] leading-snug text-[#1f2933]">
                  {pharmacist ? <p className="font-bold">{pharmacist}</p> : null}
                  {doc.pharmacist.pharmacyName ? (
                    <p className="font-semibold">{doc.pharmacist.pharmacyName}</p>
                  ) : null}
                  {doc.pharmacist.pharmacyAddress ? <p>{doc.pharmacist.pharmacyAddress}</p> : null}
                  {contacts ? <p>{contacts}</p> : null}
                </div>
              </header>

              <section className="mt-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-[14px]">
                <p>
                  <strong>Date:</strong> {doc.letterDate || '—'}
                </p>
                <p>
                  <strong>To:</strong> {doc.recipientLine || '—'}
                </p>
              </section>

              <section ref={patientSectionRef} className="mt-5">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[#4b5563]">
                  Patient information
                </p>
                <div className="grid gap-3 sm:grid-cols-[1.2fr_1fr_1fr]">
                  <label className="block text-[12.5px]">
                    <span className="mb-1 block font-semibold">
                      Full name <span className="text-destructive">*</span>
                    </span>
                    <Input
                      ref={nameRef}
                      value={doc.patient.fullName}
                      maxLength={200}
                      placeholder="Enter patient’s full name"
                      disabled={readOnly || busy}
                      aria-invalid={
                        attemptedAction && !doc.patient.fullName.trim() ? true : undefined
                      }
                      onChange={(e) =>
                        patchDoc({ ...doc, patient: { ...doc.patient, fullName: e.target.value } })
                      }
                    />
                  </label>
                  <label className="block text-[12.5px]">
                    <span className="mb-1 block font-semibold">
                      Date of birth <span className="text-destructive">*</span>
                    </span>
                    <Input
                      ref={dobRef}
                      type="text"
                      inputMode="numeric"
                      autoComplete="bday"
                      maxLength={10}
                      placeholder="YYYY-MM-DD"
                      value={doc.patient.dateOfBirth}
                      aria-label="Date of birth"
                      aria-describedby="referral-letter-dob-hint"
                      aria-invalid={
                        (attemptedAction && !doc.patient.dateOfBirth) || dobConflict || undefined
                      }
                      disabled={readOnly || busy}
                      onChange={(e) =>
                        patchDoc({
                          ...doc,
                          patient: {
                            ...doc.patient,
                            dateOfBirth: formatClinicalDobInput(e.target.value),
                          },
                        })
                      }
                    />
                    <p
                      id="referral-letter-dob-hint"
                      className="mt-1 text-[11px] text-muted-foreground"
                    >
                      Format: YYYY-MM-DD
                    </p>
                  </label>
                  <div className="text-[12.5px]">
                    <span className="mb-1 block font-semibold">PHN</span>
                    <div className="flex items-center gap-3">
                      <Input
                        ref={phnRef}
                        value={doc.patient.healthNumber}
                        placeholder="Enter PHN"
                        disabled={readOnly || doc.patient.healthNumberNotAvailable}
                        aria-invalid={
                          (attemptedAction &&
                            !doc.patient.healthNumberNotAvailable &&
                            !doc.patient.healthNumber.trim()) ||
                          undefined
                        }
                        onChange={(e) =>
                          patchDoc({
                            ...doc,
                            patient: {
                              ...doc.patient,
                              healthNumber: e.target.value,
                              healthNumberNotAvailable: false,
                            },
                          })
                        }
                      />
                      <label className="inline-flex shrink-0 items-center gap-2 text-[12px] text-muted-foreground">
                        <input
                          type="checkbox"
                          disabled={readOnly || busy}
                          checked={doc.patient.healthNumberNotAvailable}
                          onChange={(e) =>
                            patchDoc({
                              ...doc,
                              patient: {
                                ...doc.patient,
                                healthNumberNotAvailable: e.target.checked,
                                healthNumber: e.target.checked ? '' : doc.patient.healthNumber,
                              },
                            })
                          }
                        />
                        Not available
                      </label>
                    </div>
                  </div>
                </div>
                {dobConflict ? (
                  <p className="mt-2 text-[12.5px] font-medium text-amber-800" role="alert">
                    Date of birth does not match the recorded age. Please review.
                  </p>
                ) : null}
              </section>

              {doc.subject ? (
                <p className="mt-5 text-[15px] font-bold leading-snug">Re: {doc.subject}</p>
              ) : null}
              <p className="mt-3 text-[14.5px]">{doc.salutation || 'Dear Colleague,'}</p>

              <section className="mt-5">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <h3 className="text-[15px] font-bold">Reason for referral</h3>
                  {reasonBadge ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/12 px-2 py-0.5 text-[11px] font-semibold text-primary">
                      <Sparkles className="h-3 w-3" />
                      {reasonBadge}
                    </span>
                  ) : null}
                </div>
                {open ? (
                  <ReferralReasonEditor
                    editorKey={`referral-reason:${editorEpoch}`}
                    value={doc.reasonForReferral}
                    onChange={(html) => {
                      setReasonEdited(true);
                      patchDoc({ ...doc, reasonForReferral: html });
                    }}
                    disabled={busy || readOnly}
                  />
                ) : null}
              </section>

              <section className="mt-6">
                <h3 className="mb-3 text-[15px] font-bold">Relevant clinical information</h3>
                <dl className="grid gap-y-4">
                  <ClinicalRow
                    label="Referral finding"
                    value={doc.clinicalDetails.referralFinding ?? ''}
                    readOnly={readOnly}
                    onChange={(value) =>
                      patchDoc({
                        ...doc,
                        clinicalDetails: { ...doc.clinicalDetails, referralFinding: value },
                      })
                    }
                  />
                  {REFERRAL_LETTER_CLINICAL_DETAIL_ROWS.map((row) => (
                    <ClinicalRow
                      key={row.key}
                      label={row.label}
                      value={doc.clinicalDetails[row.key] ?? ''}
                      readOnly={readOnly}
                      onChange={(value) =>
                        patchDoc({
                          ...doc,
                          clinicalDetails: {
                            ...doc.clinicalDetails,
                            [row.key]: value,
                          } as ReferralLetterClinicalDetails,
                        })
                      }
                    />
                  ))}
                </dl>
              </section>

              <section className="mt-8 text-[14px] leading-snug">
                <p>Sincerely,</p>
                {pharmacist ? <p className="mt-3 font-bold">{pharmacist}</p> : null}
                {doc.pharmacist.pharmacyName ? <p>{doc.pharmacist.pharmacyName}</p> : null}
                {contacts ? <p>{contacts}</p> : null}
              </section>
              {doc.consultationRef ? (
                <p className="mt-6 text-[12px] text-muted-foreground">
                  Consultation reference: {doc.consultationRef}
                </p>
              ) : null}
            </article>
          </div>

          <DialogFooter className="shrink-0 flex-col items-stretch gap-3 border-t border-[#d5e2e6] bg-white px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-5">
            {readOnly ? (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
                <Check className="h-3 w-3" />
                Approved
              </span>
            ) : (
              <SaveHint status={saveStatus} />
            )}
            {!readOnly && identityBlocked ? (
              <p className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
                <Info className="h-3.5 w-3.5 shrink-0" />
                {senderMissing
                  ? 'Add pharmacist and pharmacy details to approve'
                  : 'Add required patient details to approve'}
              </p>
            ) : (
              <span className="hidden sm:block" />
            )}
            <div className="flex flex-wrap items-center gap-2">
              {readOnly ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10"
                    disabled={busy}
                    onClick={() => void handleEditLetter()}
                  >
                    {reopening ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Edit letter
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10"
                    disabled={busy}
                    onClick={() => {
                      void (async () => {
                        try {
                          await writeClipboardText(
                            referralLetterDocumentToPlainText(docRef.current),
                          );
                          toast.success('Referral letter copied', { announce: true });
                        } catch {
                          toast.error('Could not copy to clipboard');
                        }
                      })();
                    }}
                  >
                    Copy
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 gap-1.5"
                    disabled={busy}
                    onClick={handlePrint}
                  >
                    {printing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Printer className="h-3.5 w-3.5" />
                    )}
                    Print
                  </Button>
                  {canFax ? (
                    <Button
                      type="button"
                      variant="outline"
                      className="h-10 gap-1.5"
                      disabled={busy}
                      onClick={() => setFaxOpen(true)}
                    >
                      {faxSending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Send className="h-3.5 w-3.5" />
                      )}
                      Fax
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    className="h-10 min-w-[168px]"
                    disabled={busy}
                    onClick={() => void handleClose()}
                  >
                    Return to consultation
                  </Button>
                </>
              ) : (
                <>
                  <Button type="button" variant="outline" className="h-10" disabled={busy} onClick={() => void handleClose()}>
                    Cancel
                  </Button>
                  {onApprove ? (
                    <Button
                      type="button"
                      className="h-10 min-w-[132px]"
                      disabled={busy || exportBlocked}
                      onClick={() => void handleApprove()}
                    >
                      {approving ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Approving letter…
                        </>
                      ) : (
                        'Approve letter'
                      )}
                    </Button>
                  ) : (
                    <Button type="button" className="h-10" onClick={() => void handleClose()}>
                      Done
                    </Button>
                  )}
                </>
              )}
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {canFax ? (
        <SendFaxDialog
          open={faxOpen}
          documentName="Referral letter"
          storageScope={faxStorageScope!}
          submitting={faxSending}
          onClose={closeFaxDialog}
          onSubmit={async (values) => {
            try {
              await onSendFax?.({
                ...values,
                html: `<style>${REFERRAL_LETTER_PRINT_CSS}</style>${referralLetterDocumentToPrintHtml(docRef.current, { draft: false })}`,
              });
              setFaxNotice({
                kind: 'submitted',
                message: `Submitted to ${values.recipientName}. Delivery is confirmed when the recipient receives it. The letter remains approved.`,
              });
              armPreviewCloseHold();
              setFaxOpen(false);
            } catch {
              setFaxNotice({
                kind: 'failed',
                message:
                  'The letter remains approved. Try again, print it, or record another referral-handling method.',
              });
              armPreviewCloseHold();
              setFaxOpen(false);
            }
          }}
        />
      ) : null}
    </>
  );
}

function ClinicalRow({
  label,
  value,
  onChange,
  readOnly,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}) {
  const lines = value ? value.split('\n').length : 1;
  return (
    <div className="grid gap-1.5 sm:grid-cols-[220px_minmax(0,1fr)] sm:items-start">
      <dt className="pt-2.5 text-[13.5px] font-semibold leading-snug text-[#1f2933]">{label}</dt>
      <dd>
        <Textarea
          value={value}
          placeholder="Included when recorded"
          readOnly={readOnly}
          disabled={readOnly}
          rows={Math.min(6, Math.max(2, lines))}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-[44px] resize-y border-[#D5DEE1] py-2.5 leading-relaxed shadow-none"
        />
      </dd>
    </div>
  );
}

function SaveHint({ status }: { status: SaveStatus }) {
  if (status === 'saving') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
        Saving…
      </span>
    );
  }
  if (status === 'saved') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-600">
        <Check className="h-3 w-3" />
        Saved
      </span>
    );
  }
  if (status === 'error') {
    return <span className="text-[11px] text-destructive">Save failed</span>;
  }
  if (status === 'dirty') {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Cloud className="h-3 w-3" />
        Unsaved edits
      </span>
    );
  }
  return <span className="text-[11px] text-muted-foreground">Editable draft</span>;
}
