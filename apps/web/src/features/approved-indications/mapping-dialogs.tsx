'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { toast } from '@/lib/notify';
import { toastError } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import type { IndicationMapping, SaveMappingInput } from './hooks';
import { useIndicationMappingMutations } from './hooks';
import {
  JURISDICTION_FORM_OPTIONS,
  MAPPING_LEVEL_OPTIONS,
  RELATIONSHIP_OPTIONS,
  type MappingLevel,
  type RelationshipType,
} from './labels';
import {
  MedicationConceptPicker,
  SnomedIndicationPicker,
  type SelectedIndication,
  type SelectedMedication,
} from './terminology-pickers';

const NOTES_MAX = 1000;

function mappingToFormState(row: IndicationMapping): {
  medication: SelectedMedication;
  indication: SelectedIndication;
  level: MappingLevel;
  relationship: RelationshipType;
  jurisdiction: string;
  sourceLabel: string;
  notes: string;
} {
  return {
    medication: {
      conceptId: row.medicationConceptId,
      displayName: row.medicationDisplayName,
      suggestedLevel: row.medicationMappingLevel as MappingLevel,
    },
    indication: {
      conceptId: row.indicationConceptId,
      displayName: row.indicationDisplayName,
    },
    level: (row.medicationMappingLevel as MappingLevel) || 'ingredient',
    relationship: (row.relationshipType as RelationshipType) || 'approved_indication',
    jurisdiction: row.jurisdiction || 'CA',
    sourceLabel: row.sourceLabel ?? '',
    notes: row.notes ?? '',
  };
}

