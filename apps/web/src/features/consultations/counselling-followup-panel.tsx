'use client';

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  BookOpen,
  ExternalLink,
  Info,
  Loader2,
  Lock,
  Pencil,
  Plus,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  SECTION_CARD_NUMBER,
  SECTION_DISPLAY_TITLE,
  screenItems,
  sectionBulletLimit,
  sectionItemCap,
  type CounsellingGuidanceItem,
  type CounsellingPlan,
  type CounsellingSectionKey,
} from './counselling-panel-model';
import {
  ADAPT_COUNSELLING_EMPTY_REASON,
  COUNSELLING_EMPTY_REASON,
  COUNSELLING_UI_PLACEHOLDER,
  compactCounsellingLine,
  isCounsellingUiPlaceholder,
} from '@safescript/shared';

export interface CounsellingSummary {
  presentingConcern?: string;
  condition?: string;
  treatments: string[];
  age?: string;
}

/** Primary screen shows 2–3 concise points; remaining approved guidance is secondary. */
export function sectionScreenDisplayLimit(sectionKey: CounsellingSectionKey): number {
  if (sectionKey === 'MEDICATION_USE') return 3;
  return sectionBulletLimit(sectionKey);
}

export function primaryScreenItems(
  items: CounsellingGuidanceItem[],
  sectionKey: CounsellingSectionKey,
): CounsellingGuidanceItem[] {
  return screenItems(items).slice(0, sectionScreenDisplayLimit(sectionKey));
}

export function additionalGuidanceItems(
  items: CounsellingGuidanceItem[],
  sectionKey: CounsellingSectionKey,
): CounsellingGuidanceItem[] {
  const usable = items.filter((i) => !i.text || !isPlaceholder(i.text));
  const primaryIds = new Set(primaryScreenItems(items, sectionKey).map((i) => i.item_id));
  return usable.filter((i) => !primaryIds.has(i.item_id));
}

function isPlaceholder(text: string): boolean {
  if (isCounsellingUiPlaceholder(text)) return true;
  const t = text.replace(/\s+/g, ' ').trim().toLowerCase();
  return Object.values(ADAPT_COUNSELLING_EMPTY_REASON).some(
    (reason) => t === reason.toLowerCase(),
  );
}

