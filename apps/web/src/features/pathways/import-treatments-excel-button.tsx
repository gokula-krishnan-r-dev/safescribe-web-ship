'use client';

import { useRef, useState } from 'react';
import { FileSpreadsheet, Download, Upload, Loader2 } from 'lucide-react';
import { toast } from '@/lib/notify';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api } from '@/lib/api-client';
import {
  useImportTreatmentsExcel,
  usePreviewTreatmentsExcel,
} from './hooks';

const ACCEPTED = ['.xlsx', '.xls', '.csv'];

export function ImportTreatmentsExcelButton({
  pathwayId,
  canEdit,
}: {
  pathwayId: string;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<{
    valid: boolean;
    rowCount: number;
    errors: Array<{ row?: number; message: string }>;
  } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const previewMutation = usePreviewTreatmentsExcel(pathwayId);
  const importMutation = useImportTreatmentsExcel(pathwayId);

  if (!canEdit) return null;

  const reset = () => {
    setFile(null);
    setPreview(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleDownloadTemplate = async () => {
    try {
      const blob = await api.download(
        `/clinical-pathways/${pathwayId}/treatments/import/template`,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'pathway-treatments-template.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Could not download template.');
    }
  };

  const handlePick = async (picked: File | null) => {
    if (!picked) return;
    const ext = `.${picked.name.split('.').pop()?.toLowerCase() ?? ''}`;
    if (!ACCEPTED.includes(ext)) {
      toast.error('Please upload .xlsx, .xls, or .csv');
      return;
    }
    setFile(picked);
    setPreview(null);
    try {
      const result = await previewMutation.mutateAsync(picked);
      setPreview({
        valid: result.valid,
        rowCount: result.rowCount,
        errors: result.errors ?? [],
      });
      if (!result.valid) {
        toast.error('Import preview has validation errors.');
      }
    } catch (error: unknown) {
      const msg = (error as { message?: string }).message ?? 'Preview failed.';
      toast.error(typeof msg === 'string' ? msg : 'Preview failed.');
    }
  };

  const handleImport = async () => {
    if (!file || !preview?.valid) return;
    try {
      const result = await importMutation.mutateAsync(file);
      toast.success(
        `Imported ${result.created} treatment${result.created === 1 ? '' : 's'}. Review and approve before publishing.`,
      );
      setOpen(false);
      reset();
    } catch (error: unknown) {
      const apiError = error as {
        message?: string;
        errors?: Array<{ row?: number; message: string }>;
      };
      if (apiError.errors?.length) {
        setPreview({
          valid: false,
          rowCount: 0,
          errors: apiError.errors,
        });
      }
      toast.error(
        typeof apiError.message === 'string'
          ? apiError.message
          : 'Import failed.',
      );
    }
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-8 gap-1.5 text-[11px]"
        onClick={() => setOpen(true)}
      >
        <FileSpreadsheet className="h-3.5 w-3.5" />
        Excel import
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) reset();
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Import treatments from Excel</DialogTitle>
            <DialogDescription>
              Upload .xlsx / .csv with Yes/No warning flags and a reason sentence for
              each Yes. Download the template for the exact columns and sample rows.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={handleDownloadTemplate}
            >
              <Download className="h-3.5 w-3.5" />
              Download template
            </Button>

            <div className="rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-center">
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                className="hidden"
                onChange={(e) => handlePick(e.target.files?.[0] ?? null)}
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="gap-1.5"
                onClick={() => inputRef.current?.click()}
                disabled={previewMutation.isPending}
              >
                {previewMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Upload className="h-3.5 w-3.5" />
                )}
                Choose file
              </Button>
              {file && (
                <p className="mt-2 text-xs text-muted-foreground">{file.name}</p>
              )}
            </div>

            {preview && (
              <div
                className={
                  preview.valid
                    ? 'rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900'
                    : 'rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm'
                }
              >
                {preview.valid ? (
                  <p>
                    Ready to import <strong>{preview.rowCount}</strong> treatment
                    {preview.rowCount === 1 ? '' : 's'}.
                  </p>
                ) : (
                  <div className="space-y-1">
                    <p className="font-medium text-destructive">
                      Fix these issues before importing:
                    </p>
                    <ul className="max-h-40 list-disc space-y-0.5 overflow-y-auto pl-4 text-xs text-muted-foreground">
                      {preview.errors.slice(0, 20).map((err, i) => (
                        <li key={`${err.row}-${i}`}>
                          {err.row != null ? `Row ${err.row}: ` : ''}
                          {err.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleImport}
              disabled={!preview?.valid || importMutation.isPending}
            >
              {importMutation.isPending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : null}
              Import treatments
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
