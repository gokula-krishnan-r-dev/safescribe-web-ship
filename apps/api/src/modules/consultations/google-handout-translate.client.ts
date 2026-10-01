import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v3 } from '@google-cloud/translate';
import {
  collapseTranslateBatch,
  isRetryableTranslateError,
  translateErrorSummary,
} from './google-handout-translate.util';

const DEFAULT_LOCATION = 'global';
const DEFAULT_MODEL = 'general/nmt';
const MAX_BATCH = 128;
const DEFAULT_TIMEOUT_MS = 15_000;
const RETRY_DELAY_MS = 400;

/**
 * Google Cloud Translation Advanced v3 — server-side only.
 * Default model is general/nmt (not Translation LLM until QA).
 */
@Injectable()
export class GoogleHandoutTranslateClient {
  private readonly logger = new Logger(GoogleHandoutTranslateClient.name);
  private client: v3.TranslationServiceClient | null = null;

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    return this.config.get<string>('TRANSLATION_ENABLED', 'true') !== 'false';
  }

  isConfigured(): boolean {
    if (!this.isEnabled()) return false;
    const projectId = this.projectId();
    const keyFile = (this.config.get<string>('GOOGLE_APPLICATION_CREDENTIALS') || '').trim();
    return Boolean(projectId || keyFile || process.env.GOOGLE_APPLICATION_CREDENTIALS);
  }

  modelId(): string {
    return (this.config.get<string>('GOOGLE_TRANSLATE_MODEL') || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
  }

  glossaryPrefix(): string {
    return (this.config.get<string>('GOOGLE_TRANSLATE_GLOSSARY_PREFIX') || '').trim();
  }

  glossaryVersion(): string {
    const prefix = this.glossaryPrefix();
    return prefix ? `${prefix}-v1` : '';
  }

  private projectId(): string {
    return (
      (this.config.get<string>('GOOGLE_CLOUD_PROJECT') || '').trim() ||
      (this.config.get<string>('GCS_PROJECT_ID') || '').trim()
    );
  }

  private location(): string {
    return (
      (this.config.get<string>('GOOGLE_TRANSLATE_LOCATION') || DEFAULT_LOCATION).trim() ||
      DEFAULT_LOCATION
    );
  }

  private timeoutMs(): number {
    const raw = Number(this.config.get<string>('GOOGLE_TRANSLATE_TIMEOUT_MS') || DEFAULT_TIMEOUT_MS);
    return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_TIMEOUT_MS;
  }

  private getClient(): v3.TranslationServiceClient {
    if (this.client) return this.client;
    const projectId = this.projectId() || undefined;
    const keyFilename =
      (this.config.get<string>('GOOGLE_APPLICATION_CREDENTIALS') || '').trim() || undefined;
    this.client = new v3.TranslationServiceClient({
      projectId,
      ...(keyFilename ? { keyFilename } : {}),
    });
    return this.client;
  }

  async translateTexts(texts: string[], targetLanguage: string): Promise<string[]> {
    if (!texts.length) return [];
    if (!this.isConfigured()) {
      throw new Error('Google Cloud Translation is not configured');
    }

    const { unique, expand } = collapseTranslateBatch(texts);
    if (!unique.length) return expand([]);

    const translatedUnique = await this.translateUnique(unique, targetLanguage);
    return expand(translatedUnique);
  }

  private async translateUnique(
    texts: string[],
    targetLanguage: string,
  ): Promise<string[]> {
    const projectId = this.projectId();
    const location = this.location();
    const parent = projectId
      ? `projects/${projectId}/locations/${location}`
      : undefined;
    if (!parent) {
      throw new Error('GOOGLE_CLOUD_PROJECT or GCS_PROJECT_ID is required for translation');
    }

    const modelId = this.modelId();
    const useCustomModel = modelId && modelId !== DEFAULT_MODEL;
    const glossaryPrefix = this.glossaryPrefix();
    const timeout = this.timeoutMs();
    const out: string[] = [];

    for (let i = 0; i < texts.length; i += MAX_BATCH) {
      const chunk = texts.slice(i, i + MAX_BATCH);
      const request = {
        parent,
        contents: chunk,
        mimeType: 'text/plain' as const,
        sourceLanguageCode: 'en',
        targetLanguageCode: targetLanguage,
        labels: {
          component: 'patient-handout',
          product: 'safescribe',
        },
        ...(useCustomModel ? { model: `${parent}/models/${modelId}` } : {}),
        ...(glossaryPrefix
          ? {
              glossaryConfig: {
                glossary: `${parent}/glossaries/${glossaryPrefix}-${targetLanguage}`,
                ignoreCase: true,
              },
            }
          : {}),
      };

      const [response] = await this.translateChunk(request, timeout, Boolean(glossaryPrefix));
      const translations = response.translations ?? [];
      if (translations.length !== chunk.length) {
        throw new Error('Google Translate returned a different number of segments');
      }
      for (const item of translations) {
        out.push(item.translatedText ?? '');
      }
    }

    this.logger.log(
      `Translated ${texts.length} unique handout unit(s) en→${targetLanguage} model=${modelId} location=${location}`,
    );
    return out;
  }

  private async translateChunk(
    request: Parameters<v3.TranslationServiceClient['translateText']>[0],
    timeout: number,
    allowGlossaryRetry: boolean,
  ) {
    const call = (next = request) =>
      this.getClient().translateText(next, { timeout });

    try {
      return await this.withTransientRetry(() => call());
    } catch (err) {
      this.logger.warn(
        `Cloud Translation request failed ${translateErrorSummary(err)} units=${request?.contents?.length ?? 0}`,
      );
      const message = err instanceof Error ? err.message : '';
      if (allowGlossaryRetry && /glossary/i.test(message)) {
        return this.withTransientRetry(() =>
          call({ ...request, glossaryConfig: undefined }),
        );
      }
      throw err;
    }
  }

  private async withTransientRetry<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      if (!isRetryableTranslateError(err)) throw err;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
      return fn();
    }
  }
}
