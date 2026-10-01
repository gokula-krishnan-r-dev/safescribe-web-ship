'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ClipboardEvent as ReactClipboardEvent } from 'react';
import {
  FileText,
  Camera,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Pencil,
  X,
  ChevronDown,
} from 'lucide-react';
import { toast } from '@/lib/notify';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { ClinicalPrimaryButton } from './clinical-ui';
import { useExtractLabValues, useParseLabText } from './hooks';
import type { ExtractedLabValue } from './types';
import {
  imagesFromClipboard,
  insertTextAtCaret,
  laboratoryTextFromClipboard,
} from './lab-clipboard';
import { LatestResultsTable } from './latest-results-table';
import {
  formatLatestLabValuesAsText,
  presentLatestLabRows,
  selectLatestLabValues,
} from '@safescript/shared';

const ACCEPTED_IMAGE = 'image/jpeg,image/jpg,image/png,image/webp';
const ACCEPTED_PDF = 'application/pdf,.pdf';
const MAX_IMAGE_MB = 10;
const MAX_PDF_MB = 20;
const MAX_TEXT_CHARS = 20_000;

interface Props {
  consultationId: string;
  currentValue: string;
  extractedValues?: ExtractedLabValue[];
  onApply: (formattedText: string, values: ExtractedLabValue[]) => void;
}

