'use client';

import { useState } from 'react';
import { FileUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ImportFromChatGptModal } from './import-from-chatgpt-modal';
import type { ChatGptImportTarget } from './chatgpt-import-prompts';
import type { ClinicalPathway } from './types';
import { editLockProps } from './pathway-edit-lock';

export function ImportFromChatGptButton({
  pathway,
  target,
  canEdit,
  customAssessmentEnabled,
  className,
}: {
  pathway: ClinicalPathway;
  target: ChatGptImportTarget;
  canEdit: boolean;
  customAssessmentEnabled?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const lock = editLockProps(canEdit);

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={className ?? 'gap-1.5'}
        onClick={() => {
          if (!canEdit) return;
          setOpen(true);
        }}
        {...lock}
      >
        <FileUp className="h-4 w-4" />
        Import from ChatGPT
      </Button>
      <ImportFromChatGptModal
        open={open}
        onClose={() => setOpen(false)}
        pathwayId={pathway.id}
        target={target}
        pathwayName={pathway.name}
        condition={pathway.condition}
        province={pathway.provinceAvailability || pathway.province}
        customAssessmentEnabled={customAssessmentEnabled}
      />
    </>
  );
}
