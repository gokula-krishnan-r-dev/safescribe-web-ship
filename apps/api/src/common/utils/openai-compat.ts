/**
 * OpenAI Chat Completions compatibility helpers.
 *
 * GPT-5.x and o-series reasoning models reject custom `temperature`
 * (only the API default of 1 is allowed). Passing 0 / 0.2 / etc. returns HTTP 400.
 */

import type OpenAI from 'openai';

type ChatCreateParams = OpenAI.Chat.ChatCompletionCreateParamsNonStreaming;

export function supportsSamplingTemperature(model: string | null | undefined): boolean {
  const slug = (model || '').trim().toLowerCase();
  if (!slug) return false;
  if (slug.startsWith('gpt-5')) return false;
  if (slug.startsWith('o1') || slug.startsWith('o3') || slug.startsWith('o4')) {
    return false;
  }
  return true;
}

export function isUnsupportedTemperatureError(err: unknown): boolean {
  const body = (
    err instanceof Error ? err.message : typeof err === 'string' ? err : String(err)
  ).toLowerCase();
  return (
    body.includes('temperature') &&
    (body.includes('unsupported') || body.includes('does not support'))
  );
}

/**
 * Attach temperature only when the model supports sampling overrides.
 */
export function withOptionalTemperature(
  params: ChatCreateParams,
  temperature: number | null | undefined,
): ChatCreateParams {
  const next: ChatCreateParams = { ...params };
  if (temperature != null && supportsSamplingTemperature(params.model)) {
    next.temperature = temperature;
  } else {
    delete next.temperature;
  }
  return next;
}
