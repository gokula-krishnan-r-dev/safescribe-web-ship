'use client';

import { useState, useMemo, type ReactNode } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  Lightbulb,
  CheckCircle2,
  Pill,
  BarChart3,
  Target,
  AlertTriangle,
  UserRound,
  CalendarDays,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { AdaptDurationSelector } from './adapt-duration-selector';
import {
  ClinicalCollapsedSummary,
  ClinicalPendingSummary,
} from '@/features/consultations/clinical-ui';
import { scrollConsultChildIntoView } from '@/features/consultations/clinical-section-scroll';
import {
  isAdaptStepTwoOptionBValid,
  emptyAdaptStepTwoOptionB,
  type AdaptStepTwoOptionB,
  type EffectivenessOption,
  type AdverseEffectsOption,
  type AdherenceOption,
} from '@safescript/shared';

const EFFECTIVENESS_OPTIONS: Array<{ value: EffectivenessOption; label: string }> = [
  { value: 'effective', label: 'Effective / doing well' },
  { value: 'partially_effective', label: 'Partially effective' },
  { value: 'not_effective', label: 'Not effective' },
  { value: 'unable_to_assess', label: 'Unable to assess' },
];

const ADVERSE_EFFECTS_OPTIONS: Array<{ value: AdverseEffectsOption; label: string }> = [
  { value: 'none_reported', label: 'None reported' },
  { value: 'yes_describe', label: 'Yes — describe' },
];

const ADHERENCE_OPTIONS: Array<{ value: AdherenceOption; label: string }> = [
  { value: 'taking_as_directed', label: 'Taking as directed' },
  { value: 'occasional_missed_doses', label: 'Occasional missed doses' },
  { value: 'frequent_missed_doses', label: 'Frequent missed doses' },
  { value: 'other', label: 'Other' },
];

const CHOICE_SELECTED =
  'border-[#0F6F6B] bg-[#F1FAF9] text-[#0F6F6B] shadow-[inset_0_0_0_1px_#0F6F6B]';
const CHOICE_IDLE =
  'border-[#d9e4e8] bg-white text-[#3d4f5f] hover:border-[#b7c5cc] hover:bg-slate-50/70';

export interface Step2CurrentMedicationExperienceProps {
  consultationId: string;
  initialStep2B?: AdaptStepTwoOptionB;
  defaultPrescriptionText?: string;
  isOpen?: boolean;
  onToggleOpen?: () => void;
  sectionRef?: React.RefObject<HTMLDivElement | null>;
  isLocked?: boolean;
  onSaveStep2B: (step2B: AdaptStepTwoOptionB) => Promise<void> | void;
  onBackToPatientInfo: () => void;
  onConfirmExperience: (step2B: AdaptStepTwoOptionB) => void;
}

