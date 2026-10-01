'use client';

import { Download } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function DocumentDownloadSettings() {
  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Download className="h-4 w-4 text-primary" />
          Document downloads
        </CardTitle>
        <CardDescription>
          Consultation documents download to this device&apos;s Downloads folder.
          Bulk download sends one ZIP that contains every reviewed PDF.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm leading-relaxed text-muted-foreground">
          SafeScribe does not ask you to choose a folder. Use your browser&apos;s
          Downloads list if you need to open or move the files after they save.
        </p>
      </CardContent>
    </Card>
  );
}
