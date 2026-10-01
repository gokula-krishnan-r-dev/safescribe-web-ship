'use client';
import { useEffect, useState } from 'react';
import { BookOpen, Loader2, ChevronRight, Pencil, Check, Sparkles, AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/notify';
import type { Consultation, CounsellingSection } from '../types';
import { useGenerateCounselling, useSaveStep } from '../hooks';

interface Props { consultation: Consultation; onNext: () => void; onBack: () => void; }

const CATEGORY_ICONS: Record<string, string> = {
  'Medication Use': '💊',
  'Side Effects': '⚠️',
  'Warning Signs': '🚨',
  'Home Care': '🏠',
  'Diet & Lifestyle': '🥗',
  'Follow-Up': '📅',
};

export function Step8Counselling({ consultation, onNext, onBack }: Props) {
  const generate = useGenerateCounselling(consultation.id);
  const saveStep = useSaveStep(consultation.id);

  const [sections, setSections] = useState<CounsellingSection[]>(
    (consultation.counsellingNotes as { sections?: CounsellingSection[] } | undefined)?.sections ?? [],
  );
  const [keyMessages, setKeyMessages] = useState<string[]>(
    (consultation.counsellingNotes as { keyMessages?: string[] } | undefined)?.keyMessages ?? [],
  );
  const [editingIdx, setEditingIdx] = useState<string | null>(null);

  const [failed, setFailed] = useState(false);
  const runGenerate = () => {
    setFailed(false);
    generate.mutateAsync({ mode: 'fast' }).then((res) => {
      const r = res as { sections?: CounsellingSection[]; keyMessages?: string[] };
      setSections(r.sections ?? []);
      setKeyMessages(r.keyMessages ?? []);
    }).catch(() => {
      setFailed(true);
      toast.error('Could not generate counselling notes');
    });
  };

  useEffect(() => {
    if (sections.length === 0) runGenerate();
  }, []); // eslint-disable-line

  const updatePoint = (sIdx: number, pIdx: number, val: string) => {
    setSections((prev) => {
      const next = [...prev];
      next[sIdx] = { ...next[sIdx], points: next[sIdx].points.map((p, i) => i === pIdx ? { ...p, point: val } : p) };
      return next;
    });
  };

  const handleNext = async () => {
    await saveStep.mutateAsync({
      stepIndex: 7,
      currentStep: 'COUNSELLING',
      data: { sections, keyMessages } as unknown as Record<string, unknown>,
    });
    onNext();
  };

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-primary/5 to-transparent border-b border-border/60 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">Counselling</h3>
          </div>
          {generate.isPending && <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Generating…</div>}
        </div>

        <div className="p-5">
          {generate.isPending && sections.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="h-9 w-9 animate-spin text-primary" />
              <p className="text-sm font-medium text-foreground">Preparing counselling notes…</p>
              <p className="text-xs text-muted-foreground">Medicine instructions, warnings, and follow-up advice for the patient</p>
            </div>
          ) : failed && sections.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
              <AlertTriangle className="h-8 w-8 text-amber-500" />
              <p className="font-medium text-foreground">Counselling notes unavailable</p>
              <p className="text-xs text-muted-foreground">Drafting could not be reached. Please retry or add notes yourself.</p>
              <Button variant="outline" size="sm" onClick={runGenerate} className="gap-2 mt-1">
                <RotateCcw className="h-3.5 w-3.5" /> Retry
              </Button>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Key messages */}
              {keyMessages.length > 0 && (
                <div className="rounded-xl bg-primary/5 border border-primary/20 p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                    <p className="text-xs font-semibold uppercase tracking-wide text-primary">Key points for the patient</p>
                  </div>
                  <ul className="space-y-1.5">
                    {keyMessages.map((msg, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <Check className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
                        {msg}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Sections */}
              {sections.map((section, sIdx) => (
                <div key={sIdx} className="rounded-xl border border-border overflow-hidden">
                  <div className="bg-muted/30 border-b border-border/60 px-4 py-2 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span>{CATEGORY_ICONS[section.category] ?? '📋'}</span>
                      <p className="font-semibold text-sm">{section.category}</p>
                    </div>
                    <button
                      onClick={() => setEditingIdx(editingIdx === `${sIdx}` ? null : `${sIdx}`)}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      {editingIdx === `${sIdx}` ? <Check className="h-3.5 w-3.5 text-primary" /> : <Pencil className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <ul className="p-4 space-y-2">
                    {section.points.map((point, pIdx) => (
                      <li key={pIdx} className={cn('flex items-start gap-2', point.important && 'font-medium')}>
                        <span className="text-primary/60 mt-0.5 text-sm">•</span>
                        {editingIdx === `${sIdx}` ? (
                          <Textarea
                            value={point.point}
                            onChange={(e) => updatePoint(sIdx, pIdx, e.target.value)}
                            rows={1}
                            className="resize-none text-sm flex-1 min-h-0 py-1"
                          />
                        ) : (
                          <span className="text-sm">{point.point}</span>
                        )}
                        {point.important && <Badge variant="secondary" className="h-4 px-1 text-[10px] shrink-0">Important</Badge>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between pt-1">
        <Button variant="ghost" size="sm" onClick={onBack} className="text-muted-foreground">← Back</Button>
        <Button onClick={handleNext} disabled={saveStep.isPending} className="gap-2 min-w-36">
          {saveStep.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
          Continue
        </Button>
      </div>
    </div>
  );
}
