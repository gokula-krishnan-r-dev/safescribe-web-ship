'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Bot,
  Check,
  Loader2,
  RotateCcw,
  Save,
  Search,
  Settings2,
  Sparkles,
  AlertCircle,
} from 'lucide-react';
import { toast } from '@/lib/notify';
import { PageHeader } from '@/components/shared/page-header';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState, ErrorState } from '@/components/shared/states';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  useAiConfigCatalog,
  useApplyAiConfig,
  useResetAiPrompt,
  useResetAllAiConfig,
} from './hooks';
import { CATEGORY_LABELS, HIDDEN_PROMPT_KEYS, type AiPlatformSettingsDto, type AiSystemPromptItem } from './types';
import {
  DEFAULT_OPENAI_FAST_MODEL,
  DEFAULT_OPENAI_MODEL,
  getOpenAiChatModel,
  openAiModelSelectOptions,
} from '@safescript/shared';

export function AiConfigPage() {
  const { data, isLoading, isError, refetch } = useAiConfigCatalog();
  const apply = useApplyAiConfig();
  const resetOne = useResetAiPrompt();
  const resetAll = useResetAllAiConfig();

  const [search, setSearch] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [settingsDraft, setSettingsDraft] = useState<AiPlatformSettingsDto | null>(null);
  const [resetAllOpen, setResetAllOpen] = useState(false);
  const [showDefault, setShowDefault] = useState(false);

  useEffect(() => {
    setShowDefault(false);
  }, [selectedKey]);

  useEffect(() => {
    if (!data) return;
    setDrafts(Object.fromEntries(data.prompts.map((p) => [p.key, p.content])));
    setSettingsDraft({
      openaiModel: data.settings.openaiModel,
      openaiFastModel: data.settings.openaiFastModel,
      openaiEmbeddingModel: data.settings.openaiEmbeddingModel,
      temperatureDefault: data.settings.temperatureDefault,
      maxRetries: data.settings.maxRetries,
      timeoutSeconds: data.settings.timeoutSeconds,
    });
    setSelectedKey((prev) => prev ?? data.prompts[0]?.key ?? null);
  }, [data]);

  const prompts = data?.prompts ?? [];
  const selected = prompts.find((p) => p.key === selectedKey) ?? null;
  const draftContent = selected ? (drafts[selected.key] ?? selected.content) : '';

  const dirtyPromptKeys = useMemo(() => {
    if (!data) return [];
    return data.prompts
      .filter((p) => (drafts[p.key] ?? p.content) !== p.content)
      .map((p) => p.key);
  }, [data, drafts]);

  const settingsDirty = useMemo(() => {
    if (!data || !settingsDraft) return false;
    const s = data.settings;
    return (
      settingsDraft.openaiModel !== s.openaiModel ||
      settingsDraft.openaiFastModel !== s.openaiFastModel ||
      settingsDraft.openaiEmbeddingModel !== s.openaiEmbeddingModel ||
      settingsDraft.temperatureDefault !== s.temperatureDefault ||
      settingsDraft.maxRetries !== s.maxRetries ||
      settingsDraft.timeoutSeconds !== s.timeoutSeconds
    );
  }, [data, settingsDraft]);

  const dirtyCount = dirtyPromptKeys.length + (settingsDirty ? 1 : 0);
  const selectedDirty =
    selected && (drafts[selected.key] ?? selected.content) !== selected.content;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const visible = prompts.filter(
      (p) => !HIDDEN_PROMPT_KEYS.has(p.key) || q.includes('legacy'),
    );
    if (!q) return visible;
    return visible.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.key.toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q),
    );
  }, [prompts, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, AiSystemPromptItem[]>();
    for (const p of filtered) {
      const list = map.get(p.category) ?? [];
      list.push(p);
      map.set(p.category, list);
    }
    const order = [
      'documentation',
      'consultation',
      'clinical-judgment',
      'pathway',
      'labs',
      'fallback',
    ];
    return Array.from(map.entries()).sort((a, b) => {
      const ia = order.indexOf(a[0]);
      const ib = order.indexOf(b[0]);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }, [filtered]);

  const handleApplyAll = async () => {
    if (!data || dirtyCount === 0) return;
    try {
      const result = await apply.mutateAsync({
        prompts: dirtyPromptKeys.map((key) => ({
          key,
          content: drafts[key] ?? '',
        })),
        settings:
          settingsDirty && settingsDraft
            ? {
                openaiModel: settingsDraft.openaiModel,
                openaiFastModel: settingsDraft.openaiFastModel,
                openaiEmbeddingModel: settingsDraft.openaiEmbeddingModel,
                temperatureDefault: settingsDraft.temperatureDefault,
                maxRetries: settingsDraft.maxRetries,
                timeoutSeconds: settingsDraft.timeoutSeconds,
              }
            : undefined,
      });
      toast.success(result.message, {
        description: result.aiEngineSynced
          ? 'Live for the next document generate and other assist calls.'
          : `${result.aiEngineMessage ?? 'Assist Engine not synced'}. Document generate still uses the saved API prompt.`,
      });
    } catch (err) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? Array.isArray((err as { message: unknown }).message)
            ? (err as { message: string[] }).message.join(', ')
            : String((err as { message: unknown }).message)
          : 'Failed to apply changes';
      toast.error(msg);
    }
  };

  const handleApplySelected = async () => {
    if (!selected || !selectedDirty) return;
    try {
      const result = await apply.mutateAsync({
        prompts: [{ key: selected.key, content: drafts[selected.key] ?? selected.content }],
      });
      toast.success(`Applied: ${selected.name}`, {
        description: result.aiEngineSynced
          ? 'Live for the next document generate.'
          : `${result.aiEngineMessage ?? 'Engine not synced'}. The API will still send this prompt on generate.`,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to apply prompt');
    }
  };

  const handleResetSelected = async () => {
    if (!selected) return;
    try {
      await resetOne.mutateAsync(selected.key);
      toast.success(`Reset ${selected.name} to default`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reset failed');
    }
  };

  const handleResetAll = async () => {
    try {
      await resetAll.mutateAsync();
      setResetAllOpen(false);
      toast.success('All prompts and settings restored to defaults');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Reset failed');
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading assist configuration…
      </div>
    );
  }

  if (isError || !data) {
    return <ErrorState title="Could not load assist config" onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-6 pb-24">
      <PageHeader
        title="Assist System"
        description="Edit live system prompts. Apply saves to the API and is used on the next generate. Document Session covers Prescribe Step 6 and Renew Step 4 (Renew uses dedicated DAP, Rx, PCP, and patient-handout prompts)."
        breadcrumbs={[
          { label: 'Super Admin', href: '/super-admin' },
          { label: 'Assist System' },
        ]}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setResetAllOpen(true)}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Reset all
            </Button>
            <Button
              size="sm"
              disabled={dirtyCount === 0 || apply.isPending}
              onClick={handleApplyAll}
            >
              {apply.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-1.5 h-3.5 w-3.5" />
              )}
              Apply{dirtyCount > 0 ? ` (${dirtyCount})` : ''}
            </Button>
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatusChip
          label="Provider API key"
          ok={data.meta.openaiApiKeyConfigured}
          detail={data.meta.openaiApiKeyMasked ?? 'Not set in env'}
        />
        <StatusChip
          label="Assist Engine"
          ok={data.meta.aiEngineConfigured}
          detail={data.meta.aiEngineUrl ?? 'Assist engine URL not set'}
        />
        <StatusChip
          label="Active models"
          ok
          detail={`${getOpenAiChatModel(data.settings.openaiModel)?.label ?? data.settings.openaiModel} · ${getOpenAiChatModel(data.settings.openaiFastModel)?.label ?? data.settings.openaiFastModel}`}
        />
        <StatusChip
          label="Prompts"
          ok
          detail={`${prompts.length} system prompts · ${prompts.filter((p) => p.isModified).length} customized`}
        />
      </div>

      <Tabs defaultValue="prompts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="prompts" className="gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            System prompts
          </TabsTrigger>
          <TabsTrigger value="settings" className="gap-1.5">
            <Settings2 className="h-3.5 w-3.5" />
            Provider settings
            {settingsDirty && (
              <span className="ml-1 h-1.5 w-1.5 rounded-full bg-primary" />
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="prompts" className="mt-0">
          <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
            <div className="flex max-h-[calc(100vh-280px)] flex-col overflow-hidden rounded-xl border border-border bg-card">
              <div className="border-b border-border p-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search prompts…"
                    className="h-9 pl-8"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2">
                {filtered.length === 0 ? (
                  <EmptyState title="No prompts match" description="Try a different search." />
                ) : (
                  grouped.map(([category, items]) => (
                    <div key={category} className="mb-3">
                      <p className="mb-1.5 px-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {CATEGORY_LABELS[category] ?? category}
                      </p>
                      <div className="space-y-0.5">
                        {items.map((p) => {
                          const dirty = (drafts[p.key] ?? p.content) !== p.content;
                          const active = p.key === selectedKey;
                          return (
                            <button
                              key={p.key}
                              type="button"
                              onClick={() => setSelectedKey(p.key)}
                              className={cn(
                                'w-full rounded-lg px-2.5 py-2 text-left transition-colors',
                                active
                                  ? 'bg-primary/10 text-foreground'
                                  : 'hover:bg-muted/70 text-foreground/90',
                              )}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <span className="text-sm font-medium leading-snug">{p.name}</span>
                                <div className="flex shrink-0 items-center gap-1">
                                  {dirty && (
                                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                  )}
                                          {p.isModified && !dirty && (
                                    <Badge variant="default" className="h-5 px-1.5 text-[10px]">
                                      Custom
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              <p className="mt-0.5 truncate font-mono text-[10px] text-muted-foreground">
                                {category === 'documentation'
                                  ? documentationPromptSubtitle(p.key)
                                  : p.key}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex min-h-[520px] flex-col overflow-hidden rounded-xl border border-border bg-card">
              {selected ? (
                <>
                  <div className="border-b border-border px-5 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-lg font-semibold tracking-tight">{selected.name}</h2>
                        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                          {selected.description}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          <Badge variant="outline" className="font-mono text-[10px]">
                            {selected.key}
                          </Badge>
                          {selected.modelHint && (
                            <Badge variant="default" className="text-[10px]">
                              Model hint: {selected.modelHint}
                            </Badge>
                          )}
                          {selected.isModified ? (
                            <Badge variant="default" className="text-[10px]">
                              Customized
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">
                              Code default
                            </Badge>
                          )}
                          {selected.sourceFile && (
                            <Badge variant="outline" className="max-w-[280px] truncate text-[10px]">
                              {selected.sourceFile}
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={resetOne.isPending}
                          onClick={handleResetSelected}
                        >
                          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                          Reset
                        </Button>
                        <Button
                          size="sm"
                          disabled={!selectedDirty || apply.isPending}
                          onClick={handleApplySelected}
                        >
                          {apply.isPending ? (
                            <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Check className="mr-1.5 h-3.5 w-3.5" />
                          )}
                          Apply
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-1 flex-col p-5">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <Label htmlFor="prompt-editor" className="text-xs text-muted-foreground">
                        {showDefault ? 'Code-level default (read-only)' : 'System prompt (editable)'}
                      </Label>
                      <button
                        type="button"
                        onClick={() => setShowDefault((v) => !v)}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        {showDefault ? 'Back to editor' : 'View code default'}
                      </button>
                    </div>
                    <Textarea
                      id="prompt-editor"
                      value={showDefault ? selected.defaultContent : draftContent}
                      readOnly={showDefault}
                      onChange={(e) =>
                        setDrafts((prev) => ({ ...prev, [selected.key]: e.target.value }))
                      }
                      className="min-h-[420px] flex-1 resize-y font-mono text-[13px] leading-relaxed"
                      spellCheck={false}
                    />
                    <p className="mt-2 text-xs text-muted-foreground">
                      {(showDefault ? selected.defaultContent : draftContent).length.toLocaleString()} characters
                      {selectedDirty && !showDefault ? ' · unsaved changes' : ''}
                      {selected.isModified && !selectedDirty ? ' · differs from code default' : ''}
                    </p>
                  </div>
                </>
              ) : (
                <div className="flex flex-1 items-center justify-center p-8">
                  <EmptyState
                    title="Select a prompt"
                    description="Choose a system prompt from the list to edit."
                  />
                </div>
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="settings" className="mt-0">
          {settingsDraft && (
            <div className="max-w-2xl space-y-6 rounded-xl border border-border bg-card p-6">
              <div className="flex items-start gap-3 rounded-lg border border-border/80 bg-muted/30 p-3">
                <Bot className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <p className="text-sm text-muted-foreground">
                  Choose GPT-5.6 Terra (default), Luna, or Sol for primary and fast workloads.
                  Changes apply immediately on Apply and sync to the Assist Engine. The provider API key
                  stays in environment variables ({data.meta.openaiApiKeyMasked ?? 'not configured'}).
                </p>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <ModelSelectField
                  label="Primary model"
                  value={settingsDraft.openaiModel}
                  role="primary"
                  onChange={(v) => setSettingsDraft({ ...settingsDraft, openaiModel: v })}
                  envDefault={data.meta.envDefaults.openaiModel || DEFAULT_OPENAI_MODEL}
                  apiOptions={data.meta.availableModels}
                />
                <ModelSelectField
                  label="Fast model"
                  value={settingsDraft.openaiFastModel}
                  role="fast"
                  onChange={(v) => setSettingsDraft({ ...settingsDraft, openaiFastModel: v })}
                  envDefault={data.meta.envDefaults.openaiFastModel || DEFAULT_OPENAI_FAST_MODEL}
                  apiOptions={data.meta.availableModels}
                />
                <Field
                  label="Embedding model"
                  value={settingsDraft.openaiEmbeddingModel}
                  onChange={(v) =>
                    setSettingsDraft({ ...settingsDraft, openaiEmbeddingModel: v })
                  }
                />
                <Field
                  label="Default temperature"
                  type="number"
                  value={String(settingsDraft.temperatureDefault)}
                  onChange={(v) =>
                    setSettingsDraft({
                      ...settingsDraft,
                      temperatureDefault: Number(v) || 0,
                    })
                  }
                  hint="0–2"
                />
                <Field
                  label="Max retries"
                  type="number"
                  value={String(settingsDraft.maxRetries)}
                  onChange={(v) =>
                    setSettingsDraft({
                      ...settingsDraft,
                      maxRetries: Number(v) || 0,
                    })
                  }
                />
                <Field
                  label="Timeout (seconds)"
                  type="number"
                  value={String(settingsDraft.timeoutSeconds)}
                  onChange={(v) =>
                    setSettingsDraft({
                      ...settingsDraft,
                      timeoutSeconds: Number(v) || 90,
                    })
                  }
                />
              </div>

              <div className="flex justify-end">
                <Button
                  disabled={!settingsDirty || apply.isPending}
                  onClick={async () => {
                    try {
                      const result = await apply.mutateAsync({
                        settings: {
                          openaiModel: settingsDraft.openaiModel,
                          openaiFastModel: settingsDraft.openaiFastModel,
                          openaiEmbeddingModel: settingsDraft.openaiEmbeddingModel,
                          temperatureDefault: settingsDraft.temperatureDefault,
                          maxRetries: settingsDraft.maxRetries,
                          timeoutSeconds: settingsDraft.timeoutSeconds,
                        },
                      });
                      toast.success(result.message, {
                        description: result.aiEngineSynced
                          ? 'Synced to Assist Engine'
                          : result.aiEngineMessage,
                      });
                    } catch (err) {
                      const msg =
                        err && typeof err === 'object' && 'message' in err
                          ? Array.isArray((err as { message: unknown }).message)
                            ? (err as { message: string[] }).message.join(', ')
                            : String((err as { message: unknown }).message)
                          : 'Failed to apply settings';
                      toast.error(msg);
                    }
                  }}
                >
                  {apply.isPending ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  Apply settings
                </Button>
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {dirtyCount > 0 && (
        <div className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-full border border-border bg-background/95 px-4 py-2 shadow-lg backdrop-blur">
          <AlertCircle className="h-4 w-4 text-amber-500" />
          <span className="text-sm">
            {dirtyCount} unsaved change{dirtyCount === 1 ? '' : 's'}
          </span>
          <Button size="sm" disabled={apply.isPending} onClick={handleApplyAll}>
            Apply now
          </Button>
        </div>
      )}

      <ConfirmDialog
        open={resetAllOpen}
        onOpenChange={setResetAllOpen}
        title="Reset all assist configuration?"
        description="This restores every system prompt and provider setting to the built-in defaults. Custom edits will be lost."
        confirmLabel="Reset all"
        variant="destructive"
        loading={resetAll.isPending}
        onConfirm={handleResetAll}
      />
    </div>
  );
}

function StatusChip({
  label,
  ok,
  detail,
}: {
  label: string;
  ok: boolean;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex items-center gap-2">
        <span
          className={cn('h-2 w-2 rounded-full', ok ? 'bg-emerald-500' : 'bg-amber-500')}
        />
        <p className="text-sm font-medium">{label}</p>
      </div>
      <p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  hint,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  type?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <Input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function documentationPromptSubtitle(key: string): string {
  if (key.startsWith('RENEW_DOCUMENTATION_')) {
    return `Step 4 Renew · ${key.replace('RENEW_DOCUMENTATION_', '')}`;
  }
  if (key.startsWith('DOCUMENTATION_')) {
    return `Step 6 · ${key.replace('DOCUMENTATION_', '')}`;
  }
  return key;
}

function ModelSelectField({
  label,
  value,
  role,
  onChange,
  envDefault,
  apiOptions,
}: {
  label: string;
  value: string;
  role: 'primary' | 'fast';
  onChange: (v: string) => void;
  envDefault: string;
  apiOptions?: Array<{ id: string; label: string; description: string }>;
}) {
  const options = (() => {
    if (apiOptions?.length) {
      const ranked = [...apiOptions];
      ranked.sort((a, b) => {
        const aMeta = getOpenAiChatModel(a.id);
        const bMeta = getOpenAiChatModel(b.id);
        const score = (m: typeof aMeta) =>
          m?.roles.includes(role) && !m.legacy ? 0 : m?.legacy ? 2 : 1;
        return score(aMeta) - score(bMeta);
      });
      return ranked.map((m) => ({ value: m.id, label: m.label }));
    }
    return openAiModelSelectOptions(role);
  })();

  // Keep a currently saved custom/unknown id selectable so Apply doesn't wipe it
  const selectOptions =
    value && !options.some((o) => o.value === value)
      ? [{ value, label: `${value} (current)` }, ...options]
      : options;

  const selectedMeta =
    apiOptions?.find((m) => m.id === value) ?? getOpenAiChatModel(value);

  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      <Select
        options={selectOptions}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={label}
      />
      <p className="text-[11px] text-muted-foreground">
        {selectedMeta?.description ? `${selectedMeta.description}. ` : null}
        Env default: {envDefault}
      </p>
    </div>
  );
}
