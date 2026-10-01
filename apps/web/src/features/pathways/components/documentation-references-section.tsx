'use client';

import { useState } from 'react';
import { toast } from '@/lib/notify';
import { Button } from '@/components/ui/button';
import { documentationCitationLine } from '@safescript/shared';
import type { ClinicalPathway } from '../types';
import { editLockProps } from '../pathway-edit-lock';
import { useUpdatePathwayGovernance } from '../hooks';
import { PrimaryDocPickerDialog } from '../references-governance/primary-doc-picker-dialog';
import { resolveGovernance } from '../references-governance/utils';

function docLine(
  ref:
    | {
        citationTitle: string;
        publicationYear?: number | null;
        edition?: string | null;
      }
    | null
    | undefined,
) {
  if (!ref) return '—';
  return documentationCitationLine({
    citationTitle: ref.citationTitle,
    publicationYear: ref.publicationYear,
    edition: ref.edition,
  });
}

export function DocumentationReferencesSection({
  pathway,
  canEdit,
}: {
  pathway: ClinicalPathway;
  canEdit: boolean;
}) {
  const lock = editLockProps(canEdit);
  const library = pathway.libraryReferences ?? [];
  const governance = resolveGovernance(pathway);
  const primaryId =
    pathway.primaryDocumentationReferenceId ??
    governance.primaryDocumentationReferenceId ??
    null;
  const secondaryId =
    pathway.secondaryDocumentationReferenceId ??
    governance.secondaryDocumentationReferenceId ??
    null;
  const primaryRef = library.find((r) => r.id === primaryId) ?? null;
  const secondaryRef = library.find((r) => r.id === secondaryId) ?? null;
  const updateGovernance = useUpdatePathwayGovernance(pathway.id);
  const [picker, setPicker] = useState<'primary' | 'secondary' | null>(null);

  const saveRole = async (role: 'primary' | 'secondary', id: string | null) => {
    try {
      await updateGovernance.mutateAsync(
        role === 'primary'
          ? { primaryDocumentationReferenceId: id }
          : { secondaryDocumentationReferenceId: id },
      );
      toast.success(
        id
          ? `${role === 'primary' ? 'Primary' : 'Secondary'} documentation reference set.`
          : `${role === 'primary' ? 'Primary' : 'Secondary'} documentation reference cleared.`,
      );
    } catch (err: unknown) {
      toast.error(
        err instanceof Error ? err.message : 'Could not update documentation reference.',
      );
      throw err;
    }
  };

  return (
    <section className="space-y-2.5 border-t border-border/70 pt-4">
      <div>
        <h4 className="text-[13px] font-semibold">References for documentation</h4>
        <p className="text-[11.5px] leading-relaxed text-muted-foreground">
          Pathway-level sources shown to pharmacists and stamped on generated clinical notes.
          Set them here or in References & Governance.
        </p>
      </div>

      <div className="space-y-2">
        <div className="rounded-lg border border-border/80 px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                Primary
              </p>
              <p className="mt-0.5 text-[13px] font-medium leading-snug text-foreground">
                {docLine(primaryRef)}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 px-2 text-[12px] font-semibold text-primary"
              onClick={() => setPicker('primary')}
              {...lock}
            >
              {primaryRef ? 'Change' : 'Set'}
            </Button>
          </div>
        </div>

        <div className="rounded-lg border border-border/80 px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
                Secondary
              </p>
              <p className="mt-0.5 text-[13px] font-medium leading-snug text-foreground">
                {docLine(secondaryRef)}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 px-2 text-[12px] font-semibold text-primary"
              onClick={() => setPicker('secondary')}
              {...lock}
            >
              {secondaryRef ? 'Change' : 'Set'}
            </Button>
          </div>
        </div>
      </div>

      <PrimaryDocPickerDialog
        open={picker !== null}
        onClose={() => setPicker(null)}
        library={library}
        role={picker ?? 'primary'}
        selectedId={picker === 'secondary' ? secondaryId : primaryId}
        excludeId={picker === 'secondary' ? primaryId : secondaryId}
        saving={updateGovernance.isPending}
        onSave={async (id) => {
          if (!picker) return;
          await saveRole(picker, id);
        }}
      />
    </section>
  );
}
