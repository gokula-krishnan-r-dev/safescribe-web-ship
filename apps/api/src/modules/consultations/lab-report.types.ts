export interface ExtractedLabValue {
  test: string;
  value: string;
  unit?: string;
  referenceRange?: string;
  /** Collection / result date when present in the source text (ISO or display) */
  observedDate?: string;
  confidence: number;
  needsReview: boolean;
}

export interface LabReportExtractionResult {
  labValues: ExtractedLabValue[];
  summary?: string;
  reportDate?: string;
  patientName?: string;
  overallConfidence: number;
  cached: boolean;
  warnings?: string[];
}

export const LAB_EXTRACT_REDIS_PREFIX = 'lab-extract:v3:';
export const LAB_TEXT_EXTRACT_REDIS_PREFIX = 'lab-extract-text:v3:';

export const LAB_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

export const LAB_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
export const LAB_PDF_EXTENSIONS = new Set(['.pdf']);

export const LAB_IMAGE_MAX_BYTES = 10 * 1024 * 1024;
export const LAB_PDF_MAX_BYTES = 20 * 1024 * 1024;
export const LAB_TEXT_MIN_CHARS = 3;
export const LAB_TEXT_MAX_CHARS = 20_000;