export function Step2CurrentMedicationExperience({
  initialStep2B,
  defaultPrescriptionText,
  isOpen = true,
  onToggleOpen,
  sectionRef,
  isLocked = false,
  onSaveStep2B,
  onBackToPatientInfo,
  onConfirmExperience,
}: Step2CurrentMedicationExperienceProps) {
  const [step2B, setStep2B] = useState<AdaptStepTwoOptionB>(
    () => initialStep2B ?? emptyAdaptStepTwoOptionB(),
  );

  const [internalOpen, setInternalOpen] = useState(true);
  const open = onToggleOpen ? isOpen : internalOpen;
  const toggleOpen = onToggleOpen ?? (() => setInternalOpen((v) => !v));

  const patchStep2B = (patch: Partial<AdaptStepTwoOptionB>) => {
    setStep2B((prev) => {
      const next = { ...prev, ...patch };
      void onSaveStep2B(next);
      return next;
    });
  };

  const validation = useMemo(() => isAdaptStepTwoOptionBValid(step2B), [step2B]);

  const handleTakingMedicationChange = (isTaking: boolean) => {
    if (isTaking) {
      patchStep2B({
        isTakingMedication: true,
        currentUse: step2B.currentUse || defaultPrescriptionText || '',
      });
      return;
    }
    patchStep2B({ isTakingMedication: false });
  };

  const collapsedSummary = useMemo(() => {
    if (step2B.isTakingMedication === false) return 'Not yet started';
    if (step2B.isTakingMedication === true) {
      const parts: string[] = [];
      if (step2B.duration?.trim()) parts.push(`Taking for ${step2B.duration.trim()}`);
      if (step2B.effectiveness) {
        const eff = EFFECTIVENESS_OPTIONS.find((o) => o.value === step2B.effectiveness);
        if (eff) parts.push(eff.label);
      }
      if (step2B.adverseEffects === 'none_reported') {
        parts.push('No adverse effects');
      } else if (
        step2B.adverseEffects === 'yes_describe' &&
        step2B.adverseEffectsDescription?.trim()
      ) {
        parts.push(step2B.adverseEffectsDescription.trim());
      }
      return parts.join(' · ') || 'Experience recorded';
    }
    return 'Not started';
  }, [step2B]);

  const handleConfirm = () => {
    if (!validation.valid) return;
    const confirmed: AdaptStepTwoOptionB = {
      ...step2B,
      confirmed: true,
      confirmedAt: new Date().toISOString(),
    };
    setStep2B(confirmed);
    void onSaveStep2B(confirmed);
    onConfirmExperience(confirmed);
  };

  if (!open) {
    if (isLocked) {
      return (
        <div ref={sectionRef} className="scroll-mt-3 clinical-section-fade">
          <ClinicalPendingSummary
            step="2B"
            title="Current medication experience"
            hint="Complete patient assessment above to continue"
          />
        </div>
      );
    }
    return (
      <div ref={sectionRef} className="scroll-mt-3 clinical-section-collapse">
        <ClinicalCollapsedSummary
          step="2B"
          title="Current medication experience"
          summary={collapsedSummary}
          onEdit={() => {
            toggleOpen();
            setTimeout(() => {
              if (sectionRef && 'current' in sectionRef && sectionRef.current) {
                scrollConsultChildIntoView(sectionRef.current, {
                  behavior: 'smooth',
                  block: 'start',
                  offset: 16,
                });
              }
            }, 50);
          }}
        />
      </div>
    );
  }

  return (
    <div
      ref={sectionRef}
      className="overflow-hidden rounded-xl border border-[#d9e4e8] bg-white shadow-sm clinical-section-expand"
    >
      {/* Header */}
      <div
        role="button"
        tabIndex={0}
        onClick={(e) => {
          if ((e.target as HTMLElement).closest('button, [role="dialog"], [role="menu"]')) return;
          toggleOpen();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            if ((e.target as HTMLElement).closest('button, [role="dialog"], [role="menu"]')) return;
            e.preventDefault();
            toggleOpen();
          }
        }}
        className="flex cursor-pointer select-none items-start justify-between gap-4 border-b border-[#e2eaed] px-5 py-4 transition-colors hover:bg-slate-50/60 sm:px-6"
      >
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#0F6F6B] text-xs font-bold text-white shadow-sm">
            2B
          </span>
          <div className="min-w-0">
            <h2 className="text-[17px] font-semibold leading-snug text-[#102a43]">
              Current medication experience
            </h2>
            <p className="mt-0.5 text-xs leading-relaxed text-[#627d98]">
              Document how the patient is currently using the medication being adapted.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-start gap-2">
          <div className="hidden max-w-[280px] items-start gap-2 rounded-lg border border-[#cfe8e5] bg-[#F0FAF9] px-3 py-2 text-[11px] leading-snug text-[#2f5f5b] md:flex">
            <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0F6F6B]" aria-hidden />
            <span>
              Tip: This information helps determine if the current therapy is effective, tolerated
              and used as intended.
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={toggleOpen}
            className="h-8 w-8 text-[#52677a] hover:bg-slate-100"
            aria-label={open ? 'Collapse 2B' : 'Expand 2B'}
          >
            {open ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </Button>
        </div>
      </div>

      {/* Body */}
      <div className="space-y-5 px-5 py-5 sm:px-6">
        {/* Mobile tip */}
        <div className="flex items-start gap-2 rounded-lg border border-[#cfe8e5] bg-[#F0FAF9] px-3 py-2.5 text-xs leading-snug text-[#2f5f5b] md:hidden">
          <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#0F6F6B]" aria-hidden />
          <span>
            Tip: This information helps determine if the current therapy is effective, tolerated and
            used as intended.
          </span>
        </div>

        {/* Gating question */}
        <div className="space-y-2.5">
          <FieldLabel required>
            Is the patient already taking the medication being adapted?
          </FieldLabel>
          <div
            role="radiogroup"
            aria-label="Is the patient already taking the medication being adapted?"
            className="flex flex-wrap gap-2"
          >
            <RadioChoiceChip
              label="Yes"
              selected={step2B.isTakingMedication === true}
              onClick={() => handleTakingMedicationChange(true)}
            />
            <RadioChoiceChip
              label="No"
              selected={step2B.isTakingMedication === false}
              onClick={() => handleTakingMedicationChange(false)}
            />
          </div>
        </div>

        {step2B.isTakingMedication === false && (
          <div className="flex items-center gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3.5 text-sm font-medium text-emerald-800 animate-in fade-in duration-200">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
            <span>Medication has not yet been started.</span>
          </div>
        )}

        {step2B.isTakingMedication === true && (
          <div className="space-y-4 animate-in fade-in duration-300">
            {/* Current use */}
            <SectionCard
              icon={Pill}
              title="Current use"
              subtitle="Confirm the medication, dose, how it's being taken, and duration."
            >
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <FieldLabel required>How is the patient currently taking it?</FieldLabel>
                  <p className="text-[11px] text-[#7a8b99]">
                    Current dose, frequency and administration
                  </p>
                  <Input
                    value={step2B.currentUse ?? ''}
                    onChange={(e) => patchStep2B({ currentUse: e.target.value })}
                    placeholder="e.g. Ramipril 10 mg once daily with food"
                    className="h-11 rounded-lg border-[#d5dee3] text-sm text-[#102a43] shadow-none focus-visible:ring-[#0F6F6B]/25"
                  />
                </div>

                <div className="space-y-2">
                  <FieldLabel required icon={CalendarDays}>
                    How long have they been taking it?
                  </FieldLabel>
                  <div className="max-w-md">
                    <AdaptDurationSelector
                      id="adapt-therapy-duration"
                      value={step2B.duration ?? ''}
                      onChange={(duration) => patchStep2B({ duration })}
                      required
                      placeholder="Select duration"
                      aria-label="How long have they been taking it?"
                    />
                  </div>
                </div>
              </div>
            </SectionCard>

            {/* Clinical experience */}
            <SectionCard
              icon={BarChart3}
              title="Clinical experience"
              subtitle="Assess how well the medication is working, tolerability and adherence."
            >
              <div className="space-y-5">
                <div className="space-y-2">
                  <FieldLabel required icon={Target}>
                    Effectiveness / response
                  </FieldLabel>
                  <div
                    role="radiogroup"
                    aria-label="Effectiveness / response"
                    className="flex flex-wrap gap-2"
                  >
                    {EFFECTIVENESS_OPTIONS.map((opt) => (
                      <RadioChoiceChip
                        key={opt.value}
                        label={opt.label}
                        selected={step2B.effectiveness === opt.value}
                        onClick={() => patchStep2B({ effectiveness: opt.value })}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <FieldLabel required icon={AlertTriangle} iconClassName="text-amber-500">
                    Adverse effects / tolerability
                  </FieldLabel>
                  <div
                    role="radiogroup"
                    aria-label="Adverse effects / tolerability"
                    className="flex flex-wrap gap-2"
                  >
                    {ADVERSE_EFFECTS_OPTIONS.map((opt) => (
                      <RadioChoiceChip
                        key={opt.value}
                        label={opt.label}
                        selected={step2B.adverseEffects === opt.value}
                        onClick={() =>
                          patchStep2B({
                            adverseEffects: opt.value,
                            adverseEffectsDescription:
                              opt.value === 'none_reported'
                                ? ''
                                : step2B.adverseEffectsDescription,
                          })
                        }
                      />
                    ))}
                  </div>
                  {step2B.adverseEffects === 'yes_describe' && (
                    <div className="space-y-1.5 animate-in fade-in duration-200">
                      <FieldLabel required>Describe adverse effects</FieldLabel>
                      <Input
                        value={step2B.adverseEffectsDescription ?? ''}
                        onChange={(e) =>
                          patchStep2B({ adverseEffectsDescription: e.target.value })
                        }
                        placeholder="e.g. muscle pain after started taking the medication"
                        className="h-10 rounded-lg border-[#d5dee3] text-sm text-[#102a43] shadow-none focus-visible:ring-[#0F6F6B]/25"
                        autoFocus
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <FieldLabel required icon={Pill}>
                    Adherence
                  </FieldLabel>
                  <div
                    role="radiogroup"
                    aria-label="Adherence"
                    className="flex flex-wrap gap-2"
                  >
                    {ADHERENCE_OPTIONS.map((opt) => (
                      <RadioChoiceChip
                        key={opt.value}
                        label={opt.label}
                        selected={step2B.adherence === opt.value}
                        onClick={() =>
                          patchStep2B({
                            adherence: opt.value,
                            adherenceDescription:
                              opt.value === 'other' ? step2B.adherenceDescription : '',
                          })
                        }
                      />
                    ))}
                  </div>
                  {step2B.adherence === 'other' && (
                    <div className="space-y-1.5 animate-in fade-in duration-200">
                      <FieldLabel required>Describe adherence concern</FieldLabel>
                      <Input
                        value={step2B.adherenceDescription ?? ''}
                        onChange={(e) => patchStep2B({ adherenceDescription: e.target.value })}
                        placeholder="e.g. forgets occasional doses, difficulty with routine"
                        className="h-10 rounded-lg border-[#d5dee3] text-sm text-[#102a43] shadow-none focus-visible:ring-[#0F6F6B]/25"
                        autoFocus
                      />
                    </div>
                  )}
                </div>
              </div>
            </SectionCard>

            {/* Patient concerns */}
            <SectionCard
              icon={UserRound}
              title="Patient concerns or goals"
              subtitle="What matters most to the patient regarding this medication?"
              badge="Optional"
              trailing={
                <span className="text-xs tabular-nums text-[#7b8b94]">
                  {(step2B.patientGoals ?? '').length} / 500
                </span>
              }
            >
              <Textarea
                value={step2B.patientGoals ?? ''}
                onChange={(e) => {
                  if (e.target.value.length <= 500) {
                    patchStep2B({ patientGoals: e.target.value });
                  }
                }}
                placeholder="e.g. Wants to reduce side effects, concerned about long-term use..."
                rows={3}
                className="min-h-[88px] resize-y rounded-lg border-[#d5dee3] text-sm text-[#102a43] shadow-none focus-visible:ring-[#0F6F6B]/25"
              />
            </SectionCard>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex flex-col gap-3 border-t border-[#e2eaed] bg-white px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <Button
          type="button"
          variant="outline"
          onClick={onBackToPatientInfo}
          className="h-10 rounded-lg border-[#d9e4e8] px-4 text-sm font-semibold text-[#52677a] hover:bg-slate-50"
        >
          <ChevronLeft className="mr-1.5 h-4 w-4" />
          <span>Back to Patient Info</span>
        </Button>

        <Button
          type="button"
          onClick={handleConfirm}
          disabled={!validation.valid}
          className={cn(
            'h-10 rounded-lg px-5 text-sm font-semibold text-white shadow-sm transition-colors',
            validation.valid
              ? 'bg-[#0F6F6B] hover:bg-[#0c5956]'
              : 'cursor-not-allowed bg-[#0F6F6B]/40',
          )}
        >
          <span>Save &amp; continue to Proposed Adaptation</span>
          <ChevronRight className="ml-1.5 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function FieldLabel({
  children,
  required,
  icon: Icon,
  iconClassName,
}: {
  children: ReactNode;
  required?: boolean;
  icon?: LucideIcon;
  iconClassName?: string;
}) {
  return (
    <div className="flex items-center gap-1.5 text-sm font-semibold text-[#102a43]">
      {Icon ? (
        <Icon className={cn('h-3.5 w-3.5 shrink-0 text-[#0F6F6B]', iconClassName)} aria-hidden />
      ) : null}
      <span>{children}</span>
      {required ? <span className="text-destructive">*</span> : null}
    </div>
  );
}

function RadioChoiceChip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      className={cn(
        'inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border px-3 text-[13px] font-medium leading-none transition-[color,background-color,border-color,box-shadow] duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0F6F6B]/30 focus-visible:ring-offset-1',
        selected ? CHOICE_SELECTED : CHOICE_IDLE,
      )}
    >
      <span
        aria-hidden
        className={cn(
          'flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border transition-colors',
          selected ? 'border-[#0F6F6B] bg-white' : 'border-[#9fb3c8] bg-white',
        )}
      >
        {selected ? <span className="h-1.5 w-1.5 rounded-full bg-[#0F6F6B]" /> : null}
      </span>
      <span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

function SectionCard({
  icon: Icon,
  title,
  subtitle,
  badge,
  trailing,
  children,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  badge?: string;
  trailing?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-[#e2eaed] bg-white p-4 sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#F0FAF9] text-[#0F6F6B]">
            <Icon className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold text-[#102a43]">{title}</h3>
              {badge ? (
                <span className="inline-flex items-center rounded-full bg-[#eef3f5] px-2.5 py-0.5 text-[11px] font-semibold text-[#667085]">
                  {badge}
                </span>
              ) : null}
            </div>
            <p className="mt-0.5 text-xs leading-relaxed text-[#627d98]">{subtitle}</p>
          </div>
        </div>
        {trailing}
      </div>
      {children}
    </section>
  );
}