function ReviewStatusBadge({
  plan,
  reviewed,
}: {
  plan: CounsellingPlan;
  reviewed: boolean;
}) {
  if (plan.status === 'OUTDATED') {
    return (
      <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#f0c999] bg-[#fff8ef] px-2.5 text-[12px] font-semibold text-[#a95300]">
        <AlertTriangle className="h-3 w-3" />
        Needs update
      </span>
    );
  }
  if (reviewed) {
    return (
      <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[#b7e0db] bg-[#eef8f6] px-2.5 text-[12px] font-semibold text-[#0f6f6b]">
        <ShieldCheck className="h-3 w-3" />
        Reviewed
      </span>
    );
  }
  return null;
}

function BulletText({ item }: { item: CounsellingGuidanceItem }) {
  const treatmentStyle = Boolean(item.headline?.trim() && item.source_type === 'SELECTED_REGIMEN');
  if (treatmentStyle) {
    const name = item.headline?.trim();
    const directions = compactCounsellingLine(item.detail || item.text);
    return (
      <li className="flex gap-2 text-[13px] leading-[1.45] text-[#334155]">
        <span className="mt-[0.45em] h-1 w-1 shrink-0 rounded-full bg-[#94a3b8]" aria-hidden />
        <span className="min-w-0">
          {name ? <span className="font-semibold text-[#10233d]">{name}. </span> : null}
          {directions}
        </span>
      </li>
    );
  }

  const headline = item.headline?.trim();
  const detail = item.detail?.trim();
  const line = compactCounsellingLine(
    headline && detail && headline.toLowerCase() !== detail.toLowerCase()
      ? `${headline}: ${detail}`
      : item.text || headline || detail || '',
  );

  return (
    <li className="flex gap-2 text-[13px] leading-[1.45] text-[#334155]">
      <span className="mt-[0.45em] h-1 w-1 shrink-0 rounded-full bg-[#94a3b8]" aria-hidden />
      <span className="min-w-0">{line}</span>
    </li>
  );
}

function GuidanceSectionCard({
  sectionKey,
  title,
  items,
  editing,
  emptyReason,
  onEdit,
  onChangeItem,
  onRemoveItem,
  onAddItem,
}: {
  sectionKey: CounsellingSectionKey;
  title: string;
  items: CounsellingGuidanceItem[];
  editing: boolean;
  emptyReason?: string;
  onEdit: () => void;
  onChangeItem: (itemId: string, text: string) => void;
  onRemoveItem: (itemId: string) => void;
  onAddItem: () => void;
}) {
  const n = SECTION_CARD_NUMBER[sectionKey];
  const cap = sectionItemCap(sectionKey);
  const atMax = items.length >= cap;
  const [expanded, setExpanded] = useState(false);
  const usable = useMemo(() => screenItems(items), [items]);
  const primary = useMemo(
    () => primaryScreenItems(items, sectionKey),
    [items, sectionKey],
  );
  const overflowCount = editing ? 0 : Math.max(0, usable.length - primary.length);
  const visible = editing ? items : expanded ? usable : primary;
  const emptyCopy =
    emptyReason || COUNSELLING_EMPTY_REASON[sectionKey] || COUNSELLING_UI_PLACEHOLDER;
  const sectionLabel = title || SECTION_DISPLAY_TITLE[sectionKey];
  const itemSignature = usable.map((item) => item.item_id).join('|');

  // Collapse when the section contents change (regenerate / plan refresh).
  useEffect(() => {
    setExpanded(false);
  }, [itemSignature, editing]);

  return (
    <article className="flex h-full min-h-0 flex-col rounded-[12px] border border-[#d7e0e4] bg-white px-3.5 py-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
      <div className="mb-2.5 flex items-start justify-between gap-2">
        <h4 className="min-w-0 text-[13.5px] font-bold leading-snug text-[#10233d]">
          {n}. {sectionLabel}
        </h4>
        <button
          type="button"
          onClick={onEdit}
          aria-label={editing ? `Done editing ${sectionLabel}` : `Edit ${sectionLabel}`}
          className={cn(
            'inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md',
            editing
              ? 'bg-[#e7f6f4] text-[#0f6f6b]'
              : 'text-[#0f6f6b] hover:bg-[#f3fbfa]',
          )}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </div>

      {editing ? (
        <ul className="grid list-none gap-2.5 p-0">
          {visible.map((item) => (
            <li key={item.item_id} className="space-y-1">
              {item.headline?.trim() ? (
                <p className="text-[11.5px] font-semibold text-[#52606d]">
                  {item.headline.trim()}
                </p>
              ) : null}
              <Textarea
                value={item.detail?.trim() || item.text}
                onChange={(e) => onChangeItem(item.item_id, e.target.value)}
                rows={2}
                className="min-h-[64px] resize-y rounded-[8px] border-[#c5d1d5] px-3 py-2.5 text-[13px] leading-snug shadow-none"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-[#8a949e]">
                  {item.pharmacist_added
                    ? 'Pharmacist added'
                    : item.pharmacist_modified
                      ? 'Edited'
                      : item.source_type === 'PATHWAY_COUNSELLING'
                        ? 'Pathway'
                        : 'Draft'}
                </span>
                {item.removable ? (
                  <button
                    type="button"
                    onClick={() => onRemoveItem(item.item_id)}
                    className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[#8a949e] hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                    Remove
                  </button>
                ) : null}
              </div>
            </li>
          ))}
          {!visible.length ? (
            <li className="rounded-lg border border-dashed border-[#e5ebed] bg-[#fafcfc] px-3 py-2.5 text-[12.5px] leading-snug text-[#667085]">
              {emptyCopy}
            </li>
          ) : null}
        </ul>
      ) : (
        <ul className="grid list-none gap-1.5 p-0">
          {visible.map((item) => (
            <BulletText key={item.item_id} item={item} />
          ))}
          {!visible.length ? (
            <li className="rounded-lg border border-dashed border-[#e5ebed] bg-[#fafcfc] px-3 py-2 text-[12.5px] leading-snug text-[#667085]">
              {emptyCopy}
            </li>
          ) : null}
          {overflowCount > 0 ? (
            <li className="pt-1">
              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={`counselling-overflow-${sectionKey}`}
                onClick={() => setExpanded((value) => !value)}
                className="inline-flex items-center rounded-md text-[11.5px] font-semibold text-[#0f6f6b] underline-offset-2 transition-colors hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0f6f6b]/40"
              >
                {expanded
                  ? 'Show fewer points'
                  : `+${overflowCount} more in additional guidance`}
              </button>
              <span id={`counselling-overflow-${sectionKey}`} className="sr-only">
                {expanded
                  ? `Showing all ${usable.length} counselling points for ${sectionLabel}.`
                  : `${overflowCount} additional counselling point${
                      overflowCount === 1 ? '' : 's'
                    } hidden for ${sectionLabel}. Activate to expand.`}
              </span>
            </li>
          ) : null}
        </ul>
      )}

      {editing ? (
        <button
          type="button"
          onClick={onAddItem}
          disabled={atMax}
          className="mt-2.5 inline-flex items-center gap-1 text-[12.5px] font-semibold text-[#0f6f6b] hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:no-underline"
        >
          <Plus className="h-3.5 w-3.5" />
          {atMax ? `Maximum of ${cap} points` : 'Add point'}
        </button>
      ) : null}
    </article>
  );
}

function SafetyBlockedPanel() {
  return (
    <section className="overflow-hidden rounded-[14px] border border-tx-avoid-border bg-card shadow-sm">
      <div className="flex flex-col gap-3 px-5 py-5 sm:flex-row sm:items-start sm:px-6">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-tx-avoid-bg text-tx-avoid">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-[18px] font-bold leading-snug text-[#10233d]">
            Treatment safety review required
          </h2>
          <p className="mt-1.5 max-w-2xl text-[13.5px] leading-relaxed text-[#58636F]">
            A selected treatment conflicts with a recorded allergy. Return to Treatment
            Options and either remove it, or document a clinical override to use it for
            this consultation.
          </p>
        </div>
      </div>
    </section>
  );
}

export function CounsellingFollowUpPanel({
  plan,
  editing,
  reviewed,
  summary,
  emptyReasons,
  generatingLabel,
  onToggleEdit,
  onToggleHandout,
  onChangeItem,
  onRemoveItem,
  onAddItem,
  onUpdatePlan,
  onRetryGenerate,
  onRestoreRecommended,
  continueAction,
  preContinue,
}: {
  plan: CounsellingPlan | null;
  editing: boolean;
  reviewed: boolean;
  summary?: CounsellingSummary;
  /** Override pathway empty-card copy (e.g. Adapt AI counselling). */
  emptyReasons?: Partial<Record<CounsellingSectionKey, string>>;
  generatingLabel?: string;
  onToggleEdit: () => void;
  onToggleHandout: (v: boolean) => void;
  onChangeItem: (sectionKey: CounsellingSectionKey, itemId: string, text: string) => void;
  onRemoveItem: (sectionKey: CounsellingSectionKey, itemId: string) => void;
  onAddItem: (sectionKey: CounsellingSectionKey) => void;
  onUpdatePlan?: () => void;
  onRetryGenerate?: () => void;
  onRestoreRecommended?: () => void;
  continueAction?: ReactNode;
  preContinue?: ReactNode;
}) {
  const [editingSection, setEditingSection] = useState<CounsellingSectionKey | null>(null);
  const [guidanceOpen, setGuidanceOpen] = useState(false);
  const [guidanceFocusSection, setGuidanceFocusSection] =
    useState<CounsellingSectionKey | null>(null);
  const guidanceSectionRefs = useRef<Partial<Record<CounsellingSectionKey, HTMLDivElement | null>>>(
    {},
  );

  const openAdditionalGuidance = (sectionKey?: CounsellingSectionKey) => {
    setGuidanceFocusSection(sectionKey ?? null);
    setGuidanceOpen(true);
  };

  useEffect(() => {
    if (!guidanceOpen || !guidanceFocusSection) return;
    const node = guidanceSectionRefs.current[guidanceFocusSection];
    if (!node) return;
    // Wait a tick so the dialog content is mounted before scrolling.
    const timer = window.setTimeout(() => {
      node.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
    return () => window.clearTimeout(timer);
  }, [guidanceOpen, guidanceFocusSection]);

  const orderedSections = useMemo(() => {
    if (!plan?.sections.length) return [];
    const order: CounsellingSectionKey[] = [
      'MEDICATION_USE',
      'EXPECTED_RESPONSE',
      'SELF_CARE',
      'FOLLOW_UP',
    ];
    return order
      .map((key) => plan.sections.find((s) => s.section_key === key))
      .filter((s): s is NonNullable<typeof s> => Boolean(s));
  }, [plan]);

  const additionalBySection = useMemo(() => {
    return orderedSections
      .map((section) => ({
        section,
        items: additionalGuidanceItems(section.items, section.section_key),
      }))
      .filter((row) => row.items.length > 0);
  }, [orderedSections]);

  const additionalCount = additionalBySection.reduce((sum, row) => sum + row.items.length, 0);

  if (!plan || plan.status === 'NOT_READY' || plan.status === 'LOCKED') {
    return (
      <section className="rounded-[14px] border border-dashed border-[#d5dee1] bg-[#fafcfc] px-5 py-5 sm:px-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#eef2f3] text-[#667085]">
            <Lock className="h-4 w-4" aria-hidden />
          </div>
          <div>
            <h2 className="text-[18px] font-bold leading-snug text-[#10233d]">
              Counselling & follow-up
            </h2>
            <p className="mt-1 text-[13.5px] leading-relaxed text-[#58636F]">
              Confirm the treatment plan to generate personalized counselling and follow-up.
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (plan.status === 'SAFETY_BLOCKED') {
    return <SafetyBlockedPanel />;
  }

  if (plan.status === 'GENERATING') {
    return (
      <section className="rounded-[14px] border border-[#d5dee1] bg-card px-5 py-6 sm:px-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#eff9f8] text-[#0f766e]">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
          <div>
            <h2 className="text-[18px] font-bold leading-snug text-[#10233d]">
              Counselling & follow-up
            </h2>
            <p className="mt-1 text-[13.5px] leading-relaxed text-[#58636F]">
              {generatingLabel ||
                'Generating a personalized draft from the confirmed treatment plan…'}
            </p>
          </div>
        </div>
      </section>
    );
  }

  if (plan.status === 'GENERATION_FAILED') {
    return (
      <section className="rounded-[14px] border border-amber-200 bg-amber-50/70 px-5 py-5 sm:px-6">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[18px] font-bold leading-snug text-[#10233d]">
              Counselling & follow-up
            </h2>
            <p className="mt-1 text-[13.5px] leading-relaxed text-[#58636F]">
              {plan.failure_reason?.trim()
                ? plan.failure_reason
                : 'Counselling could not be generated. Retry once the assist engine is available.'}
            </p>
            {onRetryGenerate ? (
              <Button
                type="button"
                variant="outline"
                className="mt-3 h-9 border-primary/40 text-primary"
                onClick={onRetryGenerate}
              >
                <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                Retry generation
              </Button>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section
      className="w-full overflow-hidden rounded-[14px] border border-[#d5dee1] bg-white shadow-[0_2px_8px_rgba(15,23,42,0.04)]"
      aria-labelledby="counselling-followup-heading"
    >
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#e8f6f4] text-[#0f6f6b]">
            <BookOpen className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0">
            <h2
              id="counselling-followup-heading"
              className="text-[18px] font-bold leading-snug tracking-tight text-[#10233d]"
            >
              Counselling & follow-up
            </h2>
            <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-[#5b6b76]">
              Key counselling points for the selected treatment. You can edit the content
              or add additional points.
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          {editing && onRestoreRecommended ? (
            <Button
              type="button"
              variant="ghost"
              onClick={onRestoreRecommended}
              className="h-8 gap-1.5 px-2.5 text-[12.5px] font-semibold text-muted-foreground"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Restore
            </Button>
          ) : null}
          <ReviewStatusBadge plan={plan} reviewed={reviewed} />
          <button
            type="button"
            onClick={() => {
              setEditingSection(null);
              onToggleEdit();
            }}
            className={cn(
              'inline-flex h-8 items-center justify-center gap-1.5 rounded-[8px] border border-[#0f6f6b] bg-white px-3 text-[13px] font-semibold text-[#0f6f6b]',
              'transition-colors hover:bg-[#f3fbfa]',
            )}
          >
            <Pencil className="h-3.5 w-3.5" />
            {editing ? 'Done' : 'Edit all'}
          </button>
        </div>
      </div>

      {plan.status === 'OUTDATED' ? (
        <div className="mx-4 mb-3 flex flex-col gap-2 rounded-[10px] border border-tx-caution-border/70 bg-tx-caution-bg px-3.5 py-3 sm:mx-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[13px] font-semibold text-tx-caution-fg">
              Plan changed — reconfirm to refresh counselling.
            </p>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">
              This draft may no longer match the current treatment plan.
            </p>
          </div>
          {onUpdatePlan ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={onUpdatePlan}
              className="h-9 shrink-0 border-tx-caution-border text-[12.5px] font-semibold text-tx-caution-fg hover:bg-white"
            >
              Review treatment changes
            </Button>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 px-4 pb-4 sm:grid-cols-2 sm:px-5 xl:grid-cols-4">
        {orderedSections.map((section) => (
          <GuidanceSectionCard
            key={section.section_key}
            sectionKey={section.section_key}
            title={section.title}
            items={section.items}
            emptyReason={emptyReasons?.[section.section_key]}
            editing={editing || editingSection === section.section_key}
            onEdit={() => {
              if (editing) {
                onToggleEdit();
                return;
              }
              setEditingSection((current) =>
                current === section.section_key ? null : section.section_key,
              );
            }}
            onChangeItem={(itemId, text) =>
              onChangeItem(section.section_key, itemId, text)
            }
            onRemoveItem={(itemId) => onRemoveItem(section.section_key, itemId)}
            onAddItem={() => onAddItem(section.section_key)}
          />
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e6eef1] px-4 py-3 sm:px-5">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex items-center gap-2 text-[13px] font-semibold text-[#0f6f6b] hover:underline"
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[#e7f6f4] text-[#0f6f6b]">
                <Plus className="h-3.5 w-3.5" />
              </span>
              Add counselling point
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="start"
            side="top"
            sideOffset={8}
            collisionPadding={16}
            className="z-[80] min-w-[260px] p-1.5"
          >
            {orderedSections.map((section) => (
              <DropdownMenuItem
                key={section.section_key}
                className="rounded-lg px-3 py-2 text-[13px] font-medium text-[#10233d] focus:bg-[#f3fbfa]"
                onSelect={() => {
                  setEditingSection(section.section_key);
                  onAddItem(section.section_key);
                }}
              >
                {SECTION_DISPLAY_TITLE[section.section_key]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <button
          type="button"
          onClick={() => openAdditionalGuidance()}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#0f6f6b] hover:underline"
        >
          View additional guidance
          <ExternalLink className="h-3.5 w-3.5" />
          {additionalCount > 0 ? (
            <span className="rounded-full bg-[#e7f6f4] px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-[#0f6f6b]">
              {additionalCount}
            </span>
          ) : null}
        </button>
      </div>

      {preContinue}

      <div
        className={cn(
          'flex flex-col gap-4 border-t border-[#e6eef1] px-4 py-3.5 sm:px-5',
          continueAction
            ? 'sm:flex-row sm:items-center sm:justify-between'
            : '',
        )}
      >
        <label className="flex min-w-0 cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            checked={plan.include_detailed_handout}
            onChange={(e) => onToggleHandout(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 rounded border-border accent-[#0f817c]"
          />
          <span>
            <span className="block text-[13px] font-semibold text-[#25303b]">
              Include in patient handout
            </span>
            <span className="mt-0.5 block text-[12px] leading-snug text-[#7a8792]">
              Use this confirmed counselling as source content for the patient handout.
            </span>
          </span>
        </label>
        {continueAction ? (
          <div className="flex w-full shrink-0 justify-end sm:w-auto">{continueAction}</div>
        ) : null}
      </div>

      <Dialog
        open={guidanceOpen}
        onOpenChange={(open) => {
          setGuidanceOpen(open);
          if (!open) setGuidanceFocusSection(null);
        }}
      >
        <DialogContent className="max-h-[86vh] max-w-[560px] overflow-y-auto rounded-2xl">
          <DialogTitle>Additional guidance</DialogTitle>
          <DialogDescription>
            Approved counselling points beyond the four primary cards. Add a point to a
            card only when it is useful for this patient.
          </DialogDescription>
          {additionalBySection.length ? (
            <div className="mt-2 space-y-4">
              {additionalBySection.map(({ section, items }) => {
                const focused = guidanceFocusSection === section.section_key;
                return (
                  <div
                    key={section.section_key}
                    ref={(node) => {
                      guidanceSectionRefs.current[section.section_key] = node;
                    }}
                    className={cn(
                      'rounded-[12px] border px-3 py-2.5 transition-colors',
                      focused
                        ? 'border-[#9fd4cf] bg-[#f3fbfa]'
                        : 'border-transparent',
                    )}
                  >
                    <p className="text-[13px] font-bold text-[#10233d]">
                      {SECTION_DISPLAY_TITLE[section.section_key]}
                    </p>
                    <ul className="mt-2 space-y-2">
                      {items.map((item) => (
                        <li
                          key={item.item_id}
                          className="rounded-[10px] border border-[#e6eef1] bg-white px-3 py-2.5 text-[13px] leading-relaxed text-[#334155]"
                        >
                          {compactCounsellingLine(item.detail || item.text)}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-3 flex items-start gap-2 text-[13px] leading-relaxed text-[#5b6b76]">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#0f6f6b]" />
              No additional approved guidance is available beyond the points shown on the
              four cards.
            </p>
          )}
        </DialogContent>
      </Dialog>

      {summary ? (
        <span className="sr-only">
          Consultation context: {[summary.age, summary.presentingConcern, summary.condition]
            .filter(Boolean)
            .join('. ')}
        </span>
      ) : null}
    </section>
  );
}
