'use client';

import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn, formatDate } from '@/lib/utils';
import type { IndicationMapping } from './hooks';
import {
  ccddDisplayId,
  formatJurisdiction,
  formatMappingLevel,
  formatMappingStatus,
  formatRelationshipType,
  relationshipBadgeClass,
} from './labels';

export function MappingDetailsPanel({
  mapping,
  open,
  onClose,
}: {
  mapping: IndicationMapping | null;
  open: boolean;
  onClose: () => void;
}) {
  if (!open || !mapping) return null;

  const status = formatMappingStatus(mapping.status);

  return (
    <>
      <button
        type="button"
        aria-label="Close details"
        className="fixed inset-0 z-[70] bg-black/30 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <aside
        className={cn(
          'fixed inset-y-0 right-0 z-[71] flex w-full max-w-md flex-col border-l border-[#e4ecef] bg-white shadow-2xl',
          'animate-in slide-in-from-right duration-200',
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#edf3f4] px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-[#102a43]">Mapping details</h2>
            <p className="mt-0.5 text-xs text-[#617184]">Read-only governance record</p>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4 text-sm">
          <DetailBlock title="Medication">
            <p className="font-medium text-[#102a43]">{mapping.medicationDisplayName}</p>
            <p className="mt-0.5 text-xs text-[#7b8b94]">
              {formatMappingLevel(mapping.medicationMappingLevel)} · CCDD:{' '}
              {ccddDisplayId(mapping.medicationConceptId)}
            </p>
          </DetailBlock>
          <DetailBlock title="Indication">
            <p className="font-medium text-[#102a43]">{mapping.indicationDisplayName}</p>
            <p className="mt-0.5 text-xs text-[#7b8b94]">SNOMED CT: {mapping.indicationConceptId}</p>
          </DetailBlock>
          <DetailBlock title="Mapping level">
            {formatMappingLevel(mapping.medicationMappingLevel)}
          </DetailBlock>
          <DetailBlock title="Relationship">
            <span
              className={cn(
                'inline-flex rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset',
                relationshipBadgeClass(mapping.relationshipType),
              )}
            >
              {formatRelationshipType(mapping.relationshipType)}
            </span>
          </DetailBlock>
          <DetailBlock title="Jurisdiction">{formatJurisdiction(mapping.jurisdiction)}</DetailBlock>
          <DetailBlock title="Source">
            {mapping.sourceLabel?.trim() ? (
              mapping.sourceLabel
            ) : (
              <span className="text-[#8a9aa3]">Not linked</span>
            )}
          </DetailBlock>
          <DetailBlock title="Status">
            <StatusPill status={status} />
          </DetailBlock>
          <DetailBlock title="Version">{mapping.mappingVersion ?? '—'}</DetailBlock>
          {mapping.notes?.trim() ? (
            <DetailBlock title="Notes">
              <p className="whitespace-pre-wrap text-[#52677a]">{mapping.notes}</p>
            </DetailBlock>
          ) : null}
          <DetailBlock title="Created">{formatDate(mapping.createdAt)}</DetailBlock>
          <DetailBlock title="Last updated">{formatDate(mapping.updatedAt)}</DetailBlock>
        </div>
      </aside>
    </>
  );
}

function DetailBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7b8b94]">{title}</p>
      <div className="mt-1 text-[#102a43]">{children}</div>
    </div>
  );
}

function StatusPill({ status }: { status: 'approved' | 'retired' }) {
  return (
    <span
      className={cn(
        'inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold',
        status === 'approved' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600',
      )}
    >
      {status === 'approved' ? 'Approved' : 'Retired'}
    </span>
  );
}
