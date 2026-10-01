'use client';

import {
  SelectedTreatmentEditor,
  type SelectedTreatmentEditorProps,
} from '@/features/treatment-editor/selected-treatment-editor';

/** Consultation inline editor — thin wrapper around the shared selected-treatment editor. */
export function InlineTreatmentEditor(props: SelectedTreatmentEditorProps) {
  return <SelectedTreatmentEditor {...props} />;
}
