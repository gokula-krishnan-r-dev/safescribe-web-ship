'use client';

import { useCallback, useRef, useState } from 'react';
import { toast } from '@/lib/notify';
import {
  Upload,
  FileText,
  CheckCircle2,
  XCircle,
  Loader2,
  X,
  FilePlus2,
  Brain,
  Sparkles,
  FileWarning,
  FileType2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useUploadDocuments } from './hooks';
import type { ClinicalDocument } from './types';
import { cn } from '@/lib/utils';

// ─── Constants ───────────────────────────────────────────────────────────────

const ACCEPTED_MIMES = new Set([
  'application/pdf',
  'application/x-pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
  'text/plain',
]);
const ACCEPTED_EXTS = ['.pdf', '.docx', '.doc', '.txt'];
const MAX_SIZE_MB = 20;
const MAX_FILES = 10;

const AI_STEPS = [
  { icon: '📄', label: 'Reading text from your guide' },
  { icon: '🧠', label: 'Understanding the clinical content' },
  { icon: '🔍', label: 'Finding questions, rules and treatments' },
  { icon: '✅', label: 'Checking quality and flagging items to review' },
  { icon: '🏥', label: 'Organising pathway content' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getFileIcon(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return '📋';
  if (ext === 'docx' || ext === 'doc') return '📝';
  if (ext === 'txt') return '📄';
  return '📁';
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function getStatusColor(status: string | undefined): string {
  switch (status) {
    case 'COMPLETED': return 'text-emerald-600';
    case 'FAILED': return 'text-red-500';
    case 'PROCESSING': return 'text-blue-500';
    default: return 'text-muted-foreground';
  }
}

function validateFile(file: File): string | null {
  const ext = '.' + (file.name.split('.').pop()?.toLowerCase() ?? '');
  const mimeOk = ACCEPTED_MIMES.has(file.type) || file.type.includes('pdf') || file.type.includes('word');
  const extOk = ACCEPTED_EXTS.includes(ext);
  if (!mimeOk && !extOk) {
    return `"${file.name}" is not supported. Please use PDF, DOCX, DOC, or TXT.`;
  }
  if (file.size > MAX_SIZE_MB * 1024 * 1024) {
    return `"${file.name}" is too big. Maximum size is ${MAX_SIZE_MB}MB.`;
  }
  return null;
}

// ─── AI Processing Overlay ───────────────────────────────────────────────────

function AiProcessingBanner({ docs, onRefresh }: { docs: ClinicalDocument[]; onRefresh?: () => void }) {
  const processing = docs.filter((d) => d.processingStatus === 'PROCESSING');
  const failed = docs.filter((d) => d.processingStatus === 'FAILED');

  if (!processing.length && !failed.length) return null;

  return (
    <div className="space-y-3">
      {processing.length > 0 && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="relative">
              <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center">
                <Brain className="h-4 w-4 text-white" />
              </div>
              <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-blue-400 animate-ping" />
            </div>
            <div>
              <p className="text-sm font-semibold text-blue-900">
                SafeScribe is reading {processing.length > 1 ? `${processing.length} guides` : 'your guide'}
              </p>
              <p className="text-xs text-blue-600 mt-0.5">Usually takes 30–90 seconds per file</p>
            </div>
          </div>

          <div className="space-y-1.5">
            {AI_STEPS.map((step, i) => (
              <div key={i} className="flex items-center gap-2 text-xs text-blue-700">
                <span className="text-base leading-none">{step.icon}</span>
                <span>{step.label}</span>
                <Loader2 className="ml-auto h-3 w-3 animate-spin opacity-60" />
              </div>
            ))}
          </div>

          <Progress value={undefined} className="mt-3 h-1.5 animate-pulse bg-blue-200" />

          {onRefresh && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              className="mt-2 h-7 text-xs text-blue-700 hover:text-blue-900"
            >
              Check status
            </Button>
          )}
        </div>
      )}

      {failed.map((doc) => (
        <div key={doc.id} className="rounded-xl border border-red-200 bg-red-50 p-3 flex gap-3">
          <XCircle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-red-800">{doc.fileName} — Could not process</p>
            {doc.processingError && (
              <p className="text-xs text-red-600 mt-0.5">{doc.processingError}</p>
            )}
            <p className="text-xs text-red-500 mt-1">Please try uploading again or use a different file format.</p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Staged-file row ─────────────────────────────────────────────────────────

function StagedFileRow({ file, onRemove }: { file: File; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-3 py-2">
      <span className="text-xl leading-none">{getFileIcon(file.name)}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{file.name}</p>
        <p className="text-xs text-muted-foreground">{formatSize(file.size)}</p>
      </div>
      <button onClick={onRemove} className="text-muted-foreground hover:text-destructive transition-colors">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─── Uploaded doc row ─────────────────────────────────────────────────────────

function UploadedDocRow({ doc }: { doc: ClinicalDocument }) {
  const isCompleted = doc.processingStatus === 'COMPLETED';
  const isFailed = doc.processingStatus === 'FAILED';
  const isProcessing = !isCompleted && !isFailed;

  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/20 px-3 py-2.5">
      <span className="text-xl leading-none">{getFileIcon(doc.fileName)}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{doc.fileName}</p>
        <p className={cn('text-xs mt-0.5', getStatusColor(doc.processingStatus))}>
          {isCompleted && `Read · ${doc.pageCount ? `${doc.pageCount} pages` : formatSize(doc.fileSize)}`}
          {isFailed && 'Could not process'}
          {isProcessing && 'Reading guide…'}
        </p>
      </div>
      <div className="shrink-0">
        {isCompleted && <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
        {isFailed && <XCircle className="h-5 w-5 text-red-500" />}
        {isProcessing && <Loader2 className="h-5 w-5 animate-spin text-blue-500" />}
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function DocumentUploadPanel({
  pathwayId,
  documents,
  onRefresh,
  className,
}: {
  pathwayId: string;
  documents: ClinicalDocument[];
  onRefresh?: () => void;
  className?: string;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [staged, setStaged] = useState<File[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const upload = useUploadDocuments(pathwayId);

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      const arr = Array.from(incoming);
      const newErrors: string[] = [];
      const valid: File[] = [];

      for (const f of arr) {
        const err = validateFile(f);
        if (err) {
          newErrors.push(err);
        } else if (staged.length + valid.length >= MAX_FILES) {
          newErrors.push(`You can upload only ${MAX_FILES} files at a time.`);
          break;
        } else if (!staged.find((s) => s.name === f.name && s.size === f.size)) {
          valid.push(f);
        }
      }

      setErrors(newErrors);
      if (valid.length) setStaged((prev) => [...prev, ...valid]);
    },
    [staged],
  );

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  };

  const handleUpload = async () => {
    if (!staged.length) return;
    setErrors([]);

    try {
      await upload.mutateAsync(staged);
      setStaged([]);
      toast.success(
        staged.length > 1
          ? `${staged.length} guides uploaded. We are preparing your pathway now.`
          : 'Guide uploaded. We are preparing your pathway now.',
      );
    } catch (err: unknown) {
      const raw =
        err && typeof err === 'object' && 'message' in err
          ? (err as { message: string | string[] }).message
          : 'Upload did not work. Please try again.';
      const msg = Array.isArray(raw) ? raw.join(', ') : String(raw);
      setErrors([msg]);
      toast.error(msg);
    }
  };

  const hasDocuments = documents.length > 0;
  const hasProcessing = documents.some((d) => d.processingStatus === 'PROCESSING');

  return (
    <Card className={cn('overflow-hidden shadow-none', className)}>
      {/* Header */}
      <div className="border-b border-border/60 bg-muted/20 px-5 py-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-primary/10 flex items-center justify-center">
              <Sparkles className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">Clinical Guide Documents</h3>
              <p className="text-xs text-muted-foreground">PDF, DOCX, DOC, TXT — up to {MAX_FILES} files · {MAX_SIZE_MB}MB each</p>
            </div>
          </div>
          {hasDocuments && (
            <Badge variant="secondary" className="gap-1">
              <FileType2 className="h-3 w-3" />
              {documents.length} {documents.length === 1 ? 'guide' : 'guides'}
            </Badge>
          )}
        </div>
      </div>

      <div className="p-5 space-y-4">
        {/* AI Processing / Failure banners */}
        {hasDocuments && (
          <AiProcessingBanner docs={documents} onRefresh={onRefresh} />
        )}

        {/* Existing documents list */}
        {hasDocuments && !hasProcessing && (
          <div className="space-y-2">
            {documents.map((doc) => (
              <UploadedDocRow key={doc.id} doc={doc} />
            ))}
          </div>
        )}

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => !upload.isPending && fileRef.current?.click()}
          className={cn(
            'flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-8 transition-all cursor-pointer select-none',
            isDragging && 'border-primary bg-primary/5 scale-[1.01]',
            !isDragging && 'border-border hover:border-primary/50 hover:bg-muted/30',
            upload.isPending && 'pointer-events-none opacity-60',
          )}
        >
          {upload.isPending ? (
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="relative">
                <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <Brain className="h-6 w-6 text-primary" />
                </div>
                <Loader2 className="absolute -bottom-1 -right-1 h-5 w-5 animate-spin text-primary" />
              </div>
              <p className="text-sm font-semibold mt-1">Uploading {staged.length} {staged.length === 1 ? 'guide' : 'guides'}…</p>
              <p className="text-xs text-muted-foreground">Getting ready to read your guide</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-1">
                <FilePlus2 className="h-6 w-6 text-primary" />
              </div>
              <p className="text-sm font-semibold">
                {hasDocuments ? 'Add more guides' : 'Drop your clinical guides here'}
              </p>
              <p className="text-xs text-muted-foreground">PDF, DOCX, DOC, or TXT · max {MAX_SIZE_MB}MB per file</p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2 gap-1.5 pointer-events-none"
                tabIndex={-1}
              >
                <Upload className="h-3.5 w-3.5" />
                Choose Files
              </Button>
            </div>
          )}
        </div>

        {/* Staged files */}
        {staged.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Ready to upload · {staged.length} {staged.length === 1 ? 'file' : 'files'}
            </p>
            {staged.map((f, i) => (
              <StagedFileRow
                key={`${f.name}-${i}`}
                file={f}
                onRemove={() => setStaged((prev) => prev.filter((_, j) => j !== i))}
              />
            ))}
            <div className="flex gap-2 pt-1">
              <Button
                size="sm"
                onClick={handleUpload}
                disabled={upload.isPending}
                className="flex-1 gap-1.5"
              >
                {upload.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {upload.isPending
                  ? 'Uploading…'
                  : `Read ${staged.length} ${staged.length === 1 ? 'Guide' : 'Guides'} and Prepare Pathway`}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => { setStaged([]); setErrors([]); }}
                disabled={upload.isPending}
                className="px-3"
              >
                Clear
              </Button>
            </div>
          </div>
        )}

        {/* Validation errors */}
        {errors.length > 0 && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-1">
            <div className="flex items-center gap-2 mb-1">
              <FileWarning className="h-4 w-4 text-destructive shrink-0" />
              <p className="text-sm font-semibold text-destructive">Cannot upload</p>
            </div>
            {errors.map((e, i) => (
              <p key={i} className="text-xs text-destructive/80 pl-6">{e}</p>
            ))}
          </div>
        )}
      </div>

      {/* Hidden file input */}
      <input
        ref={fileRef}
        type="file"
        multiple
        accept=".pdf,.docx,.doc,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,text/plain"
        className="hidden"
        onChange={(e) => {
          if (e.target.files?.length) addFiles(e.target.files);
          e.target.value = '';
        }}
      />
    </Card>
  );
}
