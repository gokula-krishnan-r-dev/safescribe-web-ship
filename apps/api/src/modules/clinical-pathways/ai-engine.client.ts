/**
 * HTTP client for the Python AI Engine (apps/ai-engine).
 *
 * If AI_ENGINE_URL is set in the environment, this client proxies all
 * document parsing and extraction work to the Python service.
 * If the env var is absent the client throws a "not configured" error
 * and the caller (ClinicalPathwaysService) falls back to the built-in
 * Node.js pipeline.
 */
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ExtractedKnowledge } from './ai-pipeline.service';

export interface AiEngineParseResult {
  text: string;
  page_count: number;
  word_count: number;
  file_type: string;
  metadata: Record<string, unknown>;
}

export interface AiEngineExtractResult {
  knowledge: ExtractedKnowledge;
  chunks_processed: number;
  word_count: number;
  page_count: number;
  file_type: string;
  duration_ms: number;
}

export interface DocumentClassificationResult {
  condition: string;
  documentType: string;
  authority: string | null;
  publicationYear: number | null;
  evidenceLevel: string | null;
  documentFamily: string | null;
  purpose: string[];
  suggestedRole: 'PRIMARY' | 'SUPPORTING' | 'REFERENCE_ONLY';
  confidence: number;
  rationale: string;
  duration_ms?: number;
}

export interface DocumentOverlapResult {
  sourceDocumentId: string;
  targetDocumentId: string;
  overlapPercent: number;
  recommendedRole: 'PRIMARY' | 'SUPPORTING' | 'REFERENCE_ONLY';
  rationale: string;
}

export interface ClinicalConceptDto {
  category: string;
  label: string;
  description?: string | null;
  importance?: string | null;
  metadata?: Record<string, unknown>;
  confidence?: number;
  aliases?: string[];
  sources: Array<{
    documentId: string;
    sourceExcerpt?: string | null;
    sourcePage?: number | null;
  }>;
}

const AI_ENGINE_SERVICE_ID = 'safescribe-ai-engine';
/** Cache positive health for this long; negative results retry sooner. */
const HEALTH_OK_TTL_MS = 30_000;
const HEALTH_FAIL_TTL_MS = 5_000;

@Injectable()
export class AiEngineClient {
  private readonly logger = new Logger(AiEngineClient.name);
  /** Mutable so local-dev can recover from a stale :8000 URL. */
  private baseUrl: string | undefined;
  /** Default timeout for short AI calls (parse, classify, consult). */
  private readonly timeout: number;
  /**
   * Longer timeout for pathway concept extract / generate — multi-doc OpenAI work
   * often exceeds 3 minutes when chunks run sequentially.
   */
  private readonly longTimeout: number;
  private healthCache: { ok: boolean; checkedAt: number; detail?: string } | null =
    null;
  private healthInflight: Promise<boolean> | null = null;
  private recoveredDevPort = false;

  constructor(private config: ConfigService) {
    this.baseUrl = this.config.get<string>('AI_ENGINE_URL')?.replace(/\/$/, '');
    const configured = Number(this.config.get('AI_ENGINE_TIMEOUT_MS') ?? 420_000);
    this.timeout = Number.isFinite(configured) && configured > 0 ? configured : 420_000;
    const longConfigured = Number(this.config.get('AI_ENGINE_LONG_TIMEOUT_MS') ?? 0);
    // At least 10 minutes for pathway extract/generate, or 2× default if higher.
    this.longTimeout = Math.max(
      Number.isFinite(longConfigured) && longConfigured > 0 ? longConfigured : 0,
      this.timeout * 2,
      600_000,
    );

    if (this.baseUrl) {
      this.logger.log(
        `AI Engine configured at ${this.baseUrl} (timeout=${this.timeout}ms, long=${this.longTimeout}ms)`,
      );
      // Non-blocking probe so misconfigured ports (e.g. another app on :8000) surface early.
      void this.pingHealthy().then((ok) => {
        if (!ok) {
          this.logger.warn(
            `AI Engine at ${this.baseUrl} is not reachable or is not SafeScribe ` +
              `(expected GET /health → serviceId="${AI_ENGINE_SERVICE_ID}"). ` +
              `Run: make ai-dev (default http://localhost:8010) and set AI_ENGINE_URL accordingly.`,
          );
        } else {
          this.logger.log(`AI Engine ready at ${this.baseUrl}`);
        }
      });
    } else {
      this.logger.log('AI_ENGINE_URL not set — using built-in Node.js pipeline');
    }
  }

  /** True when AI_ENGINE_URL is set (does not guarantee the process is up). */
  get isAvailable(): boolean {
    return Boolean(this.baseUrl);
  }

  /** Last known readiness detail for logs / API soft-fail messages. */
  get lastHealthDetail(): string | undefined {
    return this.healthCache?.detail;
  }

