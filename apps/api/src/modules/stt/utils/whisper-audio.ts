import { toFile } from 'openai';
import {
  isWhisperAutoLanguage,
  normalizeWhisperLanguageCode,
  WHISPER_AUTO_LANGUAGE,
} from '@safescript/shared';
import { pcm16ToWav } from '../stt.types';
import type { ResolvedWhisperClient } from './whisper-client.util';

const TRANSCRIBE_PROMPT =
  'Clinical pharmacy consultation notes in clear English. Prefer complete sentences. Do not invent spoken punctuation commands.';

const TRANSLATE_PROMPT =
  'Clinical pharmacy consultation in clear English. Translate the spoken language into professional English sentences. Do not invent content.';

export interface WhisperAudioResult {
  rawTranscript: string;
  detectedLanguage?: string;
  model: string;
  translated: boolean;
}

function asText(result: unknown): string {
  if (typeof result === 'string') return result;
  if (result && typeof result === 'object' && 'text' in result) {
    return String((result as { text?: string }).text ?? '');
  }
  return '';
}

function detectedFrom(result: unknown): string | undefined {
  if (!result || typeof result !== 'object') return undefined;
  const lang = (result as { language?: string }).language;
  if (!lang) return undefined;
  const normalized = normalizeWhisperLanguageCode(lang);
  return normalized === WHISPER_AUTO_LANGUAGE ? undefined : normalized;
}

export function prepareWhisperAudio(params: {
  audio: Buffer;
  filename?: string;
  mimeType?: string;
}): { audio: Buffer; filename: string; mimeType: string } {
  let audio = params.audio;
  let filename = params.filename || 'dictation.wav';
  const mime = (params.mimeType || '').toLowerCase();

  if (
    mime.includes('octet-stream') ||
    mime.includes('pcm') ||
    filename.endsWith('.pcm') ||
    (!mime.includes('wav') &&
      !mime.includes('webm') &&
      !mime.includes('mpeg') &&
      !mime.includes('mp4') &&
      !mime.includes('mp3') &&
      !mime.includes('m4a') &&
      audio.length > 44 &&
      audio.toString('ascii', 0, 4) !== 'RIFF')
  ) {
    audio = pcm16ToWav(audio, 16_000, 1);
    filename = 'dictation.wav';
  }

  return {
    audio,
    filename,
    mimeType: filename.endsWith('.wav') ? 'audio/wav' : params.mimeType || 'audio/wav',
  };
}

/**
 * Transcribe in the source language, or translate speech into English.
 * Omitting `language` lets Whisper auto-detect (required for multilingual).
 */
export async function runWhisperAudio(params: {
  resolved: ResolvedWhisperClient;
  audio: Buffer;
  filename?: string;
  mimeType?: string;
  languageCode?: string;
  translateToEnglish?: boolean;
  prompt?: string;
}): Promise<WhisperAudioResult> {
  const prepared = prepareWhisperAudio(params);
  const file = await toFile(prepared.audio, prepared.filename, { type: prepared.mimeType });
  const { client, model } = params.resolved;
  const translate = Boolean(params.translateToEnglish);
  const language = isWhisperAutoLanguage(params.languageCode)
    ? translate
      ? undefined
      : 'en'
    : normalizeWhisperLanguageCode(params.languageCode);

  const supportsVerbose =
    model === 'whisper-1' ||
    model === 'whisper-large-v3' ||
    model === 'whisper-large-v3-turbo';
  const responseFormat = supportsVerbose ? 'verbose_json' : 'json';

  if (translate) {
    const result = await client.audio.translations.create({
      file,
      model,
      prompt: (params.prompt || TRANSLATE_PROMPT).slice(-800) || undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      response_format: responseFormat as any,
      temperature: 0,
    });
    return {
      rawTranscript: asText(result).replace(/\s+/g, ' ').trim(),
      detectedLanguage: detectedFrom(result) || language,
      model,
      translated: true,
    };
  }

  const result = await client.audio.transcriptions.create({
    file,
    model,
    ...(language ? { language } : {}),
    prompt: (params.prompt || TRANSCRIBE_PROMPT).slice(-800) || undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    response_format: responseFormat as any,
    temperature: 0,
  });

  return {
    rawTranscript: asText(result).replace(/\s+/g, ' ').trim(),
    detectedLanguage: detectedFrom(result) || language,
    model,
    translated: false,
  };
}
