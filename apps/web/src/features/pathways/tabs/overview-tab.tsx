'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from '@/lib/notify';
import {
  Brain,
  Loader2,
  Save,
  Globe,
  FileText,
  Calendar,
  ShieldCheck,
  FlaskConical,
  HandHeart,
  BookOpen,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import type { ClinicalPathway } from '../types';
import { useUpdatePathway } from '../hooks';
import {
  CANADIAN_PROVINCES,
  DEFAULT_ASSESSMENT_SECTIONS,
  REQUIREMENT_LEVELS,
  resolveSectionDisplayName,
} from '../pathway-constants';
import { canEditPathway } from '../pathway-utils';
import { ImportFromChatGptButton } from '../import-from-chatgpt-button';
import { PathwayMatchingCard } from '../pathway-matching-card';
import { cn } from '@/lib/utils';
import {
  SECTION_VISIBILITY_PRESETS,
  matchVisibilityPresetId,
  type SectionVisibility,
} from '@safescript/shared';

const schema = z.object({
  condition: z.string().min(2, 'Condition name is required'),
  name: z.string().min(2, 'Clinical pathway name is required'),
  provinceAvailability: z.string().optional(),
  ageMin: z.string().optional(),
  ageMax: z.string().optional(),
  pharmacistPrescribingEligible: z.enum(['true', 'false']),
  requiresPhysicalExam: z.enum(['NEVER', 'OPTIONAL', 'REQUIRED']),
  requiresLabResults: z.enum(['NEVER', 'OPTIONAL', 'REQUIRED']),
  requiresFollowUp: z.boolean(),
  guidelineSource: z.string().optional(),
  lastClinicalReview: z.string().optional(),
  description: z.string().optional(),
  enableAdditionalAssessment: z.boolean(),
  customAssessmentName: z.string().max(80).optional(),
  customAssessmentVisibility: z.enum(['always', 'male', 'female', 'other']),
}).superRefine((data, ctx) => {
  if (data.enableAdditionalAssessment && !(data.customAssessmentName?.trim().length)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['customAssessmentName'],
      message: 'Enter a section name',
    });
  }
});

type FormData = z.infer<typeof schema>;

function customSectionFromPathway(pathway: ClinicalPathway) {
  return pathway.sections?.find((s) => s.name === 'additionalAssessment');
}