export function MappingFormDialog({
  open,
  mode,
  initial,
  saving,
  onClose,
  onSave,
}: {
  open: boolean;
  mode: 'create' | 'edit';
  initial: IndicationMapping | null;
  saving: boolean;
  onClose: () => void;
  onSave: (body: SaveMappingInput) => Promise<void>;
}) {
  const [medication, setMedication] = useState<SelectedMedication | null>(null);
  const [indication, setIndication] = useState<SelectedIndication | null>(null);
  const [level, setLevel] = useState<MappingLevel>('ingredient');
  const [relationship, setRelationship] = useState<RelationshipType>('approved_indication');
  const [jurisdiction, setJurisdiction] = useState('CA');
  const [sourceLabel, setSourceLabel] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    if (initial) {
      const s = mappingToFormState(initial);
      setMedication(s.medication);
      setIndication(s.indication);
      setLevel(s.level);
      setRelationship(s.relationship);
      setJurisdiction(s.jurisdiction);
      setSourceLabel(s.sourceLabel);
      setNotes(s.notes);
      return;
    }
    setMedication(null);
    setIndication(null);
    setLevel('ingredient');
    setRelationship('approved_indication');
    setJurisdiction('CA');
    setSourceLabel('');
    setNotes('');
  }, [open, initial]);

  useEffect(() => {
    if (medication?.suggestedLevel && mode === 'create' && !initial) {
      setLevel(medication.suggestedLevel);
    }
  }, [medication, mode, initial]);

  const canSave = Boolean(
    medication?.conceptId &&
      indication?.conceptId &&
      level &&
      relationship &&
      jurisdiction,
  );

  const title = mode === 'create' ? 'Add indication mapping' : 'Edit indication mapping';
  const description =
    mode === 'create'
      ? 'Create a governed relationship between an existing CCDD medication concept and an existing SNOMED CT indication.'
      : 'Update metadata for this mapping. Changing medication or indication identity may create a new version on the server.';

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[min(100vh-2rem,880px)] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <MedicationConceptPicker
            value={medication}
            onChange={setMedication}
            disabled={mode === 'edit'}
          />
          <Field label="Mapping level *">
            <Select
              value={level}
              onChange={(e) => setLevel(e.target.value as MappingLevel)}
              options={MAPPING_LEVEL_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            />
            <p className="mt-1 text-xs text-[#617184]">
              Use the highest reusable level that accurately represents the indication.
            </p>
          </Field>
          <SnomedIndicationPicker
            value={indication}
            onChange={setIndication}
            disabled={mode === 'edit'}
          />
          <Field label="Relationship type *">
            <Select
              value={relationship}
              onChange={(e) => setRelationship(e.target.value as RelationshipType)}
              options={RELATIONSHIP_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
            />
          </Field>
          <Field label="Jurisdiction *">
            <Select
              value={jurisdiction}
              onChange={(e) => setJurisdiction(e.target.value)}
              options={JURISDICTION_FORM_OPTIONS.map((o) => ({
                value: o.value,
                label: o.label,
              }))}
            />
          </Field>
          <Field label="Source label">
            <Input
              value={sourceLabel}
              onChange={(e) => setSourceLabel(e.target.value)}
              placeholder="e.g. Health Canada PM, CPS Guideline"
            />
          </Field>
          <Field label="Notes">
            <Textarea
              value={notes}
              maxLength={NOTES_MAX}
              rows={3}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes about this mapping…"
            />
            <p className="mt-1 text-right text-xs text-[#8a9aa3]">
              {notes.length}/{NOTES_MAX}
            </p>
          </Field>
        </div>
        {mode === 'edit' ? (
          <DialogFooter className="flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <RetireMappingTrigger mapping={initial} onRetired={onClose} />
            <div className="flex gap-2 sm:justify-end">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancel
              </Button>
              <Button
                type="button"
                disabled={saving || !canSave}
                className="bg-[#0F6F6B] hover:bg-[#0b5451]"
                onClick={() =>
                  void onSave(buildPayload(medication, indication, level, relationship, jurisdiction, sourceLabel, notes))
                }
              >
                {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
                Save changes
              </Button>
            </div>
          </DialogFooter>
        ) : (
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saving || !canSave}
              className="bg-[#0F6F6B] hover:bg-[#0b5451]"
              onClick={() =>
                void onSave(buildPayload(medication, indication, level, relationship, jurisdiction, sourceLabel, notes))
              }
            >
              {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Save mapping
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function buildPayload(
  medication: SelectedMedication | null,
  indication: SelectedIndication | null,
  level: MappingLevel,
  relationship: RelationshipType,
  jurisdiction: string,
  sourceLabel: string,
  notes: string,
): SaveMappingInput {
  return {
    medicationConceptId: medication!.conceptId,
    medicationDisplayName: medication!.displayName,
    medicationMappingLevel: level,
    indicationConceptId: indication!.conceptId,
    indicationDisplayName: indication!.displayName,
    relationshipType: relationship,
    jurisdiction,
    sourceLabel: sourceLabel.trim() || null,
    notes: notes.trim() || null,
  };
}

function RetireMappingTrigger({
  mapping,
  onRetired,
}: {
  mapping: IndicationMapping | null;
  onRetired: () => void;
}) {
  const [open, setOpen] = useState(false);
  const mutations = useIndicationMappingMutations();

  if (!mapping || mapping.status === 'retired') return null;

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className="text-red-700 hover:bg-red-50 hover:text-red-800"
        onClick={() => setOpen(true)}
      >
        Retire mapping
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Retire indication mapping?"
        description="This mapping will no longer be returned for new consultations. Historical consultations will retain the version they used."
        confirmLabel="Retire mapping"
        cancelLabel="Cancel"
        loading={mutations.retireMapping.isPending}
        onConfirm={() => {
          void mutations.retireMapping
            .mutateAsync(mapping.id)
            .then(() => {
              toast.success('Mapping retired');
              setOpen(false);
              onRetired();
            })
            .catch((error) => toastError(error, 'Could not retire mapping'));
        }}
      />
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold uppercase tracking-wide text-[#7b8b94]">
        {label}
      </span>
      {children}
    </label>
  );
}
