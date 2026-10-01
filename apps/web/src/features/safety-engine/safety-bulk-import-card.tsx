'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Loader2,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { toast } from '@/lib/notify';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useImportCommitBatch, useImportPreviewBatch } from './hooks';
import type {
  ImportBatchPreviewResponse,
  ImportCommitCounts,
  ImportValidationError,
} from './types';

const ACCEPTED_EXTS = ['.xlsx', '.xls', '.csv'] as const;
const MAX_FILES = 6;
const MAX_FILE_BYTES = 10 * 1024 * 1024;

type QueuedFile = {
  id: string;
  file: File;
};

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function summarizeCounts(c: ImportCommitCounts) {
  return [
    c.rulesCreated && `${c.rulesCreated} allergy`,
    c.labRulesCreated && `${c.labRulesCreated} lab`,
    c.ddiRulesCreated && `${c.ddiRulesCreated} DDI`,
    c.pregnancyRulesCreated && `${c.pregnancyRulesCreated} pregnancy`,
    c.lactationRulesCreated && `${c.lactationRulesCreated} lactation`,
    c.renalRulesCreated && `${c.renalRulesCreated} renal`,
    c.taxonomyClassesCreated && `${c.taxonomyClassesCreated} classes`,
    c.catalogDrugsCreated && `${c.catalogDrugsCreated} drugs`,
    c.ingredientsCreated && `${c.ingredientsCreated} ingredients`,
    c.classesCreated && `${c.classesCreated} memberships`,
  ]
    .filter(Boolean)
    .join(', ');
}

function ValidationErrors({ errors }: { errors: ImportValidationError[] }) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 space-y-2 max-h-56 overflow-y-auto">
      <p className="text-sm font-semibold text-destructive">Validation errors</p>
      {errors.slice(0, 40).map((error, index) => (
        <div
          key={`${error.fileName}-${error.sheet}-${error.row}-${index}`}
          className="text-xs text-foreground/90 border-b border-border/40 pb-2 last:border-0"
        >
          <p className="font-medium">
            {error.fileName ? `${error.fileName} · ` : ''}
            {error.row ? `Row ${error.row}` : error.sheet}
          </p>
          <p>{error.message}</p>
          <p className="text-muted-foreground">Sheet: {error.sheet}</p>
        </div>
      ))}
      {errors.length > 40 && (
        <p className="text-xs text-muted-foreground">…and {errors.length - 40} more</p>
      )}
    </div>
  );
}

