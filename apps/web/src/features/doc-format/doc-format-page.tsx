'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Eye,
  FileDown,
  FileText,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { toast } from '@/lib/notify';
import { PageHeader } from '@/components/shared/page-header';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState, ErrorState } from '@/components/shared/states';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { renderPdfFromLayout } from '@/features/consultations/documents/pdf-layout-renderer';
import {
  emptySchemaField,
  emptySection,
  PDF_SECTION_TYPE_OPTIONS,
  type PdfLayoutSection,
  type PdfSectionType,
  type ResponseFieldType,
} from '@/features/consultations/documents/pdf-layout-types';
import type { PdfContext } from '@/features/consultations/documents/types';
import {
  useApplyDocFormats,
  useDocFormatCatalog,
  usePreviewDocFormat,
  useResetAllDocFormats,
  useResetDocFormat,
} from './hooks';
import {
  CATEGORY_LABELS,
  draftsEqual,
  toDraft,
  type DocFormatDraft,
  type DocFormatItem,
} from './types';

const SAMPLE_CTX: PdfContext = {
  consultationRef: 'DEMO-001',
  consultationDate: '17 July 2026',
  pharmacistName: 'Jane Pharmacist',
  pharmacistCredentials: 'RPh',
  pathwayName: 'Urinary Tract Infection',
  tenantName: 'SafeScribe Demo Pharmacy',
  pharmacyPhone: '(555) 010-2000',
  pharmacyEmail: 'pharmacy@example.com',
  patientInfo: {
    name: 'Alex Patient',
    dateOfBirth: '1990-04-12',
    patientId: 'PHN-123456',
    age: '36',
    sex: 'F',
  },
};

