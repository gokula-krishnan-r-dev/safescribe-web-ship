import {
  PRESENTATION_FINDING_MAX,
  PRESENTATION_FINDINGS_KEY,
} from './presentation-review-copy';
import type { QuestionResponse } from '../types';

export type AdditionalClinicalFinding = {
  id: string;
  text: string;
  createdAt: string;
  updatedAt?: string;
};

export function newFindingId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `finding-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function clampFindingText(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, PRESENTATION_FINDING_MAX);
}

export function parsePresentationFindings(response?: QuestionResponse | null): AdditionalClinicalFinding[] {
  const raw = response?.answerText?.trim();
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    const findings: AdditionalClinicalFinding[] = [];
    for (const row of parsed) {
      if (!row || typeof row !== 'object') continue;
      const item = row as Partial<AdditionalClinicalFinding>;
      const text = typeof item.text === 'string' ? clampFindingText(item.text) : '';
      if (!text) continue;
      findings.push({
        id: typeof item.id === 'string' && item.id ? item.id : newFindingId(),
        text,
        createdAt: typeof item.createdAt === 'string' ? item.createdAt : new Date().toISOString(),
        updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : undefined,
      });
    }
    return findings;
  } catch {
    return [];
  }
}

export function serializePresentationFindings(
  findings: AdditionalClinicalFinding[],
): QuestionResponse {
  return {
    questionId: PRESENTATION_FINDINGS_KEY,
    question: 'Additional clinical findings',
    answer: findings.length > 0,
    answerText: JSON.stringify(findings),
    source: 'manual',
  };
}

export function formatFindingStamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = String(date.getDate()).padStart(2, '0');
  const month = months[date.getMonth()] ?? '';
  const year = date.getFullYear();
  const hours = date.getHours();
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const hour12 = hours % 12 || 12;
  const suffix = hours >= 12 ? 'PM' : 'AM';
  return `Added ${day}-${month}-${year}, ${hour12}:${minutes} ${suffix}`;
}