function validateFile(file: File): string | null {
  const ext = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`;
  const isPdf = ext === '.pdf' || file.type === 'application/pdf';
  const isImage = ['.jpg', '.jpeg', '.png', '.webp'].includes(ext) || file.type.startsWith('image/');

  if (!isPdf && !isImage) {
    return 'This file type is not supported. Please use JPG, JPEG, PNG, or PDF.';
  }

  const maxBytes = isPdf ? MAX_PDF_MB * 1024 * 1024 : MAX_IMAGE_MB * 1024 * 1024;
  if (file.size > maxBytes) {
    return `File is too large. Maximum size is ${isPdf ? MAX_PDF_MB : MAX_IMAGE_MB} MB.`;
  }

  return null;
}

function formatValues(values: ExtractedLabValue[]) {
  return formatLatestLabValuesAsText(selectLatestLabValues(values));
}

export function ImportLabReport({
  consultationId,
  currentValue,
  extractedValues = [],
  onApply,
}: Props) {
  const imageInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const pasteRef = useRef<HTMLTextAreaElement>(null);

  const extract = useExtractLabValues(consultationId);
  const parseText = useParseLabText(consultationId);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [pastedText, setPastedText] = useState('');
  const [savedSourceText, setSavedSourceText] = useState(currentValue);
  const [progress, setProgress] = useState<number | null>(null);
  const [extracted, setExtracted] = useState<ExtractedLabValue[]>(() =>
    selectLatestLabValues(extractedValues),
  );
  const [summary, setSummary] = useState<string | undefined>();
  const [warnings, setWarnings] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [refining, setRefining] = useState(false);
  const [viewMode, setViewMode] = useState<'entry' | 'results'>(() =>
    extractedValues.length > 0 || currentValue.trim() ? 'results' : 'entry',
  );

  const isBusy = extract.isPending || parseText.isPending || refining;

  useEffect(() => {
    setExtracted(selectLatestLabValues(extractedValues));
    if (extractedValues.length > 0) {
      setViewMode('results');
    }
  }, [extractedValues]);

  useEffect(() => {
    if (currentValue.trim()) {
      setSavedSourceText(currentValue);
    }
  }, [currentValue]);

  const resetPreviewUrl = useCallback((url: string | null) => {
    if (url) URL.revokeObjectURL(url);
  }, []);

  const commitValues = useCallback(
    (values: ExtractedLabValue[], sourceText: string, opts?: { silent?: boolean }) => {
      const trimmedSource = sourceText.trim();
      if (!values.length && !trimmedSource) {
        toast.error('No values to save');
        return;
      }

      const latest = selectLatestLabValues(values);
      const formatted = latest.length > 0 ? formatValues(latest) : trimmedSource;
      setExtracted(latest.map((v) => ({ ...v })));
      setSavedSourceText(trimmedSource || formatted);
      setViewMode('results');
      onApply(formatted, latest);
      if (!opts?.silent) {
        toast.success(
          latest.length > 0
            ? `Saved ${latest.length} latest result${latest.length === 1 ? '' : 's'}`
            : 'Lab values saved',
        );
      }
    },
    [onApply],
  );

  const openEntryView = () => {
    setPastedText(savedSourceText || currentValue);
    setViewMode('entry');
    setEditing(false);
    requestAnimationFrame(() => pasteRef.current?.focus());
  };

  const handleFileSelect = (file: File) => {
    const error = validateFile(file);
    if (error) {
      toast.error(error);
      return;
    }

    setSelectedFile(file);
    setWarnings([]);
    setEditing(false);
    setViewMode('entry');

    if (file.type.startsWith('image/')) {
      setPreviewUrl((prev) => {
        resetPreviewUrl(prev);
        return URL.createObjectURL(file);
      });
    } else {
      setPreviewUrl((prev) => {
        resetPreviewUrl(prev);
        return null;
      });
    }
  };

  const applyPastedLaboratoryText = useCallback(
    (raw: string, field?: HTMLTextAreaElement | null) => {
      const insertion = raw.slice(0, MAX_TEXT_CHARS);
      if (!insertion) return false;
      if (field) {
        const { next, caret } = insertTextAtCaret(pastedText, insertion, field);
        const limited = next.slice(0, MAX_TEXT_CHARS);
        setPastedText(limited);
        const pos = Math.min(caret, limited.length);
        requestAnimationFrame(() => field.setSelectionRange(pos, pos));
      } else {
        setPastedText((prev) => {
          const joiner = prev && !prev.endsWith('\n') ? '\n' : '';
          return `${prev}${joiner}${insertion}`.slice(0, MAX_TEXT_CHARS);
        });
      }
      return true;
    },
    [pastedText],
  );

  const handlePaste = (event: ReactClipboardEvent<HTMLElement>) => {
    if (isBusy) return;
    const text = laboratoryTextFromClipboard(event.clipboardData);
    const images = imagesFromClipboard(event.clipboardData);

    if (images.length > 0 && !text.trim()) {
      event.preventDefault();
      event.stopPropagation();
      handleFileSelect(images[0]);
      return;
    }

    if (!text.trim()) return;

    event.preventDefault();
    event.stopPropagation();
    const field =
      event.currentTarget instanceof HTMLTextAreaElement
        ? event.currentTarget
        : pasteRef.current;
    applyPastedLaboratoryText(text, field);
  };

  const runFileExtraction = async () => {
    if (!selectedFile) {
      toast.error('Please select or capture a lab report first');
      return;
    }

    setProgress(10);
    const timer = window.setInterval(() => {
      setProgress((p) => (p == null || p >= 92 ? p : p + 6));
    }, 300);

    try {
      const result = await extract.mutateAsync(selectedFile);
      setSummary(result.summary);
      setWarnings(result.warnings ?? []);
      setProgress(100);

      if (!result.labValues.length) {
        toast.error('No lab values found — please try a clearer photo');
        return;
      }

      const sourceLabel = `Imported from ${selectedFile.name}`;
      const latest = selectLatestLabValues(result.labValues.map((v) => ({ ...v })));
      commitValues(latest, sourceLabel, { silent: true });
      toast.success(
        result.cached
          ? `Loaded ${latest.length} latest result${latest.length === 1 ? '' : 's'} from earlier parse`
          : `Found ${latest.length} latest result${latest.length === 1 ? '' : 's'}`,
      );
    } catch (error: unknown) {
      const message = error instanceof Error
        ? error.message
        : (error as { message?: string })?.message ?? 'Could not read lab report';
      toast.error(message);
      setWarnings([message]);
    } finally {
      window.clearInterval(timer);
      window.setTimeout(() => setProgress(null), 500);
    }
  };

  /**
   * Always send pasted text through the API so AI can canonicalize names,
   * units, and dates. Show a calm refining state (no flashy spinner loop).
   */
  const handleNext = async () => {
    const text = pastedText.trim();
    if (text.length < 3) {
      toast.error('Enter at least one lab value to continue');
      return;
    }
    if (text.length > MAX_TEXT_CHARS) {
      toast.error(`Text is too long (max ${MAX_TEXT_CHARS.toLocaleString()} characters)`);
      return;
    }

    setSelectedFile(null);
    setPreviewUrl((prev) => {
      resetPreviewUrl(prev);
      return null;
    });
    setWarnings([]);
    setRefining(true);
    setProgress(18);

    const timer = window.setInterval(() => {
      setProgress((p) => {
        if (p == null || p >= 88) return p;
        return p + 4;
      });
    }, 400);

    try {
      const result = await parseText.mutateAsync(text);
      setProgress(100);
      setSummary(result.summary);
      setWarnings(result.warnings ?? []);

      if (result.labValues.length > 0) {
        const latest = selectLatestLabValues(result.labValues.map((v) => ({ ...v })));
        commitValues(latest, text, { silent: true });
        toast.success(
          result.cached
            ? `Loaded ${latest.length} latest result${latest.length === 1 ? '' : 's'}`
            : `Formatted ${latest.length} latest result${latest.length === 1 ? '' : 's'}`,
        );
        return;
      }

      // Nothing structured — keep original text for pharmacist review
      commitValues([], text);
      toast.message('Saved as free text — no structured values detected');
    } catch {
      commitValues([], text);
      toast.message('Saved as free text — formatting unavailable');
    } finally {
      window.clearInterval(timer);
      setRefining(false);
      window.setTimeout(() => setProgress(null), 350);
    }
  };

  const updateValue = (index: number, patch: Partial<ExtractedLabValue>) => {
    setExtracted((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const finishEditing = () => {
    commitValues(extracted, savedSourceText);
    setEditing(false);
  };

  const clearFile = () => {
    setSelectedFile(null);
    setSummary(undefined);
    setWarnings([]);
    setPreviewUrl((prev) => {
      resetPreviewUrl(prev);
      return null;
    });
  };

  const textCharCount = pastedText.length;
  const textOverLimit = textCharCount > MAX_TEXT_CHARS;
  const canContinue = Boolean(pastedText.trim()) && !isBusy && !textOverLimit;
  const hasSavedResults = extracted.length > 0 || Boolean(savedSourceText.trim());
  const latestRows = useMemo(() => presentLatestLabRows(extracted), [extracted]);
  const labRows = useMemo(() => latestRows.filter((row) => row.kind === 'LAB'), [latestRows]);
  const vitalRows = useMemo(() => latestRows.filter((row) => row.kind === 'VITAL'), [latestRows]);

  const fileStatusLabel = extract.isPending
    ? 'Processing'
    : selectedFile
      ? 'Ready'
      : null;

  return (
    <div className="space-y-4">
      {hasSavedResults && viewMode === 'results' ? (
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 shrink-0 gap-1.5 text-sm font-semibold"
            onClick={openEntryView}
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit entry
          </Button>
        </div>
      ) : null}

      {viewMode === 'results' && hasSavedResults ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <p className="text-sm font-semibold text-foreground">
                {labRows.length || vitalRows.length
                  ? [
                      labRows.length
                        ? `${labRows.length} latest lab${labRows.length === 1 ? '' : 's'}`
                        : null,
                      vitalRows.length
                        ? `${vitalRows.length} vital${vitalRows.length === 1 ? '' : 's'}`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : 'Lab values saved'}
              </p>
            </div>
            <button
              type="button"
              onClick={openEntryView}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
            >
              View original entry
              <ChevronDown className="h-3.5 w-3.5 -rotate-90" />
            </button>
          </div>

          {summary && (
            <p className="text-xs text-muted-foreground rounded-lg border border-[#edf1f3] bg-white px-3 py-2">
              {summary}
            </p>
          )}

          {labRows.length ? (
            <LatestResultsTable
              title="Recent lab results"
              subtitle="Most recent value for each test"
              rows={labRows}
            />
          ) : null}
          {vitalRows.length ? (
            <p className="text-xs text-muted-foreground">
              {vitalRows.length} vital{vitalRows.length === 1 ? '' : 's'} shown in Vitals below
            </p>
          ) : null}
          {!extracted.length ? (
            <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-[#d7e2e6] bg-white p-3 font-mono text-xs leading-relaxed text-foreground">
              {savedSourceText || currentValue}
            </pre>
          ) : null}

          {editing && extracted.length > 0 && (
            <div className="space-y-2 rounded-xl border border-[#d7e2e6] bg-white p-3">
              {extracted.map((item, index) => (
                <div key={`edit-${item.test}-${index}`} className="grid grid-cols-2 gap-2">
                  <Input
                    value={item.test}
                    onChange={(e) => updateValue(index, { test: e.target.value })}
                    className="h-8 text-xs"
                    placeholder="Test name"
                  />
                  <Input
                    value={item.value}
                    onChange={(e) => updateValue(index, { value: e.target.value })}
                    className="h-8 text-xs"
                    placeholder="Value"
                  />
                </div>
              ))}
            </div>
          )}

          {extracted.length > 0 && (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() => (editing ? finishEditing() : setEditing(true))}
              >
                <Pencil className="h-3 w-3" />
                {editing ? 'Done editing' : 'Edit values'}
              </Button>
            </div>
          )}
        </div>
      ) : null}

      {(viewMode === 'entry' || !hasSavedResults) && (
        <div className="space-y-4" onPaste={handlePaste}>
          <div className="grid grid-cols-1 items-center gap-4 sm:grid-cols-[auto_auto_minmax(24px,1fr)_minmax(240px,468px)]">
            <Button
              type="button"
              variant="outline"
              className="h-14 gap-3 rounded-lg border-[1.5px] border-primary px-7 text-base font-semibold text-primary shadow-none hover:bg-[#F1FAF9]"
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = `${ACCEPTED_IMAGE},${ACCEPTED_PDF}`;
                input.onchange = () => {
                  const file = input.files?.[0];
                  if (file) handleFileSelect(file);
                };
                input.click();
              }}
              disabled={isBusy}
            >
              <FileText className="h-4 w-4" />
              Upload report
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-14 gap-3 rounded-lg border-[1.5px] border-primary px-7 text-base font-semibold text-primary shadow-none hover:bg-[#F1FAF9]"
              onClick={() => cameraInputRef.current?.click()}
              disabled={isBusy}
            >
              <Camera className="h-4 w-4" />
              Take photo
            </Button>
            <div className="hidden sm:block" />
            {selectedFile ? (
              <div className="grid h-14 grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border border-[#BCC8CD] bg-card px-4">
                <FileText className="h-5 w-5 shrink-0 text-primary" />
                <p className="truncate text-sm font-medium text-foreground">{selectedFile.name}</p>
                <div className="flex items-center gap-2">
                  <span className="whitespace-nowrap text-sm font-medium text-primary">
                    {fileStatusLabel}
                  </span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={clearFile}
                    aria-label="Remove uploaded file"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="hidden sm:block" />
            )}
          </div>

          <input
            ref={imageInputRef}
            type="file"
            accept={ACCEPTED_IMAGE}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelect(file);
              e.target.value = '';
            }}
          />
          <input
            ref={pdfInputRef}
            type="file"
            accept={ACCEPTED_PDF}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelect(file);
              e.target.value = '';
            }}
          />
          <input
            ref={cameraInputRef}
            type="file"
            accept={ACCEPTED_IMAGE}
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleFileSelect(file);
              e.target.value = '';
            }}
          />

          {previewUrl && (
            <div className="overflow-hidden rounded-lg border border-border/60 bg-background">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previewUrl}
                alt="Lab report preview"
                className="max-h-48 w-full bg-black/5 object-contain"
              />
            </div>
          )}

          <Textarea
            id="lab-values-paste"
            ref={pasteRef}
            value={pastedText}
            onChange={(e) => setPastedText(e.target.value)}
            onPaste={handlePaste}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && (canContinue || selectedFile)) {
                e.preventDefault();
                if (selectedFile) void runFileExtraction();
                else void handleNext();
              }
            }}
            placeholder="Paste or type laboratory values…"
            rows={3}
            disabled={isBusy}
            spellCheck={false}
            autoComplete="off"
            aria-label="Paste or type laboratory values"
            className={cn(
              'mt-1 min-h-[98px] resize-y rounded-[7px] border-[#AEBCC2] px-[18px] py-4 text-base leading-normal shadow-none',
              textOverLimit && 'border-destructive focus-visible:ring-destructive',
            )}
          />

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-[15px] text-[#5B6673]">
              Example: HbA1c: 7.2% — Jul 20, 2026
              {textOverLimit ? (
                <span className="ml-2 font-medium text-destructive">
                  ({textCharCount.toLocaleString()} / {MAX_TEXT_CHARS.toLocaleString()})
                </span>
              ) : null}
            </p>
            <ClinicalPrimaryButton
              type="button"
              size="lg"
              onClick={() => {
                if (selectedFile) void runFileExtraction();
                else void handleNext();
              }}
              disabled={(!selectedFile && !pastedText.trim()) || isBusy || textOverLimit}
              loading={isBusy}
              loadingLabel={selectedFile ? 'Extracting…' : 'Formatting…'}
              className="min-w-[246px]"
            >
              Extract & review
            </ClinicalPrimaryButton>
          </div>

          <div className="flex min-h-[54px] items-center gap-3.5 rounded-[7px] border border-[#ACD8D5] bg-[#F5FBFA] px-[18px] text-[15px] text-[#52606B]">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" aria-hidden />
            <span>
              {refining || parseText.isPending
                ? 'Formatting names, units, and dates…'
                : 'Formats test names, units, and dates before you save.'}
            </span>
          </div>
        </div>
      )}

      {viewMode === 'entry' && hasSavedResults && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-8 w-full gap-1.5 text-xs text-muted-foreground"
          onClick={() => setViewMode('results')}
          disabled={isBusy}
        >
          <ChevronDown className="h-3.5 w-3.5 rotate-180" />
          Back to saved results
        </Button>
      )}

      {progress != null && (
        <div className="space-y-2" aria-live="polite">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {extract.isPending
                ? 'Reading lab report…'
                : 'Formatting lab values…'}
            </span>
            <span>{Math.min(progress, 99)}%</span>
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>
      )}

      {warnings.length > 0 && !extracted.length && viewMode === 'entry' && (
        <div className="rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-foreground flex items-start gap-2">
          <AlertTriangle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
          <div>{warnings.join(' ')}</div>
        </div>
      )}
    </div>
  );
}
