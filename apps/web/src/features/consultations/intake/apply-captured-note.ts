import {
  resolveRewrittenConsultationNote,
  type ExtractedClinicalItem,
} from '@safescript/shared';

export type ExtractionApplyPayload = {
  extraction?: {
    presentingConcern?: { text?: string } | null;
    relevantClinicalInformation?: ExtractedClinicalItem[];
  };
  rendered?: {
    presentingConcern?: string | null;
    items?: ExtractedClinicalItem[];
    plainText?: string;
  };
  transcript?: string | null;
  sourceTranscript?: string | null;
  chiefComplaint?: string | null;
  hasTemporaryTranscript?: boolean;
};

export function mergeExtractionIntoNote(input: {
  payload: ExtractionApplyPayload;
  currentNotes: string;
  currentConcern: string;
  currentItems: ExtractedClinicalItem[];
  rewriteNote?: boolean;
}): {
  notes: string;
  presentingConcern: string;
  items: ExtractedClinicalItem[];
  editing: boolean;
} {
  const items =
    input.payload.rendered?.items ??
    input.payload.extraction?.relevantClinicalInformation ??
    input.currentItems;
  const presentingConcern = (
    input.payload.chiefComplaint ||
    input.payload.rendered?.presentingConcern ||
    input.payload.extraction?.presentingConcern?.text ||
    input.currentConcern ||
    ''
  ).trim();
  const source = (
    input.payload.sourceTranscript ||
    input.currentNotes ||
    ''
  ).trim();
  const notes = resolveRewrittenConsultationNote({
    rewriteNote: input.rewriteNote !== false,
    sourceTranscript: source,
    renderedPlainText: input.payload.rendered?.plainText || input.payload.transcript,
    itemCount: items.length,
    previousNote: input.currentNotes,
  });

  return {
    notes,
    presentingConcern,
    items,
    editing: !(items.length || presentingConcern),
  };
}
