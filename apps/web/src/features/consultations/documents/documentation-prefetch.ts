import type { Consultation } from '../types';
import type { DocumentationPackage, PatientDocumentInfo } from './types';
import {
  bumpDocumentationRevision,
  clearDocumentHtml,
  mergePatientInfo,
  normalizeDocumentation,
  refreshPatientDependentDocuments,
} from './normalize-documentation';
import { PATIENT_DEPENDENT_DOCS } from './document-dependencies';

export type DocumentationPrefetchStatus =
  | 'idle'
  | 'pending'
  | 'ready'
  | 'error';

type PrefetchEntry = {
  status: Exclude<DocumentationPrefetchStatus, 'idle'>;
  promise: Promise<DocumentationPackage>;
  result?: DocumentationPackage;
  error?: unknown;
  startedAt: number;
};

const store = new Map<string, PrefetchEntry>();

/** Prefer falling back to on-demand generation over waiting forever. */
export const DOCUMENTATION_PREFETCH_AWAIT_MS = 95_000;

export function getDocumentationPrefetchStatus(
  consultationId: string,
): DocumentationPrefetchStatus {
  return store.get(consultationId)?.status ?? 'idle';
}

export function peekDocumentationPrefetch(
  consultationId: string,
): DocumentationPackage | undefined {
  return store.get(consultationId)?.result;
}

/**
 * Deduplicated background documentation generation for a consultation.
 * Safe across Step 5 → Step 6 remounts (module-level registry).
 */
export function startDocumentationPrefetch(
  consultationId: string,
  run: () => Promise<DocumentationPackage>,
  options?: { force?: boolean },
): Promise<DocumentationPackage> {
  const existing = store.get(consultationId);
  if (!options?.force && existing?.status === 'pending') {
    return existing.promise;
  }
  if (!options?.force && existing?.status === 'ready' && existing.result) {
    return Promise.resolve(existing.result);
  }

  const startedAt = Date.now();
  const promise = run()
    .then((result) => {
      store.set(consultationId, {
        status: 'ready',
        promise,
        result,
        startedAt,
      });
      return result;
    })
    .catch((error) => {
      store.set(consultationId, {
        status: 'error',
        promise,
        error,
        startedAt,
      });
      throw error;
    });

  store.set(consultationId, {
    status: 'pending',
    promise,
    startedAt,
  });
  return promise;
}

export async function awaitDocumentationPrefetch(
  consultationId: string,
  timeoutMs = DOCUMENTATION_PREFETCH_AWAIT_MS,
): Promise<DocumentationPackage | null> {
  const entry = store.get(consultationId);
  if (!entry) return null;
  if (entry.status === 'ready' && entry.result) return entry.result;
  if (entry.status === 'error') return null;

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      entry.promise,
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), timeoutMs);
      }),
    ]);
    return result;
  } catch {
    return null;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export function clearDocumentationPrefetch(consultationId: string) {
  store.delete(consultationId);
}

/** Apply patient identity onto a prefetched / stored package without LLM. */
export function applyPatientInfoToDocumentationPackage(
  pkg: DocumentationPackage,
  consultation: Consultation,
  patientInfo: PatientDocumentInfo,
): DocumentationPackage {
  const normalized = normalizeDocumentation(pkg, consultation, patientInfo);
  const refreshed = refreshPatientDependentDocuments(
    mergePatientInfo(normalized, patientInfo),
    consultation,
    patientInfo,
  );
  return bumpDocumentationRevision(
    clearDocumentHtml(refreshed, [...PATIENT_DEPENDENT_DOCS]),
    'regenerate',
  );
}

/** Test helper */
export function resetDocumentationPrefetchForTests() {
  store.clear();
}
