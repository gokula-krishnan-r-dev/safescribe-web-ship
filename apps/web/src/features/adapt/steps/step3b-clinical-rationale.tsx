'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { FileText, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const RATIONALE_MAX = 500;

export function Step3BClinicalRationale({
  value,
  updateRequired,
  updateMessage,
  canGenerateDraft,
  onChange,
  onApplyAiDraft,
  onGenerateDraft,
  autoApplyDraftOnReady = true,
  autoGenerateKey,
}: {
  value: string;
  updateRequired: boolean;
  updateMessage?: string;
  canGenerateDraft: boolean;
  onChange: (next: string, editedByPharmacist: boolean) => void;
  onApplyAiDraft: (next: string) => void;
  onGenerateDraft: () => string | Promise<string>;
  autoApplyDraftOnReady?: boolean;
  autoGenerateKey?: string;
}) {
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [inlineLoading, setInlineLoading] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [usedAiDraft, setUsedAiDraft] = useState(false);
  const [manualMode, setManualMode] = useState(false);
  const [progressStep, setProgressStep] = useState(0);

  const valueRef = useRef(value);
  const requestIdRef = useRef(0);
  const completedKeyRef = useRef<string | null>(null);
  const inFlightKeyRef = useRef<string | null>(null);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    if (!value.trim()) {
      setUsedAiDraft(false);
      setManualMode(false);
    }
  }, [value]);

  const applyDraft = useCallback(
    (next: string) => {
      const trimmed = next.trim().slice(0, RATIONALE_MAX);
      if (!trimmed) return false;
      onApplyAiDraft(trimmed);
      setUsedAiDraft(true);
      setManualMode(false);
      setInlineError(null);
      return true;
    },
    [onApplyAiDraft],
  );

  const runGenerate = useCallback(
    async (mode: 'inline' | 'dialog') => {
      const requestId = ++requestIdRef.current;
      if (mode === 'inline') {
        setInlineLoading(true);
        setInlineError(null);
      } else {
        setDraftLoading(true);
        setDraftError(null);
        setProgressStep(0);
      }

      try {
        if (mode === 'dialog') {
          setProgressStep(1);
          await new Promise((r) => setTimeout(r, 180));
          if (requestId !== requestIdRef.current) return null;
          setProgressStep(2);
          await new Promise((r) => setTimeout(r, 140));
          if (requestId !== requestIdRef.current) return null;
          setProgressStep(3);
        }

        const next = await Promise.resolve(onGenerateDraft());
        if (requestId !== requestIdRef.current) return null;
        const trimmed = (next || '').trim().slice(0, RATIONALE_MAX);
        if (!trimmed) {
          const message =
            'Draft could not be generated. You can enter the clinical rationale manually.';
          if (mode === 'inline') setInlineError(message);
          else {
            setDraftError(message);
            setDraftText('');
          }
          return null;
        }
        if (mode === 'dialog') setDraftText(trimmed);
        return trimmed;
      } catch {
        if (requestId !== requestIdRef.current) return null;
        const message =
          'Draft could not be generated. You can enter the clinical rationale manually.';
        if (mode === 'inline') setInlineError(message);
        else {
          setDraftError(message);
          setDraftText('');
        }
        return null;
      } finally {
        if (requestId === requestIdRef.current) {
          if (mode === 'inline') setInlineLoading(false);
          else setDraftLoading(false);
        }
      }
    },
    [onGenerateDraft],
  );

  useEffect(() => {
    if (!autoApplyDraftOnReady) return;
    if (!canGenerateDraft || updateRequired) return;

    const key = autoGenerateKey?.trim() || 'ready';
    if (valueRef.current.trim()) {
      completedKeyRef.current = key;
      return;
    }
    if (completedKeyRef.current === key) return;
    if (inFlightKeyRef.current === key) return;

    inFlightKeyRef.current = key;
    let cancelled = false;

    void (async () => {
      const draft = await runGenerate('inline');
      if (cancelled) return;
      inFlightKeyRef.current = null;
      if (!draft) return;
      if (valueRef.current.trim()) {
        completedKeyRef.current = key;
        return;
      }
      if (applyDraft(draft)) completedKeyRef.current = key;
    })();

    return () => {
      cancelled = true;
      if (inFlightKeyRef.current === key && !valueRef.current.trim()) {
        inFlightKeyRef.current = null;
      }
    };
  }, [
    autoApplyDraftOnReady,
    autoGenerateKey,
    canGenerateDraft,
    updateRequired,
    runGenerate,
    applyDraft,
  ]);

  const handleOpenGenerate = async () => {
    if (!canGenerateDraft || inlineLoading || draftLoading) return;

    if (!value.trim() || (usedAiDraft && !manualMode)) {
      const draft = await runGenerate('inline');
      if (draft) {
        applyDraft(draft);
        completedKeyRef.current = autoGenerateKey?.trim() || 'ready';
      }
      return;
    }

    setDraftOpen(true);
    setDraftText('');
    setDraftError(null);
    await runGenerate('dialog');
  };

  const busy = inlineLoading || draftLoading;

  return (
    <section
      className={cn(
        'rounded-xl border bg-white p-4 shadow-sm sm:p-5',
        updateRequired ? 'border-rose-200' : 'border-[#e2eaed]',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <FileText className="h-4 w-4 shrink-0 text-[#0F6F6B]" aria-hidden />
          <h3 className="text-[16px] font-semibold text-[#102a43]">Clinical rationale</h3>
          {updateRequired ? (
            <span className="inline-flex h-[22px] items-center rounded-full bg-rose-100 px-2 text-[11px] font-semibold text-rose-800">
              Update required
            </span>
          ) : value.trim() ? (
            <span className="inline-flex h-[22px] items-center rounded-full bg-[#eef1f6] px-2 text-[11px] font-semibold text-[#5d6878]">
              {usedAiDraft && !manualMode ? 'Draft' : 'Edited'}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canGenerateDraft || busy}
            title={
              canGenerateDraft
                ? undefined
                : 'Resolve the clinical review item before generating the rationale.'
            }
            onClick={() => void handleOpenGenerate()}
            className="h-8 gap-1.5 rounded-lg border-[#c5ddd9] bg-[#F3FAF9] px-2.5 text-xs font-semibold text-[#0F6F6B] hover:bg-[#e6f4f1] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
            )}
            {busy ? 'Generating…' : value.trim() ? 'Regenerate draft with AI' : 'Generate draft with AI'}
          </Button>
          {!manualMode && value.trim() ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setManualMode(true)}
              className="h-8 px-2 text-xs font-semibold text-[#0F6F6B]"
            >
              Edit manually
            </Button>
          ) : null}
        </div>
      </div>

      {updateRequired ? (
        <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3.5 py-3 text-[13px] leading-relaxed text-rose-800">
          {updateMessage ||
            'Resolve the review item above before finalizing the clinical rationale.'}
        </div>
      ) : null}

      <div className="mt-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] text-[#829ab1]">
            {inlineLoading
              ? 'Generating a draft from confirmed details…'
              : 'Type manually or generate a draft from confirmed details.'}
          </span>
          <span className="text-[11px] text-[#829ab1]">
            {(value || '').length} / {RATIONALE_MAX}
          </span>
        </div>
        <div className="relative">
          <Textarea
            value={value}
            maxLength={RATIONALE_MAX}
            rows={4}
            disabled={updateRequired || inlineLoading}
            onChange={(e) => {
              onChange(e.target.value, true);
              setManualMode(true);
              if (inlineError) setInlineError(null);
            }}
            placeholder={
              inlineLoading
                ? 'Generating clinical rationale…'
                : 'Describe the clinical rationale for this adaptation…'
            }
            className={cn(
              'resize-none text-[13.5px] leading-relaxed text-[#334e68] shadow-none disabled:bg-[#f8fafb]',
              inlineLoading && 'text-[#829ab1]',
            )}
            aria-busy={inlineLoading}
          />
          {inlineLoading ? (
            <div
              className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-md bg-white/55"
              aria-live="polite"
            >
              <span className="inline-flex items-center gap-2 rounded-full border border-[#d9e4e8] bg-white px-3 py-1.5 text-[12px] font-semibold text-[#0F6F6B] shadow-sm">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Generating draft with AI…
              </span>
            </div>
          ) : null}
        </div>
        {inlineError ? (
          <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12px] leading-relaxed text-amber-900 sm:flex-row sm:items-center sm:justify-between">
            <span>{inlineError}</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 shrink-0 bg-white text-xs"
              disabled={!canGenerateDraft || busy}
              onClick={() => void handleOpenGenerate()}
            >
              Try again
            </Button>
          </div>
        ) : null}
      </div>

      <Dialog open={draftOpen} onOpenChange={setDraftOpen}>
        <DialogContent className="max-w-lg gap-0 overflow-hidden p-0 sm:rounded-xl">
          <DialogHeader className="space-y-1 border-b border-[#e2eaed] px-5 py-4 text-left">
            <DialogTitle className="flex items-center gap-2 text-[15px] font-semibold text-[#102a43]">
              <Sparkles className="h-4 w-4 text-[#0F6F6B]" aria-hidden />
              Clinical rationale (draft)
            </DialogTitle>
            <DialogDescription className="text-xs text-[#627d98]">
              AI drafts documentation language only. It does not decide whether to proceed.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 px-5 py-4">
            {draftLoading ? (
              <div className="space-y-2 rounded-lg border border-[#e2eaed] bg-[#f8fafb] px-4 py-4 text-sm text-[#52677a]">
                <div className="flex items-center gap-2 font-semibold text-[#102a43]">
                  <Loader2 className="h-4 w-4 animate-spin text-[#0F6F6B]" aria-hidden />
                  Generating draft rationale…
                </div>
                <ul className="space-y-1.5 text-xs">
                  <li className={cn(progressStep >= 1 ? 'text-emerald-700' : 'text-[#829ab1]')}>
                    {progressStep >= 1 ? '✓' : '·'} Analyzing patient context
                  </li>
                  <li className={cn(progressStep >= 2 ? 'text-emerald-700' : 'text-[#829ab1]')}>
                    {progressStep >= 2 ? '✓' : '·'} Reviewing evidence
                  </li>
                  <li className={cn(progressStep >= 3 ? 'text-emerald-700' : 'text-[#829ab1]')}>
                    {progressStep >= 3 ? '✓' : '·'} Drafting clinical rationale
                  </li>
                </ul>
              </div>
            ) : draftError ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-xs leading-relaxed text-amber-900">
                {draftError}
              </div>
            ) : (
              <div className="max-h-[240px] overflow-y-auto rounded-lg border border-[#e2eaed] bg-[#fbfdfe] px-3.5 py-3 text-[13px] leading-relaxed text-[#334e68]">
                {draftText}
              </div>
            )}
          </div>

          <DialogFooter className="flex-col gap-2 border-t border-[#e2eaed] bg-[#f8fafb] px-5 py-3 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDraftOpen(false)}
              className="h-9 rounded-lg px-3 text-[13px] font-semibold text-[#52677a]"
            >
              Close
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={draftLoading}
              onClick={() => void runGenerate('dialog')}
              className="h-9 rounded-lg border-[#d9e4e8] px-3 text-[13px] font-semibold"
            >
              Regenerate
            </Button>
            <Button
              type="button"
              disabled={draftLoading || !draftText.trim()}
              onClick={() => {
                if (!applyDraft(draftText)) return;
                completedKeyRef.current = autoGenerateKey?.trim() || 'ready';
                setDraftOpen(false);
              }}
              className="h-9 rounded-lg bg-[#0F6F6B] px-3 text-[13px] font-semibold text-white hover:bg-[#0c5956]"
            >
              Use this draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