export function OverviewTab({ pathway }: { pathway: ClinicalPathway }) {
  const updatePathway = useUpdatePathway(pathway.id);
  const editable = canEditPathway(pathway.status);
  const sectionsEnabled = pathway.assessmentSectionsEnabled ?? DEFAULT_ASSESSMENT_SECTIONS;
  const customSection = customSectionFromPathway(pathway);

  const form = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: toFormValues(pathway, sectionsEnabled.additionalAssessment, customSection),
  });

  const enableCustom = form.watch('enableAdditionalAssessment');

  useEffect(() => {
    form.reset(
      toFormValues(
        pathway,
        (pathway.assessmentSectionsEnabled ?? DEFAULT_ASSESSMENT_SECTIONS).additionalAssessment,
        customSectionFromPathway(pathway),
      ),
    );
  }, [pathway, form]);

  const selectedProvinces = (form.watch('provinceAvailability') || '')
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);

  const toggleProvince = (code: string) => {
    const next = selectedProvinces.includes(code)
      ? selectedProvinces.filter((p) => p !== code)
      : [...selectedProvinces, code];
    form.setValue('provinceAvailability', next.join(','), { shouldDirty: true });
  };

  const onSubmit = async (data: FormData) => {
    try {
      const ageMin = data.ageMin?.trim() ? Number(data.ageMin) : null;
      const ageMax = data.ageMax?.trim() ? Number(data.ageMax) : null;
      if (ageMin !== null && Number.isNaN(ageMin)) {
        form.setError('ageMin', { message: 'Enter a valid age' });
        return;
      }
      if (ageMax !== null && Number.isNaN(ageMax)) {
        form.setError('ageMax', { message: 'Enter a valid age' });
        return;
      }

      await updatePathway.mutateAsync({
        name: data.name.trim(),
        condition: data.condition.trim(),
        province: selectedProvinces[0] || pathway.province,
        provinceAvailability: data.provinceAvailability?.trim() || undefined,
        ageMin,
        ageMax,
        pharmacistPrescribingEligible: data.pharmacistPrescribingEligible === 'true',
        requiresPhysicalExam: data.requiresPhysicalExam,
        requiresLabResults: data.requiresLabResults,
        requiresFollowUp: data.requiresFollowUp,
        guidelineSource: data.guidelineSource?.trim() || undefined,
        lastClinicalReview: data.lastClinicalReview || null,
        description: data.description?.trim() || undefined,
        assessmentSectionsEnabled: {
          diagnosisConfirmation: true,
          additionalAssessment: data.enableAdditionalAssessment,
          treatmentEligibility: true,
        },
        customAssessment: data.enableAdditionalAssessment
          ? {
              displayName: (data.customAssessmentName ?? 'Custom Assessment').trim(),
              visibility:
                (SECTION_VISIBILITY_PRESETS.find((p) => p.id === data.customAssessmentVisibility)
                  ?.visibility as SectionVisibility | null) ?? null,
            }
          : undefined,
      });
      toast.success('Pathway metadata saved.');
    } catch {
      toast.error('Could not save pathway metadata. Please try again.');
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2 space-y-6">
        {pathway.aiSummary && (
          <Card className="shadow-none">
            <div className="flex items-center gap-2.5 border-b border-border/60 bg-gradient-to-r from-violet-50 to-blue-50 px-5 py-3">
              <Brain className="h-4 w-4 text-violet-600" />
              <h3 className="text-sm font-semibold text-violet-900">Clinical Summary</h3>
            </div>
            <p className="p-5 text-sm leading-relaxed text-muted-foreground">{pathway.aiSummary}</p>
          </Card>
        )}

        <Card className="shadow-none">
          <div className="flex items-center justify-between border-b border-border/60 bg-muted/20 px-5 py-3">
            <div>
              <h3 className="text-sm font-semibold">Pathway Metadata</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Eligibility, requirements, and clinical provenance for this pathway
              </p>
            </div>
            {editable && (
              <div className="flex items-center gap-2">
                <ImportFromChatGptButton
                  pathway={pathway}
                  target="overview"
                  canEdit={editable}
                />
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={!form.formState.isDirty || updatePathway.isPending}
                  onClick={form.handleSubmit(onSubmit)}
                >
                  {updatePathway.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  Save
                </Button>
              </div>
            )}
          </div>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5 p-5">
            <fieldset disabled={!editable} className="space-y-5 disabled:opacity-70">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>Condition Name</Label>
                  <Input {...form.register('condition')} placeholder="e.g. Cold Sore" />
                  {form.formState.errors.condition && (
                    <p className="text-xs text-destructive">{form.formState.errors.condition.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label>Clinical Pathway Name</Label>
                  <Input {...form.register('name')} placeholder="e.g. Herpes Labialis — Adult" />
                  {form.formState.errors.name && (
                    <p className="text-xs text-destructive">{form.formState.errors.name.message}</p>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5" /> Province Availability
                </Label>
                <div className="flex flex-wrap gap-2">
                  {CANADIAN_PROVINCES.map((code) => (
                    <button
                      key={code}
                      type="button"
                      disabled={!editable}
                      onClick={() => toggleProvince(code)}
                      className={cn(
                        'rounded-md border px-2.5 py-1 text-xs font-medium transition-colors',
                        selectedProvinces.includes(code)
                          ? 'border-primary bg-primary/10 text-primary'
                          : 'border-border bg-background text-muted-foreground hover:border-primary/40',
                      )}
                    >
                      {code}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>Age Min</Label>
                  <Input type="number" min={0} max={120} placeholder="e.g. 12" {...form.register('ageMin')} />
                </div>
                <div className="space-y-1.5">
                  <Label>Age Max</Label>
                  <Input type="number" min={0} max={120} placeholder="e.g. 65" {...form.register('ageMax')} />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" /> Pharmacist Prescribing
                  </Label>
                  <select
                    className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    {...form.register('pharmacistPrescribingEligible')}
                  >
                    <option value="true">Yes — eligible</option>
                    <option value="false">No — not eligible</option>
                  </select>
                </div>
              </div>

              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    <HandHeart className="h-3.5 w-3.5" /> Physical Examination
                  </Label>
                  <select
                    className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    {...form.register('requiresPhysicalExam')}
                  >
                    {REQUIREMENT_LEVELS.map((l) => (
                      <option key={l.value} value={l.value}>{l.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    <FlaskConical className="h-3.5 w-3.5" /> Laboratory Results
                  </Label>
                  <select
                    className="flex h-10 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                    {...form.register('requiresLabResults')}
                  >
                    {REQUIREMENT_LEVELS.map((l) => (
                      <option key={l.value} value={l.value}>{l.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5 pt-7">
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" className="rounded" {...form.register('requiresFollowUp')} />
                    Requires follow-up
                  </label>
                </div>
              </div>

              <Separator />

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    <BookOpen className="h-3.5 w-3.5" /> Guideline Source
                  </Label>
                  <Input placeholder="e.g. CPS / provincial protocol" {...form.register('guidelineSource')} />
                </div>
                <div className="space-y-1.5">
                  <Label className="flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5" /> Last Clinical Review
                  </Label>
                  <Input type="date" {...form.register('lastClinicalReview')} />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea rows={3} placeholder="Short clinical description of this pathway" {...form.register('description')} />
              </div>
            </fieldset>
          </form>
        </Card>

        <PathwayMatchingCard pathway={pathway} />

        <Card className="shadow-none">
          <div className="flex items-center gap-2.5 border-b border-border/60 bg-muted/20 px-5 py-3">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <div>
              <h3 className="text-sm font-semibold">Presentation Review</h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                Presentation Review is always enabled. Optional custom questions can still be added with visibility rules.
              </p>
            </div>
          </div>
          <form onSubmit={form.handleSubmit(onSubmit)} className="p-5">
            <fieldset disabled={!editable} className="space-y-3 disabled:opacity-70">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="rounded" {...form.register('enableAdditionalAssessment')} />
                Enable Custom Assessment section
              </label>

              {enableCustom && (
                <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="customAssessmentName">Section name</Label>
                    <Input
                      id="customAssessmentName"
                      placeholder="e.g. Male-specific assessment"
                      {...form.register('customAssessmentName')}
                    />
                    {form.formState.errors.customAssessmentName && (
                      <p className="text-xs text-destructive">
                        {form.formState.errors.customAssessmentName.message}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="customAssessmentVisibility">Show this section when</Label>
                    <select
                      id="customAssessmentVisibility"
                      className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                      {...form.register('customAssessmentVisibility')}
                    >
                      {SECTION_VISIBILITY_PRESETS.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.label}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-muted-foreground">
                      During consultations, this section is hidden unless the condition matches
                      the patient demographics (e.g. sex).
                    </p>
                  </div>
                </div>
              )}

              {editable && (
                <div className="flex justify-end pt-1">
                  <Button
                    size="sm"
                    className="gap-1.5"
                    disabled={!form.formState.isDirty || updatePathway.isPending}
                    onClick={form.handleSubmit(onSubmit)}
                  >
                    {updatePathway.isPending ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Save className="h-3.5 w-3.5" />
                    )}
                    Save
                  </Button>
                </div>
              )}
            </fieldset>
          </form>
        </Card>
      </div>

      <div className="space-y-4">
        <Card className="shadow-none">
          <div className="border-b border-border/60 bg-muted/20 px-5 py-3">
            <h3 className="text-sm font-semibold">Pathway Details</h3>
          </div>
          <div className="divide-y divide-border/50">
            {[
              { icon: FileText, label: 'Version', value: `v${pathway.version}` },
              {
                icon: Calendar,
                label: 'Created',
                value: new Date(pathway.createdAt).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }),
              },
              {
                icon: Calendar,
                label: 'Last Updated',
                value: new Date(pathway.updatedAt).toLocaleDateString('en-CA', { year: 'numeric', month: 'short', day: 'numeric' }),
              },
              {
                icon: Users,
                label: 'Created By',
                value: `${pathway.createdBy.firstName} ${pathway.createdBy.lastName}`,
              },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3 px-5 py-3">
                <item.icon className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{item.label}</p>
                  <p className="text-sm font-medium">{item.value}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {pathway.rejectionReason && (
          <Card className="border-destructive/30 bg-destructive/5 shadow-none">
            <div className="border-b border-destructive/20 px-5 py-3">
              <h3 className="text-sm font-semibold text-destructive">Why It Was Rejected</h3>
            </div>
            <p className="p-4 text-sm text-destructive/80">{pathway.rejectionReason}</p>
          </Card>
        )}

        {pathway.versions?.length > 0 && (
          <Card className="shadow-none">
            <div className="border-b border-border/60 bg-muted/20 px-5 py-3">
              <h3 className="text-sm font-semibold">Past Versions</h3>
            </div>
            <div className="divide-y divide-border/50">
              {pathway.versions.map((v) => (
                <div key={v.id} className="flex items-center justify-between px-5 py-3">
                  <span className="rounded-lg bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                    v{v.version}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(v.publishedAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}

function toFormValues(
  pathway: ClinicalPathway,
  enableAdditionalAssessment: boolean,
  customSection?: { displayName: string; visibility?: SectionVisibility | null } | null,
): FormData {
  const visibility = customSection?.visibility ?? null;
  return {
    condition: pathway.condition,
    name: pathway.name,
    provinceAvailability: pathway.provinceAvailability || pathway.province || '',
    ageMin: pathway.ageMin != null ? String(pathway.ageMin) : '',
    ageMax: pathway.ageMax != null ? String(pathway.ageMax) : '',
    pharmacistPrescribingEligible: pathway.pharmacistPrescribingEligible === false ? 'false' : 'true',
    requiresPhysicalExam: pathway.requiresPhysicalExam ?? 'NEVER',
    requiresLabResults: pathway.requiresLabResults ?? 'NEVER',
    requiresFollowUp: pathway.requiresFollowUp ?? false,
    guidelineSource: pathway.guidelineSource ?? '',
    lastClinicalReview: pathway.lastClinicalReview
      ? pathway.lastClinicalReview.slice(0, 10)
      : '',
    description: pathway.description ?? '',
    enableAdditionalAssessment,
    customAssessmentName:
      customSection?.displayName?.trim() ||
      resolveSectionDisplayName('additionalAssessment', pathway.sections),
    customAssessmentVisibility: matchVisibilityPresetId(visibility) as FormData['customAssessmentVisibility'],
  };
}
