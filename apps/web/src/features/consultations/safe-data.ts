/**
 * Defensive helpers for consultation / pathway JSON blobs.
 * AI and legacy rows often store objects or strings where arrays are expected;
 * calling .map/.filter/.slice on those crashes the wizard (error boundary).
 */

export function asArray<T = unknown>(value: unknown): T[] {
  if (Array.isArray(value)) return value as T[];
  return [];
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

export function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

export interface NormalizedPathwayRedFlag {
  id: string;
  title: string;
  question: string | null;
  description: string | null;
  whyItMatters: string | null;
  severity: 'WARNING' | 'CRITICAL' | 'EMERGENCY';
  action: string | null;
  required: boolean;
  evidenceRefIds: string[];
}

/** Accept pathway.redFlags whether array, null, or legacy/AI-shaped items. */
export function normalizePathwayRedFlags(raw: unknown): NormalizedPathwayRedFlag[] {
  return asArray(raw).flatMap((item, index) => {
    const rec = asRecord(item);
    if (!rec) return [];
    const title = asString(rec.title || rec.flag || rec.name).trim();
    if (!title) return [];
    const severityRaw = asString(rec.severity, 'WARNING').toUpperCase();
    const severity =
      severityRaw === 'CRITICAL' || severityRaw === 'EMERGENCY' ? severityRaw : 'WARNING';
    const question = asString(rec.question).trim() || null;
    const description =
      rec.description != null
        ? asString(rec.description)
        : rec.reasoning != null
          ? asString(rec.reasoning)
          : null;
    return [
      {
        id: asString(rec.id, `pathway-rf-${index}`),
        title,
        question: question || description,
        description: question || description,
        whyItMatters: asString(rec.whyItMatters).trim() || null,
        severity,
        action:
          rec.action != null
            ? asString(rec.action)
            : rec.recommendedAction != null
              ? asString(rec.recommendedAction)
              : null,
        required: rec.required !== false,
        evidenceRefIds: asArray<unknown>(rec.evidenceRefIds ?? rec.referenceIds)
          .map((id) => asString(id).trim())
          .filter(Boolean),
      },
    ];
  });
}

export interface NormalizedDifferential {
  id: string;
  condition: string;
  question: string | null;
  whyItMatters: string | null;
  suggestedPathway: string | null;
  distinguishingFeatures: string | null;
  keySymptoms: string | null;
  recommendedAction: string | null;
  likelihood: 'COMMON' | 'LESS_COMMON' | 'RARE' | null;
  required: boolean;
  evidenceRefIds: string[];
}

export function normalizeDifferentials(raw: unknown): NormalizedDifferential[] {
  return asArray(raw).flatMap((item, index) => {
    const rec = asRecord(item);
    if (!rec) return [];
    const condition = asString(rec.condition || rec.name || rec.title).trim();
    if (!condition) return [];
    const likelihoodRaw = asString(rec.likelihood).toUpperCase();
    const likelihood =
      likelihoodRaw === 'COMMON' ||
      likelihoodRaw === 'LESS_COMMON' ||
      likelihoodRaw === 'RARE'
        ? likelihoodRaw
        : null;
    return [
      {
        id: asString(rec.id, `ddx-${index}`),
        condition,
        question: rec.question != null ? asString(rec.question) : null,
        whyItMatters: rec.whyItMatters != null ? asString(rec.whyItMatters) : null,
        suggestedPathway: rec.suggestedPathway != null ? asString(rec.suggestedPathway) : null,
        distinguishingFeatures:
          rec.distinguishingFeatures != null ? asString(rec.distinguishingFeatures) : null,
        keySymptoms: rec.keySymptoms != null ? asString(rec.keySymptoms) : null,
        recommendedAction:
          rec.recommendedAction != null ? asString(rec.recommendedAction) : null,
        likelihood,
        required: rec.required !== false,
        evidenceRefIds: asArray<unknown>(rec.evidenceRefIds ?? rec.referenceIds)
          .map((id) => asString(id).trim())
          .filter(Boolean),
      },
    ];
  });
}

/** Question options may be Json array, string[], or {label,value}[]. */
export function normalizeQuestionOptions(
  raw: unknown,
): Array<{ label: string; value: string }> {
  return asArray(raw).flatMap((item) => {
    if (typeof item === 'string') {
      const v = item.trim();
      return v ? [{ label: v, value: v }] : [];
    }
    const rec = asRecord(item);
    if (!rec) return [];
    const label = asString(rec.label || rec.value).trim();
    const value = asString(rec.value || rec.label).trim();
    if (!label && !value) return [];
    return [{ label: label || value, value: value || label }];
  });
}