export function DocFormatPage() {
  const { data, isLoading, isError, refetch } = useDocFormatCatalog();
  const apply = useApplyDocFormats();
  const resetOne = useResetDocFormat();
  const resetAll = useResetAllDocFormats();
  const previewMut = usePreviewDocFormat();

  const [search, setSearch] = useState('');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DocFormatDraft>>({});
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);
  const [resetAllOpen, setResetAllOpen] = useState(false);
  const [editorTab, setEditorTab] = useState('prompt');

  useEffect(() => {
    if (!data) return;
    setDrafts(Object.fromEntries(data.formats.map((f) => [f.key, toDraft(f)])));
    setSelectedKey((prev) => prev ?? data.formats[0]?.key ?? null);
  }, [data]);

  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
    };
  }, [pdfPreviewUrl]);

  const formats = data?.formats ?? [];
  const selected = formats.find((f) => f.key === selectedKey) ?? null;
  const draft = selected ? drafts[selected.key] : null;
  const baseline = selected ? toDraft(selected) : null;

  const dirtyKeys = useMemo(() => {
    if (!data) return [];
    return data.formats
      .filter((f) => {
        const d = drafts[f.key];
        if (!d) return false;
        return !draftsEqual(d, toDraft(f));
      })
      .map((f) => f.key);
  }, [data, drafts]);

  const selectedDirty =
    selected && draft && baseline ? !draftsEqual(draft, baseline) : false;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return formats;
    return formats.filter(
      (f) =>
        f.name.toLowerCase().includes(q) ||
        f.key.toLowerCase().includes(q) ||
        f.description.toLowerCase().includes(q) ||
        f.category.toLowerCase().includes(q),
    );
  }, [formats, search]);

  const grouped = useMemo(() => {
    const map = new Map<string, DocFormatItem[]>();
    for (const f of filtered) {
      const list = map.get(f.category) ?? [];
      list.push(f);
      map.set(f.category, list);
    }
    return map;
  }, [filtered]);

  const updateDraft = (key: string, patch: Partial<DocFormatDraft>) => {
    setDrafts((prev) => ({
      ...prev,
      [key]: { ...prev[key], ...patch },
    }));
  };

  const handlePublish = async () => {
    if (!data || dirtyKeys.length === 0) return;
    try {
      const result = await apply.mutateAsync({
        formats: dirtyKeys.map((key) => {
          const d = drafts[key];
          return {
            key,
            name: d.name,
            shortName: d.shortName,
            description: d.description,
            categoryLabel: d.categoryLabel,
            bullets: d.bulletsText
              .split('\n')
              .map((b) => b.trim())
              .filter(Boolean),
            fileName: d.fileName,
            aiPrompt: d.aiPrompt,
            styleNotes: d.styleNotes,
            exampleOutput: d.exampleOutput,
            pdfLayout: d.pdfLayout,
            responseSchema: d.responseSchema,
            published: d.published,
          };
        }),
      });
      toast.success(result.message);
    } catch (err) {
      const msg =
        err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : 'Failed to publish document download formats';
      toast.error(msg);
    }
  };

  const handleResetOne = async () => {
    if (!selected) return;
    try {
      const result = await resetOne.mutateAsync(selected.key);
      toast.success(result.message);
      setPdfPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    } catch {
      toast.error('Failed to reset format');
    }
  };

  const handleResetAll = async () => {
    try {
      const result = await resetAll.mutateAsync();
      toast.success(result.message);
      setResetAllOpen(false);
      setPdfPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
    } catch {
      toast.error('Failed to reset formats');
    }
  };

  const buildLivePdfPreview = (d: DocFormatDraft) => {
    let content: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(d.exampleOutput);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        content = parsed as Record<string, unknown>;
      }
    } catch {
      content = { content: d.exampleOutput };
    }

    const doc = new jsPDF({ unit: 'mm', format: 'a4' });
    if (d.pdfLayout.mode === 'sections') {
      renderPdfFromLayout(doc, d.pdfLayout, content, SAMPLE_CTX);
    } else {
      // Prescription mode — show title + notes from example for admin preview
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(16);
      doc.text(d.pdfLayout.title || 'Prescription', 18, 24);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.text(
        'Clinical Rx layout is fixed. Edit generation prompt + response schema to control medication content.',
        18,
        36,
        { maxWidth: 174 },
      );
      const notes =
        typeof content.notes === 'string'
          ? content.notes
          : typeof content.specialInstructions === 'string'
            ? content.specialInstructions
            : JSON.stringify(content, null, 2);
      doc.text(notes.slice(0, 1800), 18, 52, { maxWidth: 174 });
    }
    return doc.output('blob');
  };

  const handlePreviewPdf = async () => {
    if (!selected || !draft) return;
    try {
      await previewMut.mutateAsync({
        key: selected.key,
        aiPrompt: draft.aiPrompt,
        styleNotes: draft.styleNotes,
        exampleOutput: draft.exampleOutput,
        pdfLayout: draft.pdfLayout,
      });
      const blob = buildLivePdfPreview(draft);
      const url = URL.createObjectURL(blob);
      setPdfPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return url;
      });
      setEditorTab('preview');
    } catch {
      toast.error('Failed to build PDF preview');
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
        Loading document download formats…
      </div>
    );
  }

  if (isError) {
    return <ErrorState onRetry={() => void refetch()} />;
  }

  if (!formats.length) {
    return (
      <EmptyState
        title="No document download formats"
        description="Formats will appear after seeding."
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Doc Download Format"
        description="Edit generation prompts, response fields, and PDF download layout. Publish to apply instantly to pharmacist preview and download."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setResetAllOpen(true)}>
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Reset all
            </Button>
            <Button
              size="sm"
              disabled={dirtyKeys.length === 0 || apply.isPending}
              onClick={() => void handlePublish()}
            >
              {apply.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="mr-1.5 h-3.5 w-3.5" />
              )}
              Save & publish
              {dirtyKeys.length > 0 ? ` (${dirtyKeys.length})` : ''}
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-xl border bg-card">
          <div className="border-b p-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search formats…"
                className="pl-8"
              />
            </div>
          </div>
          <div className="max-h-[calc(100vh-240px)] space-y-4 overflow-y-auto p-3">
            {[...grouped.entries()].map(([category, items]) => (
              <div key={category}>
                <p className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {CATEGORY_LABELS[category] ?? category}
                </p>
                <div className="space-y-1">
                  {items.map((f) => {
                    const isDirty = dirtyKeys.includes(f.key);
                    const isActive = f.key === selectedKey;
                    return (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => {
                          setSelectedKey(f.key);
                          setPdfPreviewUrl((prev) => {
                            if (prev) URL.revokeObjectURL(prev);
                            return null;
                          });
                        }}
                        className={cn(
                          'flex w-full flex-col gap-0.5 rounded-lg px-2.5 py-2 text-left transition-colors',
                          isActive
                            ? 'bg-primary/10 text-foreground'
                            : 'hover:bg-muted/60 text-foreground',
                        )}
                      >
                        <div className="flex items-center gap-2">
                          <FileDown className="h-3.5 w-3.5 shrink-0 text-primary" />
                          <span className="truncate text-sm font-medium">{f.name}</span>
                        </div>
                        <div className="flex items-center gap-1.5 pl-5">
                          {f.isModified && (
                            <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
                              Custom
                            </Badge>
                          )}
                          {isDirty && (
                            <Badge className="h-5 bg-amber-100 px-1.5 text-[10px] text-amber-800 hover:bg-amber-100">
                              Unsaved
                            </Badge>
                          )}
                          {!f.published && (
                            <Badge variant="outline" className="h-5 px-1.5 text-[10px]">
                              Draft
                            </Badge>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </aside>

        <section className="min-w-0 rounded-xl border bg-card">
          {selected && draft ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
                <div>
                  <h2 className="text-lg font-semibold tracking-tight">{draft.name}</h2>
                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">{selected.key}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-2 rounded-lg border px-3 py-1.5">
                    <Switch
                      checked={draft.published}
                      onCheckedChange={(v) => updateDraft(selected.key, { published: v })}
                      id="published"
                    />
                    <Label htmlFor="published" className="text-xs font-medium">
                      Published
                    </Label>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={previewMut.isPending}
                    onClick={() => void handlePreviewPdf()}
                  >
                    {previewMut.isPending ? (
                      <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Eye className="mr-1.5 h-3.5 w-3.5" />
                    )}
                    Preview PDF
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={resetOne.isPending}
                    onClick={() => void handleResetOne()}
                  >
                    <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                    Reset
                  </Button>
                </div>
              </div>

              <Tabs value={editorTab} onValueChange={setEditorTab} className="px-5 py-4">
                <TabsList className="flex h-auto flex-wrap gap-1">
                  <TabsTrigger value="card">Card</TabsTrigger>
                  <TabsTrigger value="prompt">
                    <Sparkles className="mr-1 h-3.5 w-3.5" />
                    Generation prompt
                  </TabsTrigger>
                  <TabsTrigger value="schema">Response format</TabsTrigger>
                  <TabsTrigger value="pdf">PDF design</TabsTrigger>
                  <TabsTrigger value="preview">PDF preview</TabsTrigger>
                </TabsList>

                <TabsContent value="card" className="mt-4 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>Document name</Label>
                      <Input
                        value={draft.name}
                        onChange={(e) => updateDraft(selected.key, { name: e.target.value })}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Short name</Label>
                      <Input
                        value={draft.shortName}
                        onChange={(e) =>
                          updateDraft(selected.key, { shortName: e.target.value })
                        }
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Category label</Label>
                    <Input
                      value={draft.categoryLabel}
                      onChange={(e) =>
                        updateDraft(selected.key, { categoryLabel: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Card description</Label>
                    <Textarea
                      value={draft.description}
                      rows={3}
                      onChange={(e) =>
                        updateDraft(selected.key, { description: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Checklist bullets (one per line)</Label>
                    <Textarea
                      value={draft.bulletsText}
                      rows={4}
                      className="font-mono text-sm"
                      onChange={(e) =>
                        updateDraft(selected.key, { bulletsText: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>PDF file name</Label>
                    <Input
                      value={draft.fileName}
                      onChange={(e) => updateDraft(selected.key, { fileName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Content / style notes</Label>
                    <Textarea
                      value={draft.styleNotes}
                      rows={4}
                      placeholder="Tone, reading level, section emphasis…"
                      onChange={(e) =>
                        updateDraft(selected.key, { styleNotes: e.target.value })
                      }
                    />
                  </div>
                </TabsContent>

                <TabsContent value="prompt" className="mt-4 space-y-4">
                  <div className="space-y-1.5">
                    <Label>Generation prompt</Label>
                    <Textarea
                      value={draft.aiPrompt}
                      rows={16}
                      className="font-mono text-sm leading-relaxed"
                      onChange={(e) => updateDraft(selected.key, { aiPrompt: e.target.value })}
                    />
                    <p className="text-xs text-muted-foreground">
                      Controls how this document is written when pharmacists generate
                      documentation. Goes live after Save & publish.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Example output (JSON)</Label>
                    <Textarea
                      value={draft.exampleOutput}
                      rows={12}
                      className="font-mono text-xs leading-relaxed"
                      onChange={(e) =>
                        updateDraft(selected.key, { exampleOutput: e.target.value })
                      }
                    />
                    <p className="text-xs text-muted-foreground">
                      Used for Super Admin PDF preview. Keep fields aligned with Response
                      format and PDF design mappings.
                    </p>
                  </div>
                </TabsContent>

                <TabsContent value="schema" className="mt-4 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-muted-foreground">
                      Fields that must be returned for this PDF. Sent with generation requests.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        updateDraft(selected.key, {
                          responseSchema: {
                            fields: [...draft.responseSchema.fields, emptySchemaField()],
                          },
                        })
                      }
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" />
                      Add field
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {draft.responseSchema.fields.map((field, index) => (
                      <div
                        key={`${field.key}-${index}`}
                        className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_1fr_120px_auto]"
                      >
                        <div className="space-y-1">
                          <Label className="text-xs">Key</Label>
                          <Input
                            value={field.key}
                            className="font-mono text-sm"
                            onChange={(e) => {
                              const fields = [...draft.responseSchema.fields];
                              fields[index] = { ...field, key: e.target.value };
                              updateDraft(selected.key, {
                                responseSchema: { fields },
                              });
                            }}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Label</Label>
                          <Input
                            value={field.label}
                            onChange={(e) => {
                              const fields = [...draft.responseSchema.fields];
                              fields[index] = { ...field, label: e.target.value };
                              updateDraft(selected.key, {
                                responseSchema: { fields },
                              });
                            }}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Type</Label>
                          <Select
                            value={field.type}
                            options={[
                              { value: 'string', label: 'string' },
                              { value: 'array', label: 'array' },
                              { value: 'object', label: 'object' },
                            ]}
                            onChange={(e) => {
                              const fields = [...draft.responseSchema.fields];
                              fields[index] = {
                                ...field,
                                type: e.target.value as ResponseFieldType,
                              };
                              updateDraft(selected.key, {
                                responseSchema: { fields },
                              });
                            }}
                          />
                        </div>
                        <div className="flex items-end gap-2">
                          <label className="flex items-center gap-1.5 pb-2 text-xs">
                            <input
                              type="checkbox"
                              checked={!!field.required}
                              onChange={(e) => {
                                const fields = [...draft.responseSchema.fields];
                                fields[index] = {
                                  ...field,
                                  required: e.target.checked,
                                };
                                updateDraft(selected.key, {
                                  responseSchema: { fields },
                                });
                              }}
                            />
                            Required
                          </label>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 text-destructive"
                            onClick={() => {
                              const fields = draft.responseSchema.fields.filter(
                                (_, i) => i !== index,
                              );
                              updateDraft(selected.key, {
                                responseSchema: { fields },
                              });
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                        <div className="space-y-1 sm:col-span-4">
                          <Label className="text-xs">Description (optional)</Label>
                          <Input
                            value={field.description ?? ''}
                            placeholder="Guidance for generation about this field"
                            onChange={(e) => {
                              const fields = [...draft.responseSchema.fields];
                              fields[index] = {
                                ...field,
                                description: e.target.value,
                              };
                              updateDraft(selected.key, {
                                responseSchema: { fields },
                              });
                            }}
                          />
                        </div>
                      </div>
                    ))}
                    {!draft.responseSchema.fields.length && (
                      <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                        No response fields yet. Add fields that should be returned.
                      </p>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="pdf" className="mt-4 space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label>PDF title</Label>
                      <Input
                        value={draft.pdfLayout.title}
                        onChange={(e) =>
                          updateDraft(selected.key, {
                            pdfLayout: { ...draft.pdfLayout, title: e.target.value },
                          })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>Layout mode</Label>
                      <Select
                        value={draft.pdfLayout.mode}
                        options={[
                          { value: 'sections', label: 'Sections (editable)' },
                          { value: 'prescription', label: 'Prescription (clinical Rx)' },
                        ]}
                        onChange={(e) =>
                          updateDraft(selected.key, {
                            pdfLayout: {
                              ...draft.pdfLayout,
                              mode: e.target.value as 'sections' | 'prescription',
                            },
                          })
                        }
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-sm">
                      <Switch
                        checked={draft.pdfLayout.showPatientHeader !== false}
                        onCheckedChange={(v) =>
                          updateDraft(selected.key, {
                            pdfLayout: { ...draft.pdfLayout, showPatientHeader: v },
                          })
                        }
                      />
                      Patient header
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <Switch
                        checked={draft.pdfLayout.showPageFooter !== false}
                        onCheckedChange={(v) =>
                          updateDraft(selected.key, {
                            pdfLayout: { ...draft.pdfLayout, showPageFooter: v },
                          })
                        }
                      />
                      Page footer
                    </label>
                  </div>

                  {draft.pdfLayout.mode === 'prescription' ? (
                    <p className="rounded-lg border bg-muted/40 p-4 text-sm text-muted-foreground">
                      Prescription PDFs use the clinical Rx grid. Control content via generation prompt
                      and response format (medications array). Section editor is for
                      section-mode documents.
                    </p>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm text-muted-foreground">
                          Map PDF sections to response fields. Order = print order.
                        </p>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            updateDraft(selected.key, {
                              pdfLayout: {
                                ...draft.pdfLayout,
                                sections: [...draft.pdfLayout.sections, emptySection('heading')],
                              },
                            })
                          }
                        >
                          <Plus className="mr-1.5 h-3.5 w-3.5" />
                          Add section
                        </Button>
                      </div>
                      <div className="space-y-2">
                        {draft.pdfLayout.sections.map((section, index) => (
                          <SectionEditor
                            key={section.id}
                            section={section}
                            index={index}
                            total={draft.pdfLayout.sections.length}
                            onChange={(next) => {
                              const sections = [...draft.pdfLayout.sections];
                              sections[index] = next;
                              updateDraft(selected.key, {
                                pdfLayout: { ...draft.pdfLayout, sections },
                              });
                            }}
                            onMove={(dir) => {
                              const sections = [...draft.pdfLayout.sections];
                              const target = index + dir;
                              if (target < 0 || target >= sections.length) return;
                              [sections[index], sections[target]] = [
                                sections[target],
                                sections[index],
                              ];
                              updateDraft(selected.key, {
                                pdfLayout: { ...draft.pdfLayout, sections },
                              });
                            }}
                            onRemove={() => {
                              const sections = draft.pdfLayout.sections.filter(
                                (_, i) => i !== index,
                              );
                              updateDraft(selected.key, {
                                pdfLayout: { ...draft.pdfLayout, sections },
                              });
                            }}
                          />
                        ))}
                        {!draft.pdfLayout.sections.length && (
                          <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                            No PDF sections. Add headings and fields to design the download.
                          </p>
                        )}
                      </div>
                    </>
                  )}
                </TabsContent>

                <TabsContent value="preview" className="mt-4 space-y-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-muted-foreground">
                      Live PDF from current draft layout + example output (same engine as
                      pharmacist download).
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={previewMut.isPending}
                      onClick={() => void handlePreviewPdf()}
                    >
                      {previewMut.isPending ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Eye className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Refresh PDF
                    </Button>
                  </div>

                  <div className="rounded-xl border bg-background p-4">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {draft.categoryLabel}
                    </p>
                    <div className="flex gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <FileText className="h-5 w-5 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="font-semibold">{draft.name}</h3>
                          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">
                            <Check className="mr-1 h-3 w-3" />
                            Download format
                          </Badge>
                        </div>
                        <p className="mt-1 text-sm text-muted-foreground">{draft.description}</p>
                      </div>
                    </div>
                  </div>

                  <div className="overflow-hidden rounded-xl border bg-muted/30">
                    {pdfPreviewUrl ? (
                      <iframe
                        src={pdfPreviewUrl}
                        className="h-[70vh] w-full border-0"
                        title={`${draft.name} PDF preview`}
                      />
                    ) : (
                      <div className="flex h-64 flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
                        <FileDown className="h-8 w-8 opacity-40" />
                        Click Preview PDF to render the download layout.
                      </div>
                    )}
                  </div>
                </TabsContent>
              </Tabs>

              {selectedDirty && (
                <div className="border-t bg-amber-50 px-5 py-2.5 text-xs text-amber-900">
                  Unsaved changes — Save & publish to update live preview/download and generation
                  generation.
                </div>
              )}
            </>
          ) : (
            <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
              Select a document download format to edit
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={resetAllOpen}
        onOpenChange={setResetAllOpen}
        title="Reset all document download formats?"
        description="This restores every format’s card, generation prompt, response schema, PDF layout, and examples to platform defaults."
        confirmLabel="Reset all"
        onConfirm={() => void handleResetAll()}
        loading={resetAll.isPending}
        variant="destructive"
      />
    </div>
  );
}

function SectionEditor({
  section,
  index,
  total,
  onChange,
  onMove,
  onRemove,
}: {
  section: PdfLayoutSection;
  index: number;
  total: number;
  onChange: (s: PdfLayoutSection) => void;
  onMove: (dir: -1 | 1) => void;
  onRemove: () => void;
}) {
  const needsField = section.type === 'field' || section.type === 'bullets';
  const needsLabel = section.type === 'heading' || section.type === 'subheading';
  const needsText = section.type === 'static';

  return (
    <div className="rounded-lg border p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted-foreground">Section {index + 1}</span>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={index === 0}
            onClick={() => onMove(-1)}
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            disabled={index >= total - 1}
            onClick={() => onMove(1)}
          >
            <ArrowDown className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive"
            onClick={onRemove}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs">Type</Label>
          <Select
            value={section.type}
            options={PDF_SECTION_TYPE_OPTIONS.map((o) => ({
              value: o.value,
              label: o.label,
            }))}
            onChange={(e) =>
              onChange({ ...section, type: e.target.value as PdfSectionType })
            }
          />
        </div>
        {needsLabel && (
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-xs">Label</Label>
            <Input
              value={section.label ?? ''}
              onChange={(e) => onChange({ ...section, label: e.target.value })}
            />
          </div>
        )}
        {needsField && (
          <>
            <div className="space-y-1">
              <Label className="text-xs">Field key</Label>
              <Input
                value={section.field ?? ''}
                className="font-mono text-sm"
                onChange={(e) => onChange({ ...section, field: e.target.value })}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-xs">Fallback text</Label>
              <Input
                value={section.fallback ?? ''}
                onChange={(e) => onChange({ ...section, fallback: e.target.value })}
              />
            </div>
            <label className="flex items-center gap-2 text-xs sm:col-span-3">
              <input
                type="checkbox"
                checked={!!section.showIfEmpty}
                onChange={(e) => onChange({ ...section, showIfEmpty: e.target.checked })}
              />
              Show even when empty
            </label>
          </>
        )}
        {needsText && (
          <div className="space-y-1 sm:col-span-3">
            <Label className="text-xs">Static text</Label>
            <Textarea
              rows={2}
              value={section.text ?? ''}
              onChange={(e) => onChange({ ...section, text: e.target.value })}
            />
          </div>
        )}
      </div>
    </div>
  );
}
