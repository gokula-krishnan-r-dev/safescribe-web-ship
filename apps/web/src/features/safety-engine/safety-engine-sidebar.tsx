'use client';

import { useEffect, useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FlaskConical,
  History,
  Home,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Upload,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  DATASET_REGISTRY,
  EVIDENCE_DATASETS,
  REFERENCE_DATASETS,
  REFERENCE_VALUE_DATASETS,
  RULE_DATASETS,
  WORKFLOW_DATASETS,
  type AuditNavKey,
  type DatasetKey,
  type TerminologyNavKey,
  type UploadNavKey,
} from './dataset-registry';

const STORAGE_KEY = 'safescribe.safety-engine.sidebar';

type CollapsedState = {
  repository: boolean;
  reference: boolean;
  rules: boolean;
  referenceValues: boolean;
  workflow: boolean;
  evidence: boolean;
  terminology: boolean;
  uploads: boolean;
  audit: boolean;
};

const DEFAULT_COLLAPSED: CollapsedState = {
  repository: false,
  reference: false,
  rules: false,
  referenceValues: false,
  workflow: false,
  evidence: true,
  terminology: true,
  uploads: true,
  audit: true,
};

function readCollapsed(): CollapsedState {
  if (typeof window === 'undefined') return DEFAULT_COLLAPSED;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_COLLAPSED;
    return { ...DEFAULT_COLLAPSED, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_COLLAPSED;
  }
}

export type SafetyEngineNavSelection =
  | { section: 'overview' }
  | { section: 'repository'; dataset: DatasetKey }
  | { section: 'terminology'; item: TerminologyNavKey }
  | { section: 'uploads'; item: UploadNavKey }
  | { section: 'audit'; item: AuditNavKey };

interface Props {
  selection: SafetyEngineNavSelection;
  onSelect: (next: SafetyEngineNavSelection) => void;
  releaseLabel?: string;
  counts?: Partial<Record<DatasetKey, number>>;
  className?: string;
}

function SyncBadge() {
  return (
    <span className="ml-auto rounded bg-sky-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-sky-700">
      Sync
    </span>
  );
}

function CountBadge({ value }: { value?: number }) {
  if (value == null || value <= 0) return null;
  return (
    <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-muted-foreground">
      {value}
    </span>
  );
}

