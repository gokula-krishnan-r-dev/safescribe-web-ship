export type AiPromptCategory =
  | 'pathway'
  | 'consultation'
  | 'documentation'
  | 'clinical-judgment'
  | 'labs'
  | 'fallback';

export interface AiSystemPromptItem {
  id: string;
  key: string;
  name: string;
  description: string | null;
  category: AiPromptCategory | string;
  content: string;
  defaultContent: string;
  modelHint: string | null;
  sourceFile: string | null;
  sortOrder: number;
  isModified: boolean;
  updatedAt: string;
  updatedById: string | null;
}

export interface AiPlatformSettingsDto {
  openaiModel: string;
  openaiFastModel: string;
  openaiEmbeddingModel: string;
  temperatureDefault: number;
  maxRetries: number;
  timeoutSeconds: number;
  updatedAt?: string;
}

export interface AiConfigMeta {
  openaiApiKeyConfigured: boolean;
  openaiApiKeyMasked: string | null;
  aiEngineConfigured: boolean;
  aiEngineUrl: string | null;
  envDefaults: {
    openaiModel: string;
    openaiFastModel: string;
  };
  availableModels?: Array<{
    id: string;
    label: string;
    description: string;
    roles: Array<'primary' | 'fast'>;
    legacy: boolean;
  }>;
}

export interface AiConfigCatalog {
  prompts: AiSystemPromptItem[];
  settings: AiPlatformSettingsDto;
  meta: AiConfigMeta;
}

export interface ApplyAiConfigPayload {
  prompts?: { key: string; content: string }[];
  /** Only DTO fields — never send updatedAt / server metadata */
  settings?: {
    openaiModel?: string;
    openaiFastModel?: string;
    openaiEmbeddingModel?: string;
    temperatureDefault?: number;
    maxRetries?: number;
    timeoutSeconds?: number;
  };
}

export const HIDDEN_PROMPT_KEYS = new Set(['DOCUMENTATION_PACKAGE']);

export const CATEGORY_LABELS: Record<string, string> = {
  pathway: 'Pathway extraction',
  consultation: 'Consultation',
  documentation: 'Document Session',
  'clinical-judgment': 'Clinical Judgment',
  labs: 'Lab reports',
  fallback: 'Fallback / NestJS',
};
