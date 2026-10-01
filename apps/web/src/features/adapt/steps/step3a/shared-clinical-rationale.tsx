'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';
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
import { SectionHeading } from './section-heading';

const RATIONALE_MAX = 500;

/** Fingerprint for auto-draft so a new proposed Rx can regenerate when the field is empty. */
export function adaptRationaleAutoKey(parts: Array<string | null | undefined>): string {
  return parts
    .map((part) => (part ?? '').trim().toLowerCase())
    .filter(Boolean)
    .join('|');
}

export function SharedClinicalRationale({
  sectionNumber,
  value,
  onChange,
  onApplyAiDraft,
  onGenerateDraft,
  canGenerateDraft = false,
  showResyncPrompt,
  onKeepCurrent,
  onRequestRegenerate,
  helper = 'Explain why this proposed adaptation is appropriate for this patient.',
  /** When true (default), generate + apply an AI draft once the section is ready and empty. */
  autoApplyDraftOnReady = true,
  /** Stable key for the current proposed prescription — changes re-enable auto-draft when empty. */
  autoGenerateKey,
}: {
  sectionNumber: number;
  value: string;
  onChange: (next: string) => void;
  /** Persist an accepted AI draft (source = ai_draft; not pharmacist-edited yet). */
  onApplyAiDraft?: (next: string) => void;
  /** Builds a draft from structured inputs. Does not persist until applied. */
  onGenerateDraft?: () => string | Promise<string>;
  canGenerateDraft?: boolean;
  showResyncPrompt?: boolean;
  onKeepCurrent?: () => void;
  onRequestRegenerate?: () => void;
  helper?: string;
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
  const [manualFocus, setManualFocus] = useState(false);

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
      setManualFocus(false);
    }
  }, [value]);

  const applyDraft = useCallback(
    (next: string) => {
      const trimmed = next.trim().slice(0, RATIONALE_MAX);
      if (!trimmed) return false;
      if (onApplyAiDraft) onApplyAiDraft(trimmed);
      else onChange(trimmed);
      setUsedAiDraft(true);
      setManualFocus(false);
      setInlineError(null);
      return true;
    },
    [onApplyAiDraft, onChange],
  );

  const runGenerate = useCallback(
    async (mode: 'inline' | 'dialog') => {
      if (!onGenerateDraft) return null;

      const requestId = ++requestIdRef.current;
      if (mode === 'inline') {
        setInlineLoading(true);
        setInlineError(null);
      } else {
        setDraftLoading(true);
        setDraftError(null);
      }

      try {
        const next = await Promise.resolve(onGenerateDraft());
        if (requestId !== requestIdRef.current) return null;
        const trimmed = (next || '').trim();
        if (!trimmed) {
          const message =
            'Draft could not be generated. You can enter the clinical rationale manually.';
          if (mode === 'inline') {
            setInlineError(message);
          } else {
            setDraftError(message);
            setDraftText('');
          }
          return null;
        }
        const clipped = trimmed.slice(0, RATIONALE_MAX);
        if (mode === 'dialog') setDraftText(clipped);
        return clipped;
      } catch {
        const message =
          'Draft could not be generated. You can enter the clinical rationale manually.';
        if (requestId !== requestIdRef.current) return null;
        if (mode === 'inline') {
          setInlineError(message);
        } else {
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

  // Auto-generate once when the section becomes ready and the field is still empty.
  useEffect(() => {
    if (!autoApplyDraftOnReady) return;
    if (!canGenerateDraft || !onGenerateDraft) return;
    if (showResyncPrompt) return;

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
      // Do not overwrite if the pharmacist typed while the request was in flight.
      if (valueRef.current.trim()) {
        completedKeyRef.current = key;
        return;
      }
      if (applyDraft(draft)) {
        completedKeyRef.current = key;
      }
    })();

    return () => {
      cancelled = true;
      // Allow a remount (React Strict Mode) to retry the same key if still empty.
      if (inFlightKeyRef.current === key && !valueRef.current.trim()) {
        inFlightKeyRef.current = null;
      }
    };
  }, [
    autoApplyDraftOnReady,
    autoGenerateKey,
    canGenerateDraft,
    onGenerateDraft,
    showResyncPrompt,
    runGenerate,
    applyDraft,
  ]);

  const handleOpenGenerate = async () => {
    if (!canGenerateDraft || !onGenerateDraft || inlineLoading) return;

    // Empty / AI-only field: regenerate inline and apply immediately.
    if (!value.trim() || (usedAiDraft && !manualFocus)) {
      const draft = await runGenerate('inline');
      if (draft) {
        applyDraft(draft);
        completedKeyRef.current = autoGenerateKey?.trim() || 'ready';
      }
      return;
    }

    // Pharmacist-edited text: preview in dialog before replacing.
    setDraftOpen(true);
    setDraftText('');
    setDraftError(null);
    await runGenerate('dialog');
  };

  const handleUseDraft = () => {
    if (!applyDraft(draftText)) return;
    completedKeyRef.current = autoGenerateKey?.trim() || 'ready';
    setDraftOpen(false);
  };

  const busy = inlineLoading || draftLoading;

  return (
    <div id="adapt-clinical-rationale" className="scroll-mt-4 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <SectionHeading number={sectionNumber} title="Clinical rationale" helper={helper} />
        {onGenerateDraft ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!canGenerateDraft || busy}
            onClick={() => void handleOpenGenerate()}
            className="h-9 shrink-0 gap-1.5 rounded-lg border-[#c5ddd9] bg-[#F3FAF9] px-3 text-[13px] font-semibold text-[#0F6F6B] hover:bg-[#e6f4f1] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Sparkles className="h-3.5 w-3.5" aria-hidden />
            )}
            {busy ? 'Generating…' : value.trim() ? 'Regenerate draft with AI' : 'Generate draft with AI'}
          </Button>
        ) : null}
      </div>

      <div className="space-y-3 rounded-xl border border-[#e2eaed] bg-white p-4 shadow-sm">
        {showResyncPrompt ? (
          <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 sm:flex-row sm:items-center sm:justify-between">
            <span>The proposed prescription changed. Review or regenerate the rationale?</span>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 bg-white text-xs"
                disabled={!canGenerateDraft || busy}
                onClick={() => {
                  onRequestRegenerate?.();
                  void handleOpenGenerate();
                }}
              >
                Regenerate draft
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={onKeepCurrent}
              >
                Keep current
              </Button>
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-2">
          {usedAiDraft && !manualFocus ? (
            <button
              type="button"
              onClick={() => setManualFocus(true)}
              className="text-[12px] font-semibold text-[#0F6F6B] hover:underline"
            >
              Edit manually
            </button>
          ) : (
            <span className="text-[11px] text-[#829ab1]">
              {inlineLoading
                ? 'Generating a draft from confirmed details…'
                : canGenerateDraft
                  ? 'Type manually or generate a draft from confirmed details.'
                  : 'Complete the proposed prescription to enable AI drafting.'}
            </span>
          )}
          <span className="shrink-0 text-[11px] text-[#829ab1]">
            {(value || '').length} / {RATIONALE_MAX}
          </span>
        </div>

        <div className="relative">
          <Textarea
            value={value}
            maxLength={RATIONALE_MAX}
            rows={4}
            disabled={inlineLoading}
            onChange={(e) => {
              onChange(e.target.value);
              if (usedAiDraft) setManualFocus(true);
              if (inlineError) setInlineError(null);
            }}
            placeholder={
              inlineLoading
                ? 'Generating clinical rationale…'
                : 'Describe the clinical rationale for this adaptation…'
            }
            className={cn(
              'resize-none text-[13px] leading-relaxed text-[#334e68] shadow-none',
              inlineLoading && 'bg-[#f8fafb] text-[#829ab1]',
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
              AI generated clinical rationale (draft)
            </DialogTitle>
            <DialogDescription className="text-xs text-[#627d98]">
              Review this draft before using it. The pharmacist remains responsible for the final
              rationale.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 px-5 py-4">
            {draftLoading ? (
              <div className="flex items-center gap-2 rounded-lg border border-[#e2eaed] bg-[#f8fafb] px-4 py-8 text-sm text-[#627d98]">
                <Loader2 className="h-4 w-4 animate-spin text-[#0F6F6B]" aria-hidden />
                Generating draft…
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
              disabled={draftLoading || !onGenerateDraft}
              onClick={() => void runGenerate('dialog')}
              className="h-9 rounded-lg border-[#d9e4e8] px-3 text-[13px] font-semibold text-[#102a43]"
            >
              Regenerate
            </Button>
            <Button
              type="button"
              disabled={draftLoading || !draftText.trim()}
              onClick={handleUseDraft}
              className="h-9 rounded-lg bg-[#0F6F6B] px-3 text-[13px] font-semibold text-white hover:bg-[#0c5956]"
            >
              Use this draft
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
