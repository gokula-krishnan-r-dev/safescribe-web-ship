'use client';

import { useEffect, useState } from 'react';
import { FileText, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Consultation } from '../types';
import { getDocumentDefinition } from './document-definitions';
import { generateDocumentPdf, buildPdfContext } from './pdf-generator';
import type {
  DocumentationPackage,
  DocumentMeta,
  DocumentTypeId,
  PatientDocumentInfo,
} from './types';

interface Props {
  open: boolean;
  onClose: () => void;
  typeId: DocumentTypeId;
  consultation: Consultation;
  pkg: DocumentationPackage;
  patientInfo: PatientDocumentInfo;
  definition?: DocumentMeta;
}

/** Legacy PDF iframe preview — prefer DocumentWorkspaceDialog for Notion-style Preview/Edit. */
export function DocumentPreviewDialog({
  open,
  onClose,
  typeId,
  consultation,
  pkg,
  patientInfo,
  definition,
}: Props) {
  const [url, setUrl] = useState<string | null>(null);
  const def = definition ?? getDocumentDefinition(typeId);

  useEffect(() => {
    if (!open) {
      if (url) URL.revokeObjectURL(url);
      setUrl(null);
      return;
    }
    const ctx = buildPdfContext(consultation, patientInfo);
    let objectUrl: string | null = null;
    let cancelled = false;
    void (async () => {
      const blob = await generateDocumentPdf(typeId, pkg, ctx, def.pdfLayout);
      if (cancelled) return;
      objectUrl = URL.createObjectURL(blob);
      setUrl(objectUrl);
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, typeId, consultation, pkg, patientInfo, def.pdfLayout]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-4xl h-[85vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 py-4 border-b border-border shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-base">
              <FileText className="h-4 w-4 text-primary" />
              {def.name}
            </DialogTitle>
            <Button variant="ghost" size="sm" onClick={onClose} className="h-8 w-8 p-0">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </DialogHeader>
        <div className="flex-1 bg-muted/30">
          {url ? (
            <iframe src={url} className="w-full h-full border-0" title={def.name} />
          ) : (
            <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
              Loading preview…
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
