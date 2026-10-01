/**
 * Client-side PDF layout config — mirrors API Doc Download Format layouts.
 * Used by pdf-generator for live preview/download rendering.
 */

export type PdfSectionType =
  | 'heading'
  | 'subheading'
  | 'field'
  | 'bullets'
  | 'static'
  | 'pharmacist'
  | 'spacer';

export interface PdfLayoutSection {
  id: string;
  type: PdfSectionType;
  label?: string;
  field?: string;
  fallback?: string;
  text?: string;
  showIfEmpty?: boolean;
}

export type PdfLayoutMode = 'sections' | 'prescription';

export interface PdfLayoutConfig {
  mode: PdfLayoutMode;
  title: string;
  showPatientHeader?: boolean;
  showPageFooter?: boolean;
  sections: PdfLayoutSection[];
}

export type ResponseFieldType = 'string' | 'array' | 'object';

export interface ResponseSchemaField {
  key: string;
  label: string;
  type: ResponseFieldType;
  required?: boolean;
  description?: string;
}

export interface DocResponseSchema {
  fields: ResponseSchemaField[];
}

export const PDF_SECTION_TYPE_OPTIONS: Array<{ value: PdfSectionType; label: string }> = [
  { value: 'heading', label: 'Heading' },
  { value: 'subheading', label: 'Subheading' },
  { value: 'field', label: 'Content field' },
  { value: 'bullets', label: 'Bullet list' },
  { value: 'static', label: 'Static text' },
  { value: 'pharmacist', label: 'Pharmacist block' },
  { value: 'spacer', label: 'Spacer' },
];

export function emptySection(type: PdfSectionType = 'field'): PdfLayoutSection {
  return {
    id: `sec-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    type,
    label: type === 'heading' || type === 'subheading' ? 'New section' : undefined,
    field: type === 'field' || type === 'bullets' ? 'fieldName' : undefined,
    showIfEmpty: type === 'field',
  };
}

export function emptySchemaField(): ResponseSchemaField {
  return {
    key: 'newField',
    label: 'New field',
    type: 'string',
    required: false,
  };
}

export function parsePdfLayout(raw: unknown): PdfLayoutConfig | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (obj.mode !== 'sections' && obj.mode !== 'prescription') return null;
  if (typeof obj.title !== 'string') return null;
  if (!Array.isArray(obj.sections)) return null;
  return {
    mode: obj.mode,
    title: obj.title,
    showPatientHeader: obj.showPatientHeader !== false,
    showPageFooter: obj.showPageFooter !== false,
    sections: obj.sections as PdfLayoutSection[],
  };
}

export function parseResponseSchema(raw: unknown): DocResponseSchema | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.fields)) return null;
  return { fields: obj.fields as ResponseSchemaField[] };
}
