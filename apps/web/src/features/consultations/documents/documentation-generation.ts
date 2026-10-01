import { DOCUMENTATION_LLM_DOCUMENT_KEYS } from '@safescript/shared';
import type { DocumentState, DocumentTypeId } from './types';

export const DOCUMENTATION_LLM_TYPE_IDS =
  DOCUMENTATION_LLM_DOCUMENT_KEYS as readonly DocumentTypeId[];

export function llmDocumentTargets(ids: DocumentTypeId[]): DocumentTypeId[] {
  const llm = new Set<string>(DOCUMENTATION_LLM_DOCUMENT_KEYS);
  return ids.filter((id) => llm.has(id));
}

/** True only while a document is actively drafting — not while queued/gated. */
export function isDocumentCardGenerating(state: DocumentState): boolean {
  return state.status === 'GENERATING' || state.status === 'preparing';
}

/** Queued / not started yet (e.g. waiting for patient details Skip/Save). */
export function isDocumentCardPending(state: DocumentState): boolean {
  return state.status === 'pending';
}

export function documentationReadyCopy(
  readyCount: number,
  totalCount: number,
): string {
  return `Preparing documents · ${readyCount} of ${totalCount} ready`;
}
