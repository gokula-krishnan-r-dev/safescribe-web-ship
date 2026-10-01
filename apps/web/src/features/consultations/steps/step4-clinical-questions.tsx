'use client';
import { useState, useEffect } from 'react';
import { ClipboardList, Sparkles, Loader2, ChevronRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/notify';
import type { Consultation, ClinicalQuestion, QuestionResponse } from '../types';
import { useAnswerQuestions, useSaveStep } from '../hooks';

interface Props { consultation: Consultation; onNext: () => void; onBack: () => void; }

const CONFIDENCE_THRESHOLD = 75;

function QuestionCard({
  q, response, onChange,
}: {
  q: ClinicalQuestion;
  response?: QuestionResponse;
  onChange: (id: string, val: string) => void;
}) {
  const isAiAnswered = response?.aiAnswered && (response.confidence ?? 0) >= CONFIDENCE_THRESHOLD;
  const val = String(response?.answerText ?? response?.answer ?? '');

  return (
    <div className={cn('rounded-xl border p-4 transition-colors', isAiAnswered ? 'border-primary/30 bg-primary/5' : 'border-border bg-card')}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <p className="text-sm font-medium text-foreground leading-snug flex-1">{q.question}</p>
        {response?.confidence !== undefined && (
          <Badge
            variant="secondary"
            className={cn(
              'shrink-0 h-5 px-1.5 text-[10px] gap-1',
              (response.confidence ?? 0) >= 90 ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : (response.confidence ?? 0) >= 75 ? 'bg-blue-50 text-blue-700 border-blue-200'
                : 'bg-amber-50 text-amber-700 border-amber-200',
            )}
          >
            <Sparkles className="h-2.5 w-2.5" />
            Suggested {response.confidence}%
          </Badge>
        )}
      </div>

      {q.type === 'YES_NO' || q.type === 'BOOLEAN' ? (
        <div className="grid grid-cols-2 gap-2">
          {['Yes', 'No'].map((opt) => (
            <button
              key={opt}
              onClick={() => onChange(q.id, opt)}
              className={cn(
                'flex-1 rounded-lg border py-1.5 text-sm font-medium transition-[color,background-color,border-color,box-shadow,opacity] duration-150 ease-out',
                val === opt
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border text-muted-foreground hover:border-primary/40 hover:text-foreground',
              )}
            >
              {opt}
            </button>
          ))}
        </div>
      ) : q.type === 'TEXTAREA' ? (
        <Textarea
          value={val}
          onChange={(e) => onChange(q.id, e.target.value)}
          placeholder={q.helpText ?? 'Enter your answer…'}
          rows={2}
          className="resize-none text-sm"
        />
      ) : (
        <Input
          type={q.type === 'NUMBER' ? 'number' : 'text'}
          value={val}
          onChange={(e) => onChange(q.id, e.target.value)}
          placeholder={q.helpText ?? 'Enter your answer…'}
          className="h-9 text-sm"
        />
      )}

      {isAiAnswered && (
        <p className="text-[10px] text-primary/70 mt-1.5 flex items-center gap-1">
          <Check className="h-2.5 w-2.5" /> Auto-filled from transcript — edit if incorrect
        </p>
      )}
    </div>
  );
}

export function Step4ClinicalQuestions({ consultation, onNext, onBack }: Props) {
  const questions = consultation.pathway?.questions ?? [];
  const answerQs = useAnswerQuestions(consultation.id);
  const saveStep = useSaveStep(consultation.id);

  const initResponses = (): Record<string, QuestionResponse> => {
    const existing = (consultation.questionResponses ?? {}) as Record<string, QuestionResponse>;
    const init: Record<string, QuestionResponse> = {};
    questions.forEach((q) => {
      init[q.id] = existing[q.id] ?? { questionId: q.id, question: q.question, answer: null, answerText: '' };
    });
    return init;
  };

  const [responses, setResponses] = useState<Record<string, QuestionResponse>>(initResponses);
  const [aiLoading, setAiLoading] = useState(false);

  // Auto-trigger AI answering once on mount if no answers yet
  useEffect(() => {
    const hasAnswers = Object.values(responses).some((r) => r.answer !== null);
    if (!hasAnswers && questions.length > 0 && consultation.transcript) {
      setAiLoading(true);
      answerQs.mutateAsync({}).then((res) => {
        const answers = (res as { answers: Array<{ id: string; answer: unknown; answerText?: string; confidence?: number; source?: 'transcript' | 'entity' | 'inferred' }> }).answers ?? [];
        setResponses((prev) => {
          const next = { ...prev };
          answers.forEach((a) => {
            if (next[a.id]) {
              next[a.id] = {
                ...next[a.id],
                answer: a.answer as string | null,
                answerText: a.answerText ?? String(a.answer ?? ''),
                confidence: a.confidence,
                source: a.source as 'transcript' | 'entity' | 'manual' | undefined,
                aiAnswered: true,
              };
            }
          });
          return next;
        });
      }).catch(() => {}).finally(() => setAiLoading(false));
    }
  }, []); // eslint-disable-line

  const handleChange = (id: string, val: string) => {
    setResponses((prev) => ({
      ...prev,
      [id]: { ...prev[id], answer: val, answerText: val, source: 'manual', aiAnswered: false },
    }));
  };

  const handleNext = async () => {
    await saveStep.mutateAsync({
      stepIndex: 3,
      currentStep: 'CLINICAL_QUESTIONS',
      data: responses as unknown as Record<string, unknown>,
    });
    onNext();
  };

  if (questions.length === 0) {
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
          <ClipboardList className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-medium text-foreground">No clinical questions for this pathway</p>
          <p className="text-sm text-muted-foreground mt-1">Proceed to the next step.</p>
        </div>
        <div className="flex justify-between">
          <Button variant="ghost" size="sm" onClick={onBack} className="text-muted-foreground">← Back</Button>
          <Button onClick={handleNext} className="min-w-36">Continue <ChevronRight className="h-4 w-4 ml-1" /></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-primary/5 to-transparent border-b border-border/60 px-5 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardList className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">Clinical Assessment Questions</h3>
            <Badge variant="secondary" className="text-[10px]">{questions.length} questions</Badge>
          </div>
          {aiLoading && (
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Answering from transcript…
            </div>
          )}
        </div>
        <div className="p-5 space-y-3">
          {questions.map((q) => (
            <QuestionCard key={q.id} q={q} response={responses[q.id]} onChange={handleChange} />
          ))}
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
