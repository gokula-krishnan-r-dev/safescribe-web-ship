'use client';

import { useEffect, useRef, useState } from 'react';
import { toast } from '@/lib/notify';
import { Check, Copy, FileUp, Loader2, Sparkles, Upload, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { getErrorMessage } from '@/lib/errors';
import {
  useCommitDifferentialsImport,
  useCommitPresentationReviewImport,
  useCommitRedFlagsImport,
  useCommitReferencesImport,
  useCommitTreatmentsImport,
  useImportChatGptScript,
  usePreviewDifferentialsImport,
  usePreviewPresentationReviewImport,
  usePreviewRedFlagsImport,
  usePreviewReferencesImport,
  usePreviewTreatmentsImport,
} from './hooks';
import {
  getChatGptImportConfig,
  type ChatGptImportTarget,
} from './chatgpt-import-prompts';
import {
  ReferencesImportPreviewStep,
  type ReferenceImportAction,
  type ReferenceImportPreview,
} from './references-governance/references-import-preview';
import {
  PresentationReviewImportPreview,
  type PresentationReviewImportPreview as PresentationReviewImportPreviewData,
} from './presentation-review/presentation-review-import-preview';
import {
  RedFlagsImportPreview,
  type RedFlagsImportPreview as RedFlagsImportPreviewData,
} from './red-flags/red-flags-import-preview';
import {
  DifferentialsImportPreview,
  type DifferentialsImportPreview as DifferentialsImportPreviewData,
} from './differentials/differentials-import-preview';
import {
  TreatmentsImportPreview,
  type TreatmentsImportPreview as TreatmentsImportPreviewData,
} from './treatments/treatments-import-preview';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';

const SCRIPT_ACCEPT =
  '.txt,.md,.markdown,.json,.doc,.docx,text/plain,text/markdown,application/json,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

export function ImportFromChatGptModal({
  open,
  onClose,
  pathwayId,
  target,
  pathwayName,
  condition,
  province,
}: {
  open: boolean;
  onClose: () => void;
  pathwayId: string;
  target: ChatGptImportTarget;
  pathwayName: string;
  condition: string;
  province?: string;
  customAssessmentEnabled?: boolean;
}) {
  const config = getChatGptImportConfig(target);
  const importMutation = useImportChatGptScript(pathwayId);
  const previewReferences = usePreviewReferencesImport(pathwayId);
  const commitReferences = useCommitReferencesImport(pathwayId);
  const previewAssessment = usePreviewPresentationReviewImport(pathwayId);
  const commitAssessment = useCommitPresentationReviewImport(pathwayId);
  const previewRedFlags = usePreviewRedFlagsImport(pathwayId);
  const commitRedFlags = useCommitRedFlagsImport(pathwayId);
  const previewDifferentials = usePreviewDifferentialsImport(pathwayId);
  const commitDifferentials = useCommitDifferentialsImport(pathwayId);
  const previewTreatments = usePreviewTreatmentsImport(pathwayId);
  const commitTreatments = useCommitTreatmentsImport(pathwayId);
  const fileRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');
  const [fileUpload, setFileUpload] = useState<{ name: string; base64: string } | null>(null);
  const [mode, setMode] = useState<'merge' | 'replace'>('merge');
  const [copied, setCopied] = useState(false);
  const [step, setStep] = useState<'paste' | 'preview'>('paste');
  const [preview, setPreview] = useState<ReferenceImportPreview | null>(null);
  const [assessmentPreview, setAssessmentPreview] = useState<PresentationReviewImportPreviewData | null>(
    null,
  );
  const [redFlagsPreview, setRedFlagsPreview] = useState<RedFlagsImportPreviewData | null>(null);
  const [differentialsPreview, setDifferentialsPreview] =
    useState<DifferentialsImportPreviewData | null>(null);
  const [treatmentsPreview, setTreatmentsPreview] = useState<TreatmentsImportPreviewData | null>(
    null,
  );
  const [decisions, setDecisions] = useState<Record<string, ReferenceImportAction>>({});
  const [replaceConfirmOpen, setReplaceConfirmOpen] = useState(false);

  const isReferences = target === 'references';
  const isAssessment = target === 'assessment';
  const isRedFlags = target === 'red-flags';
  const isDifferentials = target === 'differentials';
  const isTreatments = target === 'treatments';
  const usesPreview =
    isReferences || isAssessment || isRedFlags || isDifferentials || isTreatments;
  const busy =
    importMutation.isPending ||
    previewReferences.isPending ||
    commitReferences.isPending ||
    previewAssessment.isPending ||
    commitAssessment.isPending ||
    previewRedFlags.isPending ||
    commitRedFlags.isPending ||
    previewDifferentials.isPending ||
    commitDifferentials.isPending ||
    previewTreatments.isPending ||
    commitTreatments.isPending;

  const prompt = config.promptTemplate({ pathwayName, condition, province });

  useEffect(() => {
    if (!open) return;
    setText('');
    setFileUpload(null);
    setMode('merge');
    setCopied(false);
    setStep('paste');
    setPreview(null);
    setAssessmentPreview(null);
    setRedFlagsPreview(null);
    setDifferentialsPreview(null);
    setTreatmentsPreview(null);
    setDecisions({});
    setReplaceConfirmOpen(false);
  }, [open, target, pathwayId]);

  const handleCopyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      toast.success('Prompt copied — paste it into ChatGPT', { announce: true });
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Could not copy. Select the prompt and copy manually.');
    }
  };

  const handleFile = async (file: File | null) => {
    if (!file) return;
    const name = file.name.toLowerCase();
    const isWord =
      /\.(docx|doc)$/.test(name) ||
      /wordprocessingml|msword/.test(file.type);
    const isText =
      /\.(txt|md|markdown|json)$/.test(name) ||
      !file.type ||
      file.type.startsWith('text/') ||
      file.type === 'application/json';

    if (!isWord && !isText) {
      toast.error('Upload a .txt, .md, .json, or Word (.docx) file.');
      return;
    }
    if (file.size > 2_000_000) {
      toast.error('File is too large (max 2 MB).');
      return;
    }
    try {
      if (isWord) {
        const base64 = await fileToBase64(file);
        setFileUpload({ name: file.name, base64 });
        setText('');
        return;
      }
      setFileUpload(null);
      setText(await file.text());
    } catch {
      toast.error('Could not read that file.');
    }
  };

  const handleReviewReferences = async () => {
    if (text.trim().length < 8 && !fileUpload) {
      toast.error('Paste ChatGPT’s response (or upload a Word / text file) first.');
      return;
    }
    try {
      const result = await previewReferences.mutateAsync({
        text: fileUpload ? undefined : text,
        fileBase64: fileUpload?.base64,
        fileName: fileUpload?.name,
      });
      const initial: Record<string, ReferenceImportAction> = {};
      for (const row of result.rows) {
        initial[row.importKey] = row.blockingErrors.length ? 'skip' : row.defaultAction;
      }
      setDecisions(initial);
      setPreview(result);
      setStep('preview');
      if (result.reviewerGovernanceIgnored) {
        toast.message(
          'Reviewer/governance information was ignored. Reviewer records must be entered manually.',
        );
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not parse reference library. Check the format.'));
    }
  };

  const handleCommitReferences = async () => {
    if (!preview) return;
    try {
      const result = await commitReferences.mutateAsync({
        text: fileUpload ? undefined : text,
        fileBase64: fileUpload?.base64,
        fileName: fileUpload?.name,
        mode,
        decisions: preview.rows.map((row) => ({
          importKey: row.importKey,
          action: decisions[row.importKey] ?? row.defaultAction,
          existingReferenceId: row.match?.existingReferenceId,
        })),
      });
      toast.success(result.message || 'References imported. Review before verification.', {
        announce: true,
      });
      setText('');
      setFileUpload(null);
      setPreview(null);
      setStep('paste');
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Import failed. Check decisions and try again.'));
    }
  };

  const handleReviewAssessment = async () => {
    if (text.trim().length < 8 && !fileUpload) {
      toast.error('Paste ChatGPT’s response (or upload a Word / text file) first.');
      return;
    }
    try {
      const result = await previewAssessment.mutateAsync({
        text: fileUpload ? undefined : text,
        fileBase64: fileUpload?.base64,
        fileName: fileUpload?.name,
      });
      setAssessmentPreview(result);
      setStep('preview');
      if (result.legacyTwoSectionImport) {
        toast.message('Legacy two-section script detected. Review for overlapping questions.');
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not parse Presentation Review. Check the format.'));
    }
  };

  const handleCommitAssessment = async (confirmedReplace = false) => {
    if (!assessmentPreview) return;
    if (mode === 'replace' && assessmentPreview.existingQuestionCount > 0 && !confirmedReplace) {
      setReplaceConfirmOpen(true);
      return;
    }
    try {
      const result = await commitAssessment.mutateAsync({
        text: fileUpload ? undefined : text,
        fileBase64: fileUpload?.base64,
        fileName: fileUpload?.name,
        mode,
        confirmedReplace: mode === 'replace',
        decisions: assessmentPreview.references.map((row) => ({
          importKey: row.importKey,
          action: row.blockingErrors.length ? 'skip' : row.defaultAction,
          existingReferenceId: row.match?.existingReferenceId,
        })),
      });
      toast.success(
        `${result.message || `Imported ${result.imported} question(s).`}${
          result.duplicateReviewNeeded ? ' Review for duplicate / overlapping questions.' : ''
        }`,
        { announce: true },
      );
      setText('');
      setFileUpload(null);
      setAssessmentPreview(null);
      setStep('paste');
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Import failed. Check the format and try again.'));
    }
  };

  const handleReviewRedFlags = async () => {
    if (text.trim().length < 8 && !fileUpload) {
      toast.error('Paste ChatGPT’s response (or upload a Word / text file) first.');
      return;
    }
    try {
      const result = await previewRedFlags.mutateAsync({
        text: fileUpload ? undefined : text,
        fileBase64: fileUpload?.base64,
        fileName: fileUpload?.name,
      });
      setRedFlagsPreview(result);
      setStep('preview');
      if (result.format === 'legacy') {
        toast.message('Legacy red-flag script detected. Review before importing.');
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not parse Red Flags. Check the format.'));
    }
  };

  const handleCommitRedFlags = async (confirmedReplace = false) => {
    if (!redFlagsPreview) return;
    if (mode === 'replace' && redFlagsPreview.existingFlagCount > 0 && !confirmedReplace) {
      setReplaceConfirmOpen(true);
      return;
    }
    try {
      const result = await commitRedFlags.mutateAsync({
        text: fileUpload ? undefined : text,
        fileBase64: fileUpload?.base64,
        fileName: fileUpload?.name,
        mode,
        confirmedReplace: mode === 'replace',
        decisions: redFlagsPreview.references.map((row) => ({
          importKey: row.importKey,
          action: row.blockingErrors.length ? 'skip' : row.defaultAction,
          existingReferenceId: row.match?.existingReferenceId,
        })),
      });
      toast.success(result.message || `Imported ${result.imported} red flag(s).`, {
        announce: true,
      });
      setText('');
      setFileUpload(null);
      setRedFlagsPreview(null);
      setStep('paste');
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Import failed. Check the format and try again.'));
    }
  };

  const handleReviewDifferentials = async () => {
    if (text.trim().length < 8 && !fileUpload) {
      toast.error('Paste ChatGPT’s response (or upload a Word / text file) first.');
      return;
    }
    try {
      const result = await previewDifferentials.mutateAsync({
        text: fileUpload ? undefined : text,
        fileBase64: fileUpload?.base64,
        fileName: fileUpload?.name,
      });
      setDifferentialsPreview(result);
      setStep('preview');
      if (result.format === 'legacy') {
        toast.message('Legacy differential script detected. Review before importing.');
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not parse Differential Review. Check the format.'));
    }
  };

  const handleCommitDifferentials = async (confirmedReplace = false) => {
    if (!differentialsPreview) return;
    if (mode === 'replace' && differentialsPreview.existingItemCount > 0 && !confirmedReplace) {
      setReplaceConfirmOpen(true);
      return;
    }
    try {
      const result = await commitDifferentials.mutateAsync({
        text: fileUpload ? undefined : text,
        fileBase64: fileUpload?.base64,
        fileName: fileUpload?.name,
        mode,
        confirmedReplace: mode === 'replace',
        decisions: differentialsPreview.references.map((row) => ({
          importKey: row.importKey,
          action: row.blockingErrors.length ? 'skip' : row.defaultAction,
          existingReferenceId: row.match?.existingReferenceId,
        })),
      });
      toast.success(result.message || `Imported ${result.imported} differential(s).`, {
        announce: true,
      });
      setText('');
      setFileUpload(null);
      setDifferentialsPreview(null);
      setStep('paste');
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Import failed. Check the format and try again.'));
    }
  };

  const handleReviewTreatments = async () => {
    if (text.trim().length < 8 && !fileUpload) {
      toast.error('Paste ChatGPT’s response (or upload a Word / text file) first.');
      return;
    }
    try {
      const result = await previewTreatments.mutateAsync({
        text: fileUpload ? undefined : text,
        fileBase64: fileUpload?.base64,
        fileName: fileUpload?.name,
      });
      setTreatmentsPreview(result);
      setStep('preview');
      if (result.format === 'legacy') {
        toast.message('Legacy treatment script detected. Review before importing.');
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Could not parse Treatment Options. Check the format.'));
    }
  };

  const handleCommitTreatments = async (confirmedReplace = false) => {
    if (!treatmentsPreview) return;
    if (mode === 'replace' && treatmentsPreview.existingItemCount > 0 && !confirmedReplace) {
      setReplaceConfirmOpen(true);
      return;
    }
    try {
      const result = await commitTreatments.mutateAsync({
        text: fileUpload ? undefined : text,
        fileBase64: fileUpload?.base64,
        fileName: fileUpload?.name,
        mode,
        confirmedReplace: mode === 'replace',
        decisions: treatmentsPreview.references.map((row) => ({
          importKey: row.importKey,
          action: row.blockingErrors.length ? 'skip' : row.defaultAction,
          existingReferenceId: row.match?.existingReferenceId,
        })),
      });
      toast.success(result.message || `Imported ${result.imported} treatment(s).`, {
        announce: true,
      });
      setText('');
      setFileUpload(null);
      setTreatmentsPreview(null);
      setStep('paste');
      onClose();
    } catch (err) {
      toast.error(getErrorMessage(err, 'Import failed. Check the format and try again.'));
    }
  };

  const handleImport = async () => {
    if (isReferences) {
      if (step === 'paste') {
        await handleReviewReferences();
        return;
      }
      await handleCommitReferences();
      return;
    }

    if (isAssessment) {
      if (step === 'paste') {
        await handleReviewAssessment();
        return;
      }
      await handleCommitAssessment();
      return;
    }

    if (isRedFlags) {
      if (step === 'paste') {
        await handleReviewRedFlags();
        return;
      }
      await handleCommitRedFlags();
      return;
    }

    if (isDifferentials) {
      if (step === 'paste') {
        await handleReviewDifferentials();
        return;
      }
      await handleCommitDifferentials();
      return;
    }

    if (isTreatments) {
      if (step === 'paste') {
        await handleReviewTreatments();
        return;
      }
      await handleCommitTreatments();
      return;
    }

    if (text.trim().length < 8 && !fileUpload) {
      toast.error('Paste ChatGPT’s response (or upload a Word / text file) first.');
      return;
    }
    try {
      const result = await importMutation.mutateAsync({
        target,
        text: fileUpload ? undefined : text,
        fileBase64: fileUpload?.base64,
        fileName: fileUpload?.name,
        mode,
      });
      const imported = result.imported ?? 0;
      const skipped = result.skipped ?? 0;
      if (imported === 0) {
        toast.error(
          skipped
            ? `Nothing new imported — ${skipped} duplicate or empty item${skipped === 1 ? '' : 's'} skipped.`
            : 'Nothing new imported. Check that the response matches the expected format.',
        );
      } else {
        toast.success(
          `Imported ${imported} item${imported === 1 ? '' : 's'}${
            skipped ? ` (${skipped} skipped)` : ''
          }. Review before publishing.${
            result.duplicateReviewNeeded
              ? ' Review for duplicate / overlapping questions.'
              : ''
          }`,
          { announce: true },
        );
        setText('');
        setFileUpload(null);
        onClose();
      }
    } catch (err) {
      toast.error(getErrorMessage(err, 'Import failed. Check the format and try again.'));
    }
  };

  const canImport = Boolean(fileUpload) || text.trim().length >= 8;
  const primaryLabel = usesPreview
    ? step === 'paste'
      ? 'Review import'
      : 'Import'
    : 'Import';
  const assessmentBlocked =
    isAssessment && step === 'preview' && (!assessmentPreview || !assessmentPreview.ok);
  const redFlagsBlocked =
    isRedFlags && step === 'preview' && (!redFlagsPreview || !redFlagsPreview.ok);
  const differentialsBlocked =
    isDifferentials && step === 'preview' && (!differentialsPreview || !differentialsPreview.ok);
  const treatmentsBlocked =
    isTreatments && step === 'preview' && (!treatmentsPreview || !treatmentsPreview.ok);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent
        hideCloseButton
        className={cn(
          'flex w-[min(100vw-1rem,1280px)] max-w-none flex-col gap-0 overflow-hidden p-0',
          'h-[min(92dvh,900px)] max-h-[92dvh]',
          'sm:rounded-2xl',
        )}
      >
        {/* Header */}
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-border/80 px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
              <Sparkles className="h-5 w-5 text-primary" aria-hidden />
            </div>
            <div className="min-w-0 space-y-1">
              <DialogTitle className="text-[18px] font-semibold tracking-tight text-foreground">
                {config.title}
              </DialogTitle>
              <DialogDescription className="text-[13.5px] leading-snug text-muted-foreground">
                {config.description}
              </DialogDescription>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>

        {/* Body */}
        {isReferences && step === 'preview' && preview ? (
          <div className="flex min-h-0 flex-1 flex-col px-5 py-4 sm:px-6">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div>
                <p className="text-[13px] font-semibold text-foreground">3. Review import</p>
                <p className="text-[12px] text-muted-foreground">
                  Choose Use existing, Create new, or Skip for each source. Nothing is verified
                  automatically.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setStep('paste')}
                disabled={busy}
              >
                Back
              </Button>
            </div>
            <ReferencesImportPreviewStep
              preview={preview}
              decisions={decisions}
              onDecisionChange={(key, action) =>
                setDecisions((prev) => ({ ...prev, [key]: action }))
              }
            />
          </div>
        ) : isAssessment && step === 'preview' && assessmentPreview ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex shrink-0 items-center justify-between gap-2 px-5 py-3 sm:px-6">
              <div>
                <p className="text-[13px] font-semibold text-foreground">3. Review import</p>
                <p className="text-[12px] text-muted-foreground">
                  Questions and evidence mappings enter Needs review. Central references are not deleted on Replace.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setStep('paste')}
                disabled={busy}
              >
                Back
              </Button>
            </div>
            <PresentationReviewImportPreview preview={assessmentPreview} />
          </div>
        ) : isRedFlags && step === 'preview' && redFlagsPreview ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex shrink-0 items-center justify-between gap-2 px-5 py-3 sm:px-6">
              <div>
                <p className="text-[13px] font-semibold text-foreground">3. Review import</p>
                <p className="text-[12px] text-muted-foreground">
                  Red flags and evidence mappings enter Needs review. Central references are not deleted on Replace.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setStep('paste')}
                disabled={busy}
              >
                Back
              </Button>
            </div>
            <RedFlagsImportPreview preview={redFlagsPreview} />
          </div>
        ) : isDifferentials && step === 'preview' && differentialsPreview ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex shrink-0 items-center justify-between gap-2 px-5 py-3 sm:px-6">
              <div>
                <p className="text-[13px] font-semibold text-foreground">3. Review import</p>
                <p className="text-[12px] text-muted-foreground">
                  Differentials and evidence mappings enter Needs review. Central references are not
                  deleted on Replace.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setStep('paste')}
                disabled={busy}
              >
                Back
              </Button>
            </div>
            <DifferentialsImportPreview preview={differentialsPreview} />
          </div>
        ) : isTreatments && step === 'preview' && treatmentsPreview ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="flex shrink-0 items-center justify-between gap-2 px-5 py-3 sm:px-6">
              <div>
                <p className="text-[13px] font-semibold text-foreground">3. Review import</p>
                <p className="text-[12px] text-muted-foreground">
                  Treatments and evidence mappings enter Needs review. Unverified eGFR rules stay
                  inactive. Central references are not deleted on Replace.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setStep('paste')}
                disabled={busy}
              >
                Back
              </Button>
            </div>
            <TreatmentsImportPreview preview={treatmentsPreview} />
          </div>
        ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-2 lg:overflow-hidden">
          {/* Prompt column */}
          <section className="flex min-h-[min(42vh,360px)] flex-col border-b border-border/80 lg:min-h-0 lg:border-b-0 lg:border-r">
            <div className="flex shrink-0 items-center justify-between gap-3 px-5 py-3 sm:px-6">
              <div>
                <p className="text-[13px] font-semibold text-foreground">1. Copy prompt</p>
                <p className="text-[12px] text-muted-foreground">Paste into ChatGPT, then return here</p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 shrink-0"
                onClick={handleCopyPrompt}
              >
                {copied ? (
                  <Check className="mr-1.5 h-3.5 w-3.5 text-green-600" aria-hidden />
                ) : (
                  <Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                )}
                {copied ? 'Copied' : 'Copy prompt'}
              </Button>
            </div>
            <div className="min-h-0 flex-1 px-5 pb-4 sm:px-6">
              <pre className="h-full overflow-auto whitespace-pre-wrap rounded-xl border border-border/70 bg-muted/25 p-4 text-[12px] leading-relaxed text-foreground">
                {prompt}
              </pre>
            </div>
          </section>

          {/* Response column */}
          <section className="flex min-h-[min(42vh,360px)] flex-col lg:min-h-0">
            <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 px-5 py-3 sm:px-6">
              <div>
                <p className="text-[13px] font-semibold text-foreground">2. Paste response</p>
                <p className="text-[12px] text-muted-foreground">
                  Or upload a Word / text file (max 2 MB)
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept={SCRIPT_ACCEPT}
                  className="hidden"
                  onChange={(e) => {
                    void handleFile(e.target.files?.[0] ?? null);
                    e.target.value = '';
                  }}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9"
                  onClick={() => fileRef.current?.click()}
                >
                  <Upload className="mr-1.5 h-3.5 w-3.5" aria-hidden />
                  Upload
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-9 text-muted-foreground"
                  onClick={() => {
                    setFileUpload(null);
                    setText(config.exampleOutput);
                  }}
                >
                  Example
                </Button>
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col gap-3 px-5 pb-4 sm:px-6">
              {fileUpload ? (
                <div className="flex shrink-0 items-center justify-between rounded-lg border border-border/70 bg-muted/30 px-3 py-2 text-sm">
                  <span className="truncate text-foreground">{fileUpload.name}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    onClick={() => setFileUpload(null)}
                  >
                    Remove
                  </Button>
                </div>
              ) : null}

              <Label htmlFor="chatgpt-response" className="sr-only">
                ChatGPT response
              </Label>
              <div className="relative min-h-0 flex-1">
                <Textarea
                  id="chatgpt-response"
                  value={text}
                  onChange={(e) => {
                    setFileUpload(null);
                    setText(e.target.value);
                  }}
                  placeholder={
                    fileUpload
                      ? `Using ${fileUpload.name}. You can still paste text here instead.`
                      : config.exampleOutput
                  }
                  className="absolute inset-0 h-full min-h-0 resize-none overflow-auto font-mono text-xs leading-relaxed"
                />
              </div>
            </div>
          </section>
        </div>
        )}

        {/* Footer — options + actions, always visible */}
        <footer className="flex shrink-0 flex-col gap-3 border-t border-border/80 bg-[#f8fbfb] px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex min-w-0 flex-1 flex-col gap-2.5 sm:flex-row sm:items-center sm:gap-4">
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-[12px] font-semibold text-muted-foreground">
                Mode
              </span>
              <div className="flex rounded-lg border border-border bg-white p-0.5">
                {(
                  [
                    { value: 'merge' as const, label: 'Merge' },
                    { value: 'replace' as const, label: 'Replace' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setMode(opt.value)}
                    disabled={busy || (isReferences && step === 'preview')}
                    className={cn(
                      'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                      mode === opt.value
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {isAssessment ? (
              <p className="rounded-md bg-white px-2.5 py-1 text-[12px] font-medium text-foreground ring-1 ring-border">
                Presentation Review
              </p>
            ) : isRedFlags ? (
              <p className="rounded-md bg-white px-2.5 py-1 text-[12px] font-medium text-foreground ring-1 ring-border">
                Red Flags & Safety Screening
              </p>
            ) : isDifferentials ? (
              <p className="rounded-md bg-white px-2.5 py-1 text-[12px] font-medium text-foreground ring-1 ring-border">
                Differential Review
              </p>
            ) : isTreatments ? (
              <p className="rounded-md bg-white px-2.5 py-1 text-[12px] font-medium text-foreground ring-1 ring-border">
                Treatment Options
              </p>
            ) : isReferences ? (
              <p className="text-[12px] text-muted-foreground">
                Imported sources are never auto-verified. Primary documentation reference is not set
                automatically.
              </p>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={busy}
              className="h-10"
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => void handleImport()}
              disabled={
                busy ||
                (step === 'paste' && !canImport) ||
                (isReferences && step === 'preview' && !preview?.rows.length) ||
                assessmentBlocked ||
                redFlagsBlocked ||
                differentialsBlocked ||
                treatmentsBlocked
              }
              className="h-10 min-w-[120px]"
            >
              {busy ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <FileUp className="mr-2 h-4 w-4" aria-hidden />
              )}
              {primaryLabel}
            </Button>
          </div>
        </footer>
      </DialogContent>
      <ConfirmDialog
        open={replaceConfirmOpen}
        onOpenChange={setReplaceConfirmOpen}
        title={
          isTreatments
            ? 'Replace current Treatment Options?'
            : isDifferentials
              ? 'Replace current Differential Review?'
              : isRedFlags
                ? 'Replace current Red Flags?'
                : 'Replace current Presentation Review?'
        }
        description={
          isTreatments
            ? 'Existing draft treatments and evidence mappings in this section will be replaced. Central references in References & Governance will not be deleted. Library-linked treatments are kept.'
            : isDifferentials
              ? 'Existing conditions and evidence mappings in this section will be replaced. Central references in References & Governance will not be deleted.'
              : isRedFlags
                ? 'Existing red flags and evidence mappings in this section will be replaced. Central references in References & Governance will not be deleted.'
                : 'Existing questions and evidence mappings in this section will be replaced. Central references in References & Governance will not be deleted.'
        }
        confirmLabel="Replace"
        cancelLabel="Cancel"
        onConfirm={() => {
          setReplaceConfirmOpen(false);
          if (isTreatments) void handleCommitTreatments(true);
          else if (isDifferentials) void handleCommitDifferentials(true);
          else if (isRedFlags) void handleCommitRedFlags(true);
          else void handleCommitAssessment(true);
        }}
        loading={
          commitAssessment.isPending ||
          commitRedFlags.isPending ||
          commitDifferentials.isPending ||
          commitTreatments.isPending
        }
      />
    </Dialog>
  );
}
