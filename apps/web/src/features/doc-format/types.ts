import type {
  DocResponseSchema,
  PdfLayoutConfig,
  PdfLayoutSection,
  ResponseSchemaField,
} from '@/features/consultations/documents/pdf-layout-types';

export type DocFormatCategory = 'clinical' | 'communication' | 'patient';

export interface DocFormatItem {
  id: string;
  key: string;
  name: string;
  shortName: string | null;
  description: string;
  category: DocFormatCategory | string;
  categoryLabel: string;
  bullets: string[];
  fileName: string;
  sortOrder: number;
  actions: string[];
  aiPrompt: string;
  styleNotes: string | null;
  exampleOutput: string;
  pdfLayout: PdfLayoutConfig | null;
  responseSchema: DocResponseSchema | null;
  published: boolean;
  isModified: boolean;
  updatedAt: string;
  updatedById: string | null;
}

export interface DocFormatCatalog {
  formats: DocFormatItem[];
}

export interface DocFormatDraft {
  name: string;
  shortName: string;
  description: string;
  categoryLabel: string;
  bulletsText: string;
  fileName: string;
  aiPrompt: string;
  styleNotes: string;
  exampleOutput: string;
  pdfLayout: PdfLayoutConfig;
  responseSchema: DocResponseSchema;
  published: boolean;
}

export interface ApplyDocFormatsPayload {
  formats: Array<{
    key: string;
    name?: string;
    shortName?: string;
    description?: string;
    categoryLabel?: string;
    bullets?: string[];
    fileName?: string;
    aiPrompt?: string;
    styleNotes?: string;
    exampleOutput?: string;
    pdfLayout?: PdfLayoutConfig;
    responseSchema?: DocResponseSchema;
    published?: boolean;
  }>;
}

export interface DocFormatPreviewResult {
  key: string;
  name: string;
  shortName: string | null;
  description: string;
  category: string;
  categoryLabel: string;
  bullets: string[];
  styleNotes: string | null;
  aiPromptPreview: string;
  example: unknown;
  exampleRaw: string;
  pdfLayout: PdfLayoutConfig | null;
  responseSchema: DocResponseSchema | null;
  renderedAt: string;
  note: string;
}

/** Runtime shape used by the pharmacist Doc module */
export interface PublishedDocFormat {
  key: string;
  name: string;
  shortName: string | null;
  description: string;
  category: string;
  categoryLabel: string;
  bullets: string[];
  fileName: string;
  sortOrder: number;
  actions: string[];
  aiPrompt: string;
  styleNotes: string | null;
  pdfLayout: PdfLayoutConfig | null;
  responseSchema: DocResponseSchema | null;
}

export const CATEGORY_LABELS: Record<string, string> = {
  clinical: 'Clinical Record',
  communication: 'Communication',
  patient: 'Patient',
};

const FALLBACK_LAYOUT: PdfLayoutConfig = {
  mode: 'sections',
  title: 'Document',
  showPatientHeader: true,
  showPageFooter: true,
  sections: [],
};

const FALLBACK_SCHEMA: DocResponseSchema = { fields: [] };

export function toDraft(item: DocFormatItem): DocFormatDraft {
  return {
    name: item.name,
    shortName: item.shortName ?? '',
    description: item.description,
    categoryLabel: item.categoryLabel,
    bulletsText: item.bullets.join('\n'),
    fileName: item.fileName,
    aiPrompt: item.aiPrompt,
    styleNotes: item.styleNotes ?? '',
    exampleOutput: item.exampleOutput,
    pdfLayout: item.pdfLayout ?? { ...FALLBACK_LAYOUT, title: item.name },
    responseSchema: item.responseSchema ?? FALLBACK_SCHEMA,
    published: item.published,
  };
}

export function draftsEqual(a: DocFormatDraft, b: DocFormatDraft): boolean {
  return (
    a.name === b.name &&
    a.shortName === b.shortName &&
    a.description === b.description &&
    a.categoryLabel === b.categoryLabel &&
    a.bulletsText === b.bulletsText &&
    a.fileName === b.fileName &&
    a.aiPrompt === b.aiPrompt &&
    a.styleNotes === b.styleNotes &&
    a.exampleOutput === b.exampleOutput &&
    JSON.stringify(a.pdfLayout) === JSON.stringify(b.pdfLayout) &&
    JSON.stringify(a.responseSchema) === JSON.stringify(b.responseSchema) &&
    a.published === b.published
  );
}

export type { PdfLayoutConfig, PdfLayoutSection, DocResponseSchema, ResponseSchemaField };