  /**
   * Cached readiness: confirms the URL points at SafeScribe AI Engine, not
   * another local process that happens to listen on the same port.
   */
  async pingHealthy(force = false): Promise<boolean> {
    if (!this.baseUrl) return false;
    const now = Date.now();
    if (!force && this.healthCache) {
      const ttl = this.healthCache.ok ? HEALTH_OK_TTL_MS : HEALTH_FAIL_TTL_MS;
      if (now - this.healthCache.checkedAt < ttl) return this.healthCache.ok;
    }
    if (this.healthInflight) return this.healthInflight;

    this.healthInflight = this.probeHealth(this.baseUrl)
      .then(async (result) => {
        if (!result.ok) {
          await this.tryRecoverStaleLocalPort();
          if (this.baseUrl) {
            result = await this.probeHealth(this.baseUrl);
          }
        }
        this.healthCache = { ...result, checkedAt: Date.now() };
        return result.ok;
      })
      .finally(() => {
        this.healthInflight = null;
      });
    return this.healthInflight;
  }

  /**
   * Local DX: if AI_ENGINE_URL still points at :8000 (often occupied by unrelated
   * proxies) but SafeScribe is healthy on :8010, switch for this process lifetime.
   */
  private async tryRecoverStaleLocalPort(): Promise<void> {
    if (this.recoveredDevPort || !this.baseUrl) return;
    if (process.env.NODE_ENV === 'production') return;
    const match = this.baseUrl.match(/^(https?:\/\/(?:localhost|127\.0\.0\.1)):8000$/i);
    if (!match) return;
    const alt = `${match[1]}:8010`;
    const altProbe = await this.probeHealth(alt);
    if (!altProbe.ok) return;
    this.logger.warn(
      `AI_ENGINE_URL ${this.baseUrl} is not SafeScribe; auto-switching to ${alt} for this process. Update .env to AI_ENGINE_URL=${alt} and restart.`,
    );
    this.baseUrl = alt;
    this.recoveredDevPort = true;
    this.healthCache = null;
  }

