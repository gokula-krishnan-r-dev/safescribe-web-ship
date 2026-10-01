/**
 * Speech-to-text provider + model catalog (API + web).
 */

export type SttProviderId = 'whisper' | 'google-medical';

/** OpenAI-hosted or Groq-hosted Whisper-family transcription models. */
export type SttWhisperModelId =
  | 'whisper-1'
  | 'gpt-4o-transcribe'
  | 'gpt-4o-mini-transcribe'
  | 'whisper-large-v3'
  | 'whisper-large-v3-turbo';

export type SttWhisperBackend = 'openai' | 'groq';

export interface SttProviderMeta {
  id: SttProviderId;
  label: string;
  description: string;
  /** True when optimized for clinical terminology */
  medicalOptimized: boolean;
  supportsStreaming: boolean;
}

export interface SttWhisperModelMeta {
  id: SttWhisperModelId;
  label: string;
  description: string;
  /** openai = OpenAI Audio API; groq = Groq OpenAI-compatible Whisper large-v3 */
  backend: SttWhisperBackend;
  /** Relative quality for clinical terms (higher = better quality) */
  quality: 'standard' | 'high' | 'highest';
  /** Rough cost vs whisper-1 baseline for operators */
  costNote: string;
  recommendedForMedical?: boolean;
}

export const STT_PROVIDERS: readonly SttProviderMeta[] = [
  {
    id: 'whisper',
    label: 'Whisper',
    description: 'Whisper-family dictation (hosted or Large v3 via Groq)',
    medicalOptimized: true,
    supportsStreaming: true,
  },
  {
    id: 'google-medical',
    label: 'Google Medical',
    description: 'Google Cloud Speech-to-Text medical dictation model',
    medicalOptimized: true,
    supportsStreaming: true,
  },
] as const;

export const STT_WHISPER_MODELS: readonly SttWhisperModelMeta[] = [
  {
    id: 'whisper-1',
    label: 'Whisper v1',
    description: 'Legacy Whisper — current SafeScribe default',
    backend: 'openai',
    quality: 'standard',
    costNote: '~$0.006/min',
  },
  {
    id: 'gpt-4o-mini-transcribe',
    label: 'GPT-4o Mini Transcribe',
    description: 'Lower-cost transcription with solid accuracy',
    backend: 'openai',
    quality: 'standard',
    costNote: '~$0.003/min',
  },
  {
    id: 'gpt-4o-transcribe',
    label: 'GPT-4o Transcribe',
    description: 'Higher-accuracy transcription (general domain)',
    backend: 'openai',
    quality: 'high',
    costNote: '~$0.006/min',
  },
  {
    id: 'whisper-large-v3',
    label: 'Whisper Large v3',
    description:
      'Whisper Large v3 via Groq — highest open Whisper accuracy; strong for technical terms',
    backend: 'groq',
    quality: 'highest',
    costNote: 'Groq Whisper Large v3 pricing (per audio minutes)',
    recommendedForMedical: true,
  },
  {
    id: 'whisper-large-v3-turbo',
    label: 'Whisper Large v3 Turbo',
    description: 'Faster Large v3 variant via Groq when latency matters more',
    backend: 'groq',
    quality: 'high',
    costNote: 'Groq Whisper Large v3 Turbo pricing',
    recommendedForMedical: true,
  },
] as const;

export const DEFAULT_STT_PROVIDER: SttProviderId = 'whisper';
export const DEFAULT_STT_WHISPER_MODEL: SttWhisperModelId = 'whisper-1';

/** Models that support Whisper speech→English translation. */
export const WHISPER_TRANSLATION_MODELS: readonly SttWhisperModelId[] = [
  'whisper-1',
  'whisper-large-v3',
  'whisper-large-v3-turbo',
] as const;

export function whisperModelSupportsTranslation(id: string | undefined | null): boolean {
  return Boolean(id && (WHISPER_TRANSLATION_MODELS as readonly string[]).includes(id));
}

export function isSttProviderId(value: string): value is SttProviderId {
  return value === 'whisper' || value === 'google-medical';
}

export function isSttWhisperModelId(value: string): value is SttWhisperModelId {
  return STT_WHISPER_MODELS.some((m) => m.id === value);
}

export function getSttWhisperModelMeta(
  id: string | undefined | null,
): SttWhisperModelMeta | undefined {
  if (!id) return undefined;
  return STT_WHISPER_MODELS.find((m) => m.id === id);
}

export function resolveSttWhisperModelId(
  value: string | undefined | null,
): SttWhisperModelId {
  if (value && isSttWhisperModelId(value)) return value;
  return DEFAULT_STT_WHISPER_MODEL;
}
