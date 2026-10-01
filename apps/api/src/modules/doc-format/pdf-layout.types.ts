/**
 * Configurable PDF download layout + AI response schema.
 * Edited in Super Admin → Doc Download Format; applied live on preview/download.
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
  /** Section heading / label shown in the PDF */
  label?: string;
  /** Field key from the AI document object (e.g. assessment) */
  field?: string;
  /** Fallback text when the field is empty */
  fallback?: string;
  /** Static copy for type=static */
  text?: string;
  /** Still render heading/field when value is empty (uses fallback or —) */
  showIfEmpty?: boolean;
}

export type PdfLayoutMode = 'sections' | 'prescription';

export interface PdfLayoutConfig {
  mode: PdfLayoutMode;
  /** Document title printed at top of the PDF */
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
