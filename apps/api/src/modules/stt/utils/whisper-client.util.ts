/**
 * Resolve OpenAI SDK client + model name for Whisper-family STT.
 *
 * - OpenAI-native models (whisper-1, gpt-4o-transcribe*) use OPENAI_API_KEY.
 * - Large v3 models use Groq's OpenAI-compatible API (whisper-large-v3 not hosted by OpenAI).
 */
import OpenAI from 'openai';
import type { ConfigService } from '@nestjs/config';
import {
  getSttWhisperModelMeta,
  resolveSttWhisperModelId,
  type SttWhisperModelId,
} from '@safescript/shared';

const GROQ_OPENAI_BASE = 'https://api.groq.com/openai/v1';

export interface ResolvedWhisperClient {
  client: OpenAI;
  model: SttWhisperModelId;
  backend: 'openai' | 'groq';
  label: string;
}

export function resolveWhisperClient(
  config: ConfigService,
  modelOverride?: string | null,
): ResolvedWhisperClient {
  const envModel = config.get<string>('STT_WHISPER_MODEL', 'whisper-1');
  const model = resolveSttWhisperModelId(modelOverride || envModel);
  const meta = getSttWhisperModelMeta(model)!;
  const backend = meta.backend;

  if (backend === 'groq') {
    const apiKey =
      (config.get<string>('STT_GROQ_API_KEY') || '').trim() ||
      (config.get<string>('GROQ_API_KEY') || '').trim();
    if (!apiKey) {
      throw new Error(
        'Whisper Large v3 requires STT_GROQ_API_KEY (or GROQ_API_KEY). OpenAI does not host whisper-large-v3.',
      );
    }
    const baseURL =
      (config.get<string>('STT_GROQ_BASE_URL') || '').trim() || GROQ_OPENAI_BASE;
    return {
      client: new OpenAI({ apiKey, baseURL, timeout: 120_000, maxRetries: 1 }),
      model,
      backend: 'groq',
      label: meta.label,
    };
  }

  const apiKey = (config.get<string>('OPENAI_API_KEY') || '').trim();
  if (!apiKey) {
    throw new Error('Speech-to-text is not configured (provider API key)');
  }
  const baseURL = (config.get<string>('STT_OPENAI_BASE_URL') || '').trim() || undefined;
  return {
    client: new OpenAI({
      apiKey,
      ...(baseURL ? { baseURL } : {}),
      timeout: 120_000,
      maxRetries: 1,
    }),
    model,
    backend: 'openai',
    label: meta.label,
  };
}

export function whisperTransportConfigured(
  config: ConfigService,
  modelOverride?: string | null,
): boolean {
  const envModel = config.get<string>('STT_WHISPER_MODEL', 'whisper-1');
  const model = resolveSttWhisperModelId(modelOverride || envModel);
  const meta = getSttWhisperModelMeta(model);
  if (!meta) return false;
  if (meta.backend === 'groq') {
    const enabled = config.get<string>('STT_WHISPER_ENABLED', 'true') !== 'false';
    const key =
      (config.get<string>('STT_GROQ_API_KEY') || '').trim() ||
      (config.get<string>('GROQ_API_KEY') || '').trim();
    return enabled && Boolean(key);
  }
  const enabled = config.get<string>('STT_WHISPER_ENABLED', 'true') !== 'false';
  const key = (config.get<string>('OPENAI_API_KEY') || '').trim();
  return enabled && Boolean(key);
}

function groqKey(config: ConfigService): string {
  return (
    (config.get<string>('STT_GROQ_API_KEY') || '').trim() ||
    (config.get<string>('GROQ_API_KEY') || '').trim()
  );
}

function openaiKey(config: ConfigService): string {
  return (config.get<string>('OPENAI_API_KEY') || '').trim();
}

/**
 * gpt-4o-transcribe* cannot translate. Prefer the current Whisper backend's
 * translation-capable model, then OpenAI whisper-1, then Groq Large v3.
 */
export function resolveTranslationWhisperClient(
  config: ConfigService,
  modelOverride?: string | null,
  opts?: { preferFast?: boolean },
): ResolvedWhisperClient {
  const requested = resolveSttWhisperModelId(
    modelOverride || config.get<string>('STT_WHISPER_MODEL', 'whisper-1'),
  );
  const requestedMeta = getSttWhisperModelMeta(requested);

  if (requestedMeta?.backend === 'groq' && groqKey(config)) {
    const fast = opts?.preferFast ? 'whisper-large-v3-turbo' : 'whisper-large-v3';
    return resolveWhisperClient(config, fast);
  }

  if (requested === 'whisper-1' && openaiKey(config)) {
    return resolveWhisperClient(config, 'whisper-1');
  }

  if (openaiKey(config)) {
    return resolveWhisperClient(config, 'whisper-1');
  }

  if (groqKey(config)) {
    return resolveWhisperClient(
      config,
      opts?.preferFast ? 'whisper-large-v3-turbo' : 'whisper-large-v3',
    );
  }

  throw new Error(
    'Speech translation requires OPENAI_API_KEY (whisper-1) or STT_GROQ_API_KEY (Whisper Large v3)',
  );
}

export function translationWhisperConfigured(config: ConfigService): boolean {
  const enabled = config.get<string>('STT_WHISPER_ENABLED', 'true') !== 'false';
  if (!enabled) return false;
  return Boolean(openaiKey(config) || groqKey(config));
}