  private async probeHealth(
    url: string,
  ): Promise<{ ok: boolean; detail?: string }> {
    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`${url}/health`, {
        signal: controller.signal,
      });
      clearTimeout(id);
      const text = await res.text().catch(() => '');
      if (!res.ok) {
        return {
          ok: false,
          detail: `Health HTTP ${res.status} from ${url}/health (${text.slice(0, 120)})`,
        };
      }
      let body: { serviceId?: string; service?: string; status?: string } = {};
      try {
        body = JSON.parse(text) as typeof body;
      } catch {
        return {
          ok: false,
          detail: `AI_ENGINE_URL points to a non-JSON /health response — wrong process on that port?`,
        };
      }
      const idOk =
        body.serviceId === AI_ENGINE_SERVICE_ID ||
        /safescribe/i.test(String(body.service ?? ''));
      if (!idOk) {
        return {
          ok: false,
          detail: `Unexpected AI engine identity at ${url} (got serviceId=${body.serviceId ?? 'missing'}).`,
        };
      }
      return { ok: true };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        detail: `Cannot reach AI engine at ${url}: ${msg}`,
      };
    }
  }

  /** Parse document text without AI (fast). */
  async parse(
    buffer: Buffer,
    filename: string,
    mimetype: string,
  ): Promise<AiEngineParseResult> {
    this.assertAvailable();

    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(buffer)], { type: mimetype }), filename);

    return this.post<AiEngineParseResult>('/api/v1/parse', form);
  }

  /** Full RAG extraction from a single uploaded file. */
  async extract(
    buffer: Buffer,
    filename: string,
    mimetype: string,
    pathwayName: string,
    condition: string,
  ): Promise<AiEngineExtractResult> {
    this.assertAvailable();

    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(buffer)], { type: mimetype }), filename);
    form.append('pathway_name', pathwayName);
    form.append('condition', condition);

    const res = await this.post<AiEngineExtractResult>('/api/v1/extract', form);

    this.logger.log(
      `Python AI Engine: ${res.page_count}p · ${res.word_count}w · ` +
        `${res.chunks_processed} chunks · ${res.duration_ms.toFixed(0)}ms`,
    );

    return res;
  }

  /** RAG extraction over already-parsed combined text (multi-document pathways). */
  async extractText(
    text: string,
    pathwayName: string,
    condition: string,
    meta?: { wordCount?: number; pageCount?: number },
  ): Promise<AiEngineExtractResult> {
    this.assertAvailable();

    const res = await this.postJson<AiEngineExtractResult>('/api/v1/extract-text', {
      text,
      pathway_name: pathwayName,
      condition,
      word_count: meta?.wordCount,
      page_count: meta?.pageCount,
    });

    this.logger.log(
      `Python AI Engine (combined text): ${res.page_count}p · ${res.word_count}w · ` +
        `${res.chunks_processed} chunks · ${res.duration_ms.toFixed(0)}ms · ` +
        `Q=${res.knowledge?.questions?.length ?? 0} T=${res.knowledge?.treatments?.length ?? 0} ` +
        `R=${res.knowledge?.rules?.length ?? 0}`,
    );

    return res;
  }

  async classifyDocument(
    text: string,
    fileName: string,
    condition: string,
  ): Promise<DocumentClassificationResult> {
    this.assertAvailable();
    return this.postJson<DocumentClassificationResult>('/api/v1/pathway/classify', {
      text,
      file_name: fileName,
      condition,
    });
  }

  async analyzeOverlap(
    condition: string,
    documents: Array<{
      id: string;
      fileName: string;
      documentType?: string | null;
      suggestedRole?: string | null;
      authority?: string | null;
      textExcerpt: string;
    }>,
  ): Promise<{ overlaps: DocumentOverlapResult[]; duration_ms?: number }> {
    this.assertAvailable();
    return this.postJson('/api/v1/pathway/analyze-overlap', { condition, documents });
  }

  async extractConcepts(
    pathwayName: string,
    condition: string,
    documents: Array<{ id: string; fileName: string; role?: string | null; text: string }>,
  ): Promise<{ concepts: ClinicalConceptDto[]; count: number; duration_ms?: number }> {
    this.assertAvailable();
    return this.postJson(
      '/api/v1/pathway/extract-concepts',
      {
        pathway_name: pathwayName,
        condition,
        documents,
      },
      this.longTimeout,
    );
  }

  async generateFromConcepts(
    pathwayName: string,
    condition: string,
    concepts: ClinicalConceptDto[],
    limits?: Record<string, number>,
  ): Promise<AiEngineExtractResult> {
    this.assertAvailable();
    const res = await this.postJson<{
      knowledge: ExtractedKnowledge;
      chunks_processed: number;
      duration_ms: number;
    }>(
      '/api/v1/pathway/generate-from-concepts',
      {
        pathway_name: pathwayName,
        condition,
        concepts,
        limits,
      },
      this.longTimeout,
    );

    this.logger.log(
      `Generated pathway from ${concepts.length} concepts · ` +
        `Q=${res.knowledge?.questions?.length ?? 0} ` +
        `R=${res.knowledge?.rules?.length ?? 0} ` +
        `T=${res.knowledge?.treatments?.length ?? 0} ` +
        `C=${res.knowledge?.counselling?.length ?? 0} ` +
        `RF=${res.knowledge?.redFlags?.length ?? 0} ` +
        `DDx=${res.knowledge?.differentials?.length ?? 0} · ` +
        `${res.duration_ms}ms`,
    );

    return {
      knowledge: res.knowledge,
      chunks_processed: res.chunks_processed ?? 0,
      word_count: 0,
      page_count: 0,
      file_type: 'concepts',
      duration_ms: res.duration_ms ?? 0,
    };
  }

  /** Health check — resolves true if SafeScribe AI Engine is reachable. */
  async healthCheck(): Promise<boolean> {
    return this.pingHealthy(true);
  }

  /** Make a JSON POST request to the AI Engine — used by consultation AI endpoints. */
  async postJson<T>(path: string, body: unknown, timeoutMs?: number): Promise<T> {
    this.assertAvailable();
    const healthy = await this.pingHealthy();
    if (!healthy) {
      throw new Error(
        this.healthCache?.detail ??
          `AI Engine is not ready at ${this.baseUrl}. Start it with: make ai-dev`,
      );
    }
    const limit = timeoutMs ?? this.timeout;
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), limit);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) {
        // Invalidate cache on route miss — often means stale process / wrong port.
        if (res.status === 404) {
          this.healthCache = {
            ok: false,
            checkedAt: Date.now(),
            detail: `AI route missing: ${path}. Restart the AI engine after deploy (make ai-dev).`,
          };
        }
        throw new Error(this.formatHttpError(res.status, await res.text().catch(() => ''), path));
      }
      return res.json() as Promise<T>;
    } catch (err) {
      if (err instanceof Error && (err.name === 'AbortError' || /aborted/i.test(err.message))) {
        throw new Error(
          `AI service timed out after ${Math.round(limit / 1000)}s on ${path}. ` +
            `Concept extraction for multi-document pathways can take several minutes — ` +
            `increase AI_ENGINE_TIMEOUT_MS / AI_ENGINE_LONG_TIMEOUT_MS, or retry.`,
        );
      }
      throw err;
    } finally {
      clearTimeout(id);
    }
  }

  private assertAvailable(): void {
    if (!this.baseUrl) {
      throw new Error('Assist service is not configured. Please contact your admin.');
    }
  }

  private formatHttpError(status: number, text: string, path: string): string {
    let message = text;
    try {
      message = JSON.parse(text)?.detail ?? text;
    } catch {
      /* keep raw */
    }
    if (status === 404) {
      return (
        `AI service error (404): ${path} not found. ` +
        `The AI engine may need a restart after deploy. (${typeof message === 'string' ? message : 'Not Found'})`
      );
    }
    return `AI service error (${status}): ${typeof message === 'string' ? message : JSON.stringify(message)}`;
  }

  private async post<T>(path: string, body: FormData): Promise<T> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), this.timeout);

    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: 'POST',
        body,
        signal: controller.signal,
      });

      if (!res.ok) {
        throw new Error(this.formatHttpError(res.status, await res.text().catch(() => ''), path));
      }

      return res.json() as Promise<T>;
    } finally {
      clearTimeout(id);
    }
  }
}