export function SafetyEngineSidebar({
  selection,
  onSelect,
  releaseLabel,
  counts,
  className,
}: Props) {
  const [collapsed, setCollapsed] = useState<CollapsedState>(DEFAULT_COLLAPSED);

  useEffect(() => {
    setCollapsed(readCollapsed());
  }, []);

  const toggle = (key: keyof CollapsedState) => {
    setCollapsed((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const ensureOpen = (...keys: Array<keyof CollapsedState>) => {
    setCollapsed((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const key of keys) {
        if (next[key]) {
          next[key] = false;
          changed = true;
        }
      }
      if (!changed) return prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  const isDatasetActive = (key: DatasetKey) =>
    selection.section === 'repository' && selection.dataset === key;

  const selectDataset = (dataset: DatasetKey) => {
    ensureOpen(
      'repository',
      DATASET_REGISTRY[dataset].group === 'REFERENCE'
        ? 'reference'
        : DATASET_REGISTRY[dataset].group === 'RULE'
          ? 'rules'
          : DATASET_REGISTRY[dataset].group === 'REFERENCE_VALUES'
            ? 'referenceValues'
          : DATASET_REGISTRY[dataset].group === 'WORKFLOW'
            ? 'workflow'
            : 'evidence',
    );
    onSelect({ section: 'repository', dataset });
  };

  return (
    <aside
      className={cn(
        'flex h-full w-[272px] shrink-0 flex-col border-r border-border bg-card',
        className,
      )}
    >
      <div className="border-b border-border px-4 py-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <p className="text-[15px] font-bold leading-tight text-foreground">Safety Alert</p>
            <p className="text-[11px] text-muted-foreground">Clinical administration</p>
          </div>
        </div>
        <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-800">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
          <span className="truncate">
            Active repository{releaseLabel ? ` · ${releaseLabel}` : ''}
          </span>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Safety Alert">
        <NavButton
          active={selection.section === 'overview'}
          icon={Home}
          label="Overview"
          onClick={() => onSelect({ section: 'overview' })}
        />

        <SectionHeader
          label="Repository"
          open={!collapsed.repository}
          onToggle={() => toggle('repository')}
          icon={FlaskConical}
        />
        {!collapsed.repository ? (
          <div className="mb-2 ml-1 space-y-2 border-l border-border/80 pl-2">
            <NestedGroup
              label="Reference data"
              open={!collapsed.reference}
              onToggle={() => toggle('reference')}
            >
              {REFERENCE_DATASETS.map((key) => (
                <LeafItem
                  key={key}
                  label={DATASET_REGISTRY[key].label}
                  active={isDatasetActive(key)}
                  sync={DATASET_REGISTRY[key].syncBadge}
                  count={counts?.[key]}
                  onClick={() => selectDataset(key)}
                />
              ))}
            </NestedGroup>

            <NestedGroup
              label="Clinical safety rules"
              open={!collapsed.rules}
              onToggle={() => toggle('rules')}
            >
              {RULE_DATASETS.map((key) => (
                <LeafItem
                  key={key}
                  label={DATASET_REGISTRY[key].label}
                  active={isDatasetActive(key)}
                  count={counts?.[key]}
                  onClick={() => selectDataset(key)}
                />
              ))}
            </NestedGroup>

            <NestedGroup
              label="Reference & Target Values"
              open={!collapsed.referenceValues}
              onToggle={() => toggle('referenceValues')}
            >
              {REFERENCE_VALUE_DATASETS.map((key) => (
                <LeafItem
                  key={key}
                  label={key === 'reference-target-values' ? 'Overview' : DATASET_REGISTRY[key].label}
                  active={isDatasetActive(key)}
                  count={counts?.[key]}
                  onClick={() => selectDataset(key)}
                />
              ))}
            </NestedGroup>

            <NestedGroup
              label="Workflow configuration"
              open={!collapsed.workflow}
              onToggle={() => toggle('workflow')}
            >
              <p className="px-2.5 pb-1 pt-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Renew
              </p>
              {WORKFLOW_DATASETS.map((key) => (
                <LeafItem
                  key={key}
                  label={DATASET_REGISTRY[key].label}
                  active={isDatasetActive(key)}
                  count={counts?.[key]}
                  onClick={() => selectDataset(key)}
                />
              ))}
            </NestedGroup>

            <NestedGroup
              label="Evidence & QA"
              open={!collapsed.evidence}
              onToggle={() => toggle('evidence')}
            >
              {EVIDENCE_DATASETS.map((key) => (
                <LeafItem
                  key={key}
                  label={DATASET_REGISTRY[key].label}
                  active={isDatasetActive(key)}
                  count={counts?.[key]}
                  onClick={() => selectDataset(key)}
                />
              ))}
            </NestedGroup>
          </div>
        ) : null}

        <SectionHeader
          label="Terminology"
          open={!collapsed.terminology}
          onToggle={() => toggle('terminology')}
          icon={RefreshCw}
        />
        {!collapsed.terminology ? (
          <div className="mb-2 ml-3 space-y-0.5 border-l border-border/80 pl-2">
            {(
              [
                ['sync', 'Synchronization'],
                ['compare', 'Release Comparison'],
                ['unresolved', 'Unresolved Concepts'],
                ['history', 'Sync History'],
              ] as const
            ).map(([item, label]) => (
              <LeafItem
                key={item}
                label={label}
                active={selection.section === 'terminology' && selection.item === item}
                onClick={() => {
                  ensureOpen('terminology');
                  onSelect({ section: 'terminology', item });
                }}
              />
            ))}
          </div>
        ) : null}

        <SectionHeader
          label="Upload & Publish"
          open={!collapsed.uploads}
          onToggle={() => toggle('uploads')}
          icon={Upload}
        />
        {!collapsed.uploads ? (
          <div className="mb-2 ml-3 space-y-0.5 border-l border-border/80 pl-2">
            {(
              [
                ['new', 'New Upload'],
                ['batches', 'Import Batches'],
                ['validation', 'Validation Issues'],
                ['review', 'Clinical Review Queue'],
                ['candidate', 'Candidate Release'],
                ['tests', 'Test Runs'],
                ['releases', 'Release History'],
              ] as const
            ).map(([item, label]) => (
              <LeafItem
                key={item}
                label={label}
                active={selection.section === 'uploads' && selection.item === item}
                onClick={() => {
                  ensureOpen('uploads');
                  onSelect({ section: 'uploads', item });
                }}
              />
            ))}
          </div>
        ) : null}

        <SectionHeader
          label="Audit & Settings"
          open={!collapsed.audit}
          onToggle={() => toggle('audit')}
          icon={Settings2}
        />
        {!collapsed.audit ? (
          <div className="mb-2 ml-3 space-y-0.5 border-l border-border/80 pl-2">
            {(
              [
                ['log', 'Audit Log'],
                ['roles', 'Users & Roles'],
                ['settings', 'Repository Settings'],
                ['integration', 'Integration Status'],
              ] as const
            ).map(([item, label]) => (
              <LeafItem
                key={item}
                label={label}
                active={selection.section === 'audit' && selection.item === item}
                onClick={() => {
                  ensureOpen('audit');
                  onSelect({ section: 'audit', item });
                }}
              />
            ))}
          </div>
        ) : null}
      </nav>

      <div className="border-t border-border px-3 py-3 text-[11px] leading-snug text-muted-foreground">
        <History className="mb-1 inline h-3 w-3" /> Top-level and nested groups collapse independently.
        SYNC marks terminology-managed datasets.
      </div>
    </aside>
  );
}

function NavButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'mb-1 flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-medium transition-colors',
        active
          ? 'bg-primary/10 text-primary'
          : 'text-foreground/80 hover:bg-muted/70 hover:text-foreground',
      )}
    >
      <Icon className="h-4 w-4 shrink-0 opacity-80" />
      {label}
    </button>
  );
}

function SectionHeader({
  label,
  open,
  onToggle,
  icon: Icon,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  icon: LucideIcon;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className="mb-1 flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12px] font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted/50 hover:text-foreground"
    >
      <Icon className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1">{label}</span>
      {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
    </button>
  );
}

function NestedGroup({
  label,
  open,
  onToggle,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:bg-muted/40"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        {label}
      </button>
      {open ? <div className="mt-0.5 space-y-0.5">{children}</div> : null}
    </div>
  );
}

function LeafItem({
  label,
  active,
  onClick,
  sync,
  count,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  sync?: boolean;
  count?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors',
        active
          ? 'bg-primary/10 font-semibold text-primary'
          : 'text-foreground/75 hover:bg-muted/60 hover:text-foreground',
      )}
    >
      <span
        className={cn(
          'h-1.5 w-1.5 shrink-0 rounded-full',
          active ? 'bg-primary' : 'bg-border',
        )}
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {sync ? <SyncBadge /> : <CountBadge value={count} />}
    </button>
  );
}