export function SafetyBulkImportCard() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [preview, setPreview] = useState<ImportBatchPreviewResponse | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);

  const previewBatch = useImportPreviewBatch();
  const commitBatch = useImportCommitBatch();

  const busy = previewBatch.isPending || commitBatch.isPending;
  const totalBytes = useMemo(
    () => queue.reduce((sum, item) => sum + item.file.size, 0),
    [queue],
  );

  const previewByName = useMemo(() => {
    const map = new Map<string, ImportBatchPreviewResponse['files'][number]>();
    for (const file of preview?.files ?? []) map.set(file.fileName, file);
    return map;
  }, [preview]);

  const addFiles = useCallback((incoming: FileList | File[]) => {
    const list = Array.from(incoming);
    if (!list.length) return;

    setPreview(null);
    setQueue((prev) => {
      const next = [...prev];
      const existing = new Set(next.map((q) => q.file.name.toLowerCase()));
      let rejectedType = 0;
      let rejectedSize = 0;
      let rejectedDup = 0;
      let rejectedCap = 0;

      for (const file of list) {
        if (next.length >= MAX_FILES) {
          rejectedCap += 1;
          continue;
        }
        const ext = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`;
        if (!ACCEPTED_EXTS.includes(ext as (typeof ACCEPTED_EXTS)[number])) {
          rejectedType += 1;
          continue;
        }
        if (file.size > MAX_FILE_BYTES) {
          rejectedSize += 1;
          continue;
        }
        const key = file.name.toLowerCase();
        if (existing.has(key)) {
          rejectedDup += 1;
          continue;
        }
        existing.add(key);
        next.push({
          id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
          file,
        });
      }

      if (rejectedCap) toast.error(`Maximum ${MAX_FILES} files per multi-import.`);
      if (rejectedType) toast.error('Only .csv, .xlsx, and .xls files are supported.');
      if (rejectedSize) toast.error('Each file must be 10 MB or smaller.');
      if (rejectedDup) toast.message('Skipped duplicate file names.');

      return next;
    });
  }, []);

  const removeFile = (id: string) => {
    setQueue((prev) => prev.filter((q) => q.id !== id));
    setPreview(null);
  };

  const clearQueue = () => {
    setQueue([]);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const runWithProgress = async <T,>(label: string, work: () => Promise<T>): Promise<T> => {
    setBusyLabel(label);
    setUploadProgress(12);
    const timer = window.setInterval(() => {
      setUploadProgress((p) => (p == null || p >= 90 ? p : p + 6));
    }, 280);
    try {
      const result = await work();
      setUploadProgress(100);
      return result;
    } finally {
      window.clearInterval(timer);
      window.setTimeout(() => {
        setUploadProgress(null);
        setBusyLabel(null);
      }, 450);
    }
  };

  const handlePreview = async () => {
    if (!queue.length) {
      toast.error('Select at least one file to preview.');
      return;
    }
    try {
      const result = await runWithProgress('Validating files…', () =>
        previewBatch.mutateAsync(queue.map((q) => q.file)),
      );
      setPreview(result);
      if (result.valid) {
        toast.success(
          `Preview OK — ${result.validFileCount} file${result.validFileCount === 1 ? '' : 's'} ready to import.`,
        );
      } else {
        toast.error(
          `${result.fileCount - result.validFileCount} of ${result.fileCount} file(s) have validation errors.`,
        );
      }
    } catch (error: unknown) {
      const apiError = error as { message?: string; errors?: ImportValidationError[] };
      if (apiError.errors?.length) {
        setPreview({
          valid: false,
          fileCount: queue.length,
          validFileCount: 0,
          files: [],
          errors: apiError.errors,
        });
      }
      toast.error(
        typeof apiError.message === 'string' ? apiError.message : 'Preview failed.',
      );
    }
  };

  const handleImport = async () => {
    if (!queue.length) {
      toast.error('Select at least one file to import.');
      return;
    }

    // Re-validate when user skipped preview or queue changed
    if (!preview || preview.fileCount !== queue.length) {
      try {
        const result = await runWithProgress('Validating before import…', () =>
          previewBatch.mutateAsync(queue.map((q) => q.file)),
        );
        setPreview(result);
        if (!result.valid) {
          toast.error('Fix validation errors before importing. Invalid files will be skipped.');
        }
      } catch (error: unknown) {
        const apiError = error as { message?: string };
        toast.error(
          typeof apiError.message === 'string' ? apiError.message : 'Validation failed.',
        );
        return;
      }
    }

    try {
      const result = await runWithProgress('Importing files…', () =>
        commitBatch.mutateAsync(queue.map((q) => q.file)),
      );

      const summary = summarizeCounts(result.totals);
      if (result.importedCount && !result.failedCount) {
        toast.success(
          `Imported ${result.importedCount} file${result.importedCount === 1 ? '' : 's'}${summary ? `: ${summary}` : ''}.`,
        );
        clearQueue();
      } else if (result.importedCount && result.failedCount) {
        toast.message(
          `Imported ${result.importedCount}, failed ${result.failedCount}${summary ? ` · ${summary}` : ''}.`,
        );
        setPreview({
          valid: false,
          fileCount: result.fileCount,
          validFileCount: result.importedCount,
          files: result.files.map((f) => ({
            fileName: f.fileName,
            valid: f.status === 'imported',
            errorCount: f.errorCount,
            validRowCount: 0,
            errors: f.errors,
          })),
          errors: result.files.flatMap((f) => f.errors),
        });
      } else {
        toast.error('No files were imported. Check validation errors.');
        setPreview({
          valid: false,
          fileCount: result.fileCount,
          validFileCount: 0,
          files: result.files.map((f) => ({
            fileName: f.fileName,
            valid: false,
            errorCount: f.errorCount,
            validRowCount: 0,
            errors: f.errors,
          })),
          errors: result.files.flatMap((f) => f.errors),
        });
      }
    } catch (error: unknown) {
      const apiError = error as { message?: string; errors?: ImportValidationError[] };
      if (apiError.errors?.length) {
        setPreview({
          valid: false,
          fileCount: queue.length,
          validFileCount: 0,
          files: [],
          errors: apiError.errors,
        });
      }
      toast.error(
        typeof apiError.message === 'string' ? apiError.message : 'Multi-import failed.',
      );
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      const blob = await api.download('/admin/medication-safety/import/template');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'safety-rules-template.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Could not download template.');
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <FileSpreadsheet className="h-4 w-4 text-primary" />
          Bulk Import
          <Badge variant="outline" className="ml-auto text-[10px] font-normal">
            Up to {MAX_FILES} files
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div
          className={cn(
            'rounded-xl border-2 border-dashed p-4 text-center transition-colors',
            dragOver ? 'border-primary bg-primary/5' : 'border-border',
            busy && 'opacity-70 pointer-events-none',
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
          }}
        >
          <Upload className="mx-auto h-6 w-6 text-muted-foreground mb-2" />
          <p className="text-xs text-muted-foreground mb-1">
            Drop up to {MAX_FILES} CSV/Excel files, or choose files
          </p>
          <p className="text-[11px] text-muted-foreground/80 mb-3">
            Valid files import even if another file fails · 10 MB each
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            <Button
              size="sm"
              variant="outline"
              onClick={() => inputRef.current?.click()}
              disabled={busy || queue.length >= MAX_FILES}
            >
              <Upload className="h-3.5 w-3.5 mr-1" />
              Select files
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void handlePreview()}
              disabled={busy || !queue.length}
            >
              {previewBatch.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
              )}
              Preview all
            </Button>
            <Button
              size="sm"
              onClick={() => void handleImport()}
              disabled={busy || !queue.length}
            >
              {commitBatch.isPending ? (
                <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
              ) : (
                <FileSpreadsheet className="h-3.5 w-3.5 mr-1" />
              )}
              Import all
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void handleDownloadTemplate()}
              disabled={busy}
            >
              <Download className="h-3.5 w-3.5 mr-1" /> Template
            </Button>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) addFiles(e.target.files);
              e.target.value = '';
            }}
          />
        </div>

        {queue.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-medium text-muted-foreground">
                {queue.length}/{MAX_FILES} selected · {formatBytes(totalBytes)}
              </p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={clearQueue}
                disabled={busy}
              >
                Clear
              </Button>
            </div>
            <ul className="space-y-1.5 max-h-48 overflow-y-auto">
              {queue.map((item, index) => {
                const status = previewByName.get(item.file.name);
                return (
                  <li
                    key={item.id}
                    className="flex items-start gap-2 rounded-lg border border-border/70 bg-muted/20 px-2.5 py-2"
                  >
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-semibold text-muted-foreground">
                      {index + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-foreground">
                        {item.file.name}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatBytes(item.file.size)}
                        {status
                          ? status.valid
                            ? ` · ${status.validRowCount} valid rows`
                            : ` · ${status.errorCount} error${status.errorCount === 1 ? '' : 's'}`
                          : ''}
                      </p>
                    </div>
                    {status ? (
                      status.valid ? (
                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">
                          Ready
                        </Badge>
                      ) : (
                        <Badge className="bg-red-100 text-red-700 hover:bg-red-100 gap-1">
                          <AlertTriangle className="h-3 w-3" /> Errors
                        </Badge>
                      )
                    ) : null}
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 shrink-0"
                      onClick={() => removeFile(item.id)}
                      disabled={busy}
                      title="Remove"
                    >
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {uploadProgress != null && (
          <div className="space-y-1">
            {busyLabel && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" />
                {busyLabel}
              </p>
            )}
            <Progress value={uploadProgress} className="h-1.5" />
          </div>
        )}

        {preview && !preview.valid && preview.errors.length > 0 && (
          <ValidationErrors errors={preview.errors} />
        )}

        {preview?.valid && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900 flex items-start gap-2">
            <CheckCircle2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <p>
              All {preview.fileCount} file{preview.fileCount === 1 ? '' : 's'} validated.
              Click <span className="font-medium">Import all</span> to commit draft rules.
            </p>
          </div>
        )}

        {queue.length === 0 && (
          <p className="text-[11px] text-muted-foreground flex items-start gap-1.5">
            <Trash2 className="h-3 w-3 mt-0.5 shrink-0 opacity-60" />
            Tip: split large workbooks by domain (allergy, DDI, pregnancy, renal, catalog) and
            import them together in one multi-import.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
