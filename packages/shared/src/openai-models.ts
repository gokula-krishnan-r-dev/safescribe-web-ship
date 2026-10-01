/**
 * Canonical OpenAI chat models for SafeScribe (API + Super Admin UI).
 * Keep IDs exact — these are passed to the OpenAI Chat Completions API.
 */

export const DEFAULT_OPENAI_MODEL = 'gpt-5.6-luna';
export const DEFAULT_OPENAI_FAST_MODEL = 'gpt-5.6-luna';

export type OpenAiChatModelId =
  | 'gpt-5.6-luna'
  | 'gpt-5.6-terra'
  | 'gpt-5.6-sol'
  | 'gpt-4o'
  | 'gpt-4o-mini';

export type OpenAiModelRole = 'primary' | 'fast';

export interface OpenAiChatModelOption {
  id: OpenAiChatModelId;
  /** Short label for dropdowns */
  label: string;
  /** One-line guidance under the select */
  description: string;
  /** Which Super Admin slots this model is recommended for */
  roles: OpenAiModelRole[];
  /** Hide from preferred lists but keep selectable for legacy installs */
  legacy?: boolean;
}

export const OPENAI_CHAT_MODELS: readonly OpenAiChatModelOption[] = [
  {
    id: 'gpt-5.6-luna',
    label: 'GPT-5.6 Luna',
    description: 'Fast, cost-efficient — platform default',
    roles: ['primary', 'fast'],
  },
  {
    id: 'gpt-5.6-terra',
    label: 'GPT-5.6 Terra',
    description: 'Balanced intelligence and cost',
    roles: ['primary', 'fast'],
  },
  {
    id: 'gpt-5.6-sol',
    label: 'GPT-5.6 Sol',
    description: 'Flagship reasoning for complex clinical work',
    roles: ['primary'],
  },
  {
    id: 'gpt-4o',
    label: 'GPT-4o (legacy)',
    description: 'Previous-generation primary model',
    roles: ['primary'],
    legacy: true,
  },
  {
    id: 'gpt-4o-mini',
    label: 'GPT-4o mini (legacy)',
    description: 'Previous-generation fast model',
    roles: ['fast'],
    legacy: true,
  },
] as const;

export const OPENAI_CHAT_MODEL_IDS: readonly OpenAiChatModelId[] = OPENAI_CHAT_MODELS.map(
  (m) => m.id,
);

/**
 * Older built-in defaults — used to auto-upgrade platform settings once
 * when the install still carries a previous platform default.
 */
export const LEGACY_OPENAI_MODEL_DEFAULTS = [
  'gpt-5.6-terra',
  'gpt-4o',
  'gpt-4',
  'gpt-4-turbo',
  'gpt-4-turbo-preview',
] as const;
export const LEGACY_OPENAI_FAST_MODEL_DEFAULTS = [
  'gpt-5.6-terra',
  'gpt-4o-mini',
  'gpt-3.5-turbo',
] as const;

export function isOpenAiChatModelId(value: string): value is OpenAiChatModelId {
  return (OPENAI_CHAT_MODEL_IDS as readonly string[]).includes(value);
}

export function getOpenAiChatModel(id: string): OpenAiChatModelOption | undefined {
  return OPENAI_CHAT_MODELS.find((m) => m.id === id);
}

export function openAiModelSelectOptions(role?: OpenAiModelRole): Array<{
  value: string;
  label: string;
}> {
  const models = [...OPENAI_CHAT_MODELS];
  if (role) {
    models.sort((a, b) => {
      const aFit = a.roles.includes(role) && !a.legacy ? 0 : a.legacy ? 2 : 1;
      const bFit = b.roles.includes(role) && !b.legacy ? 0 : b.legacy ? 2 : 1;
      return aFit - bFit;
    });
  }
  return models.map((m) => ({
    value: m.id,
    label: m.label,
  }));
}
