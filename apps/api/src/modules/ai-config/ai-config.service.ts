import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { Request } from 'express';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/redis/redis.service';
import { AuditService } from '@/modules/audit/audit.service';
import type { RequestUser } from '@/common/decorators/auth.decorator';
import { DEFAULT_AI_PROMPTS, getDefaultPrompt } from './ai-config.defaults';
import { ApplyAiConfigDto } from './dto/ai-config.dto';
import {
  DEFAULT_OPENAI_FAST_MODEL,
  DEFAULT_OPENAI_MODEL,
  LEGACY_OPENAI_FAST_MODEL_DEFAULTS,
  LEGACY_OPENAI_MODEL_DEFAULTS,
  OPENAI_CHAT_MODELS,
} from '@safescript/shared';

function isMissingSchemaError(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    (err.code === 'P2021' || err.code === 'P2022')
  );
}

const CACHE_PROMPTS_KEY = 'ai:config:prompts';
const CACHE_SETTINGS_KEY = 'ai:config:settings';
const CACHE_TTL_SECONDS = 3600;

export interface RuntimeAiSettings {
  openaiModel: string;
  openaiFastModel: string;
  openaiEmbeddingModel: string;
  temperatureDefault: number;
  maxRetries: number;
  timeoutSeconds: number;
}

@Injectable()
export class AiConfigService implements OnModuleInit {
  private readonly logger = new Logger(AiConfigService.name);
  private memoryPrompts = new Map<string, string>();
  private memorySettings: RuntimeAiSettings | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    try {
      await this.ensureSeeded();
      await this.refreshLocalCache();
    } catch (err) {
      // Never take down the API for AI catalog seed/schema lag — use code defaults.
      this.loadDefaultsIntoMemory();
      if (isMissingSchemaError(err)) {
        this.logger.error(
          'Assist config tables are missing. Run `pnpm db:migrate:deploy` (or `make db-migrate-deploy`), then restart. Using in-memory defaults until then.',
        );
      } else {
        this.logger.error(
          `AI config boot seed failed; using in-memory defaults. ${err instanceof Error ? err.message : err}`,
        );
      }
    }

    await this.syncToAiEngine().catch((err) => {
      this.logger.warn(`AI Engine sync on boot skipped: ${err instanceof Error ? err.message : err}`);
    });
  }

  // ─── Public API (admin) ───────────────────────────────────────────────────

  async getCatalog() {
    try {
      await this.ensureSeeded();
    } catch (err) {
      if (isMissingSchemaError(err)) {
        throw new ServiceUnavailableException(
          'Assist config database tables are missing. Apply migrations with `pnpm db:migrate:deploy` and restart the API.',
        );
      }
      throw err;
    }

    const [prompts, settings] = await Promise.all([
      this.prisma.aiSystemPrompt.findMany({ orderBy: { sortOrder: 'asc' } }),
      this.getOrCreateSettings(),
    ]);

    const apiKey = this.config.get<string>('OPENAI_API_KEY') ?? '';
    const engineUrl = this.config.get<string>('AI_ENGINE_URL');

    return {
      prompts: prompts.map((p) => ({
        id: p.id,
        key: p.key,
        name: p.name,
        description: p.description,
        category: p.category,
        content: p.content,
        defaultContent: p.defaultContent,
        modelHint: p.modelHint,
        sourceFile: p.sourceFile,
        sortOrder: p.sortOrder,
        isModified: p.content !== p.defaultContent,
        updatedAt: p.updatedAt,
        updatedById: p.updatedById,
      })),
      settings: {
        openaiModel: settings.openaiModel,
        openaiFastModel: settings.openaiFastModel,
        openaiEmbeddingModel: settings.openaiEmbeddingModel,
        temperatureDefault: settings.temperatureDefault,
        maxRetries: settings.maxRetries,
        timeoutSeconds: settings.timeoutSeconds,
        updatedAt: settings.updatedAt,
      },
      meta: {
        openaiApiKeyConfigured: Boolean(apiKey),
        openaiApiKeyMasked: apiKey ? this.maskSecret(apiKey) : null,
        aiEngineConfigured: Boolean(engineUrl),
        aiEngineUrl: engineUrl ?? null,
        envDefaults: {
          openaiModel: this.resolvePreferredModel(
            this.config.get<string>('OPENAI_MODEL', DEFAULT_OPENAI_MODEL)!,
            'primary',
          ),
          openaiFastModel: this.resolvePreferredModel(
            this.config.get<string>('OPENAI_FAST_MODEL', DEFAULT_OPENAI_FAST_MODEL)!,
            'fast',
          ),
        },
        availableModels: OPENAI_CHAT_MODELS.map((m) => ({
          id: m.id,
          label: m.label,
          description: m.description,
          roles: [...m.roles],
          legacy: Boolean(m.legacy),
        })),
      },
    };
  }

  async apply(dto: ApplyAiConfigDto, user: RequestUser, req: Request) {
    if (!dto.prompts?.length && !dto.settings) {
      throw new BadRequestException('Nothing to apply. Provide prompts and/or settings.');
    }

    const previous: Record<string, unknown> = {};
    const next: Record<string, unknown> = {};

    if (dto.prompts?.length) {
      for (const item of dto.prompts) {
        const existing = await this.prisma.aiSystemPrompt.findUnique({ where: { key: item.key } });
        if (!existing) {
          throw new NotFoundException(`Unknown prompt key: ${item.key}`);
        }
        previous[item.key] = { contentLength: existing.content.length };
        const updated = await this.prisma.aiSystemPrompt.update({
          where: { key: item.key },
          data: {
            content: item.content.trim(),
            updatedById: user.id,
          },
        });
        next[item.key] = { contentLength: updated.content.length };
      }
    }

    if (dto.settings) {
      const current = await this.getOrCreateSettings();
      previous.settings = {
        openaiModel: current.openaiModel,
        openaiFastModel: current.openaiFastModel,
        openaiEmbeddingModel: current.openaiEmbeddingModel,
        temperatureDefault: current.temperatureDefault,
        maxRetries: current.maxRetries,
        timeoutSeconds: current.timeoutSeconds,
      };
      const updated = await this.prisma.aiPlatformSettings.update({
        where: { id: current.id },
        data: {
          ...(dto.settings.openaiModel !== undefined && {
            openaiModel: dto.settings.openaiModel.trim(),
          }),
          ...(dto.settings.openaiFastModel !== undefined && {
            openaiFastModel: dto.settings.openaiFastModel.trim(),
          }),
          ...(dto.settings.openaiEmbeddingModel !== undefined && {
            openaiEmbeddingModel: dto.settings.openaiEmbeddingModel.trim(),
          }),
          ...(dto.settings.temperatureDefault !== undefined && {
            temperatureDefault: dto.settings.temperatureDefault,
          }),
          ...(dto.settings.maxRetries !== undefined && {
            maxRetries: dto.settings.maxRetries,
          }),
          ...(dto.settings.timeoutSeconds !== undefined && {
            timeoutSeconds: dto.settings.timeoutSeconds,
          }),
          updatedById: user.id,
        },
      });
      next.settings = {
        openaiModel: updated.openaiModel,
        openaiFastModel: updated.openaiFastModel,
        openaiEmbeddingModel: updated.openaiEmbeddingModel,
        temperatureDefault: updated.temperatureDefault,
        maxRetries: updated.maxRetries,
        timeoutSeconds: updated.timeoutSeconds,
      };
    }

    await this.refreshLocalCache();
    const sync = await this.syncToAiEngine();

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'AI_CONFIG_APPLY',
      module: 'ai-config',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      previousValue: previous,
      newValue: next,
      metadata: {
        promptKeys: dto.prompts?.map((p) => p.key) ?? [],
        settingsUpdated: Boolean(dto.settings),
        aiEngineSynced: sync.ok,
      },
    });

    return {
      message: 'Assist configuration applied successfully.',
      appliedPrompts: dto.prompts?.map((p) => p.key) ?? [],
      settingsUpdated: Boolean(dto.settings),
      aiEngineSynced: sync.ok,
      aiEngineMessage: sync.message,
      catalog: await this.getCatalog(),
    };
  }

  async resetPrompt(key: string, user: RequestUser, req: Request) {
    const existing = await this.prisma.aiSystemPrompt.findUnique({ where: { key } });
    if (!existing) throw new NotFoundException(`Unknown prompt key: ${key}`);

    const def = getDefaultPrompt(key);
    const defaultContent = def?.content ?? existing.defaultContent;

    const updated = await this.prisma.aiSystemPrompt.update({
      where: { key },
      data: {
        content: defaultContent,
        defaultContent,
        updatedById: user.id,
      },
    });

    await this.refreshLocalCache();
    const sync = await this.syncToAiEngine();

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'AI_CONFIG_RESET_PROMPT',
      module: 'ai-config',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      previousValue: { key, contentLength: existing.content.length },
      newValue: { key, contentLength: updated.content.length },
      metadata: { aiEngineSynced: sync.ok },
    });

    return {
      message: `Prompt ${key} reset to default.`,
      prompt: updated,
      aiEngineSynced: sync.ok,
      catalog: await this.getCatalog(),
    };
  }

  async resetAll(user: RequestUser, req: Request) {
    for (const def of DEFAULT_AI_PROMPTS) {
      await this.prisma.aiSystemPrompt.updateMany({
        where: { key: def.key },
        data: {
          content: def.content,
          defaultContent: def.content,
          name: def.name,
          description: def.description,
          category: def.category,
          modelHint: def.modelHint,
          sourceFile: def.sourceFile,
          sortOrder: def.sortOrder,
          updatedById: user.id,
        },
      });
    }

    const settings = await this.getOrCreateSettings();
    await this.prisma.aiPlatformSettings.update({
      where: { id: settings.id },
      data: {
        openaiModel: this.config.get<string>('OPENAI_MODEL', DEFAULT_OPENAI_MODEL),
        openaiFastModel: this.config.get<string>(
          'OPENAI_FAST_MODEL',
          DEFAULT_OPENAI_FAST_MODEL,
        ),
        openaiEmbeddingModel: 'text-embedding-3-small',
        temperatureDefault: 0.1,
        maxRetries: 3,
        timeoutSeconds: 90,
        updatedById: user.id,
      },
    });

    await this.refreshLocalCache();
    const sync = await this.syncToAiEngine();

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'AI_CONFIG_RESET_ALL',
      module: 'ai-config',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { aiEngineSynced: sync.ok },
    });

    return {
      message: 'All assist prompts and settings reset to defaults.',
      aiEngineSynced: sync.ok,
      catalog: await this.getCatalog(),
    };
  }

  // ─── Runtime getters (NestJS consumers) ───────────────────────────────────

  getPrompt(key: string, fallback?: string): string {
    const cached = this.memoryPrompts.get(key);
    if (cached?.trim()) return cached;
    const def = getDefaultPrompt(key);
    return fallback ?? def?.content ?? '';
  }

  /**
   * Live Super Admin prompt at generation time. Always prefers the database
   * row (edits applied from AI System), then Redis, then in-memory/code default.
   */
  async getLivePrompt(key: string, fallback?: string): Promise<string> {
    try {
      const row = await this.prisma.aiSystemPrompt.findUnique({
        where: { key },
        select: { content: true },
      });
      const stored = row?.content;
      if (stored?.trim()) {
        this.memoryPrompts.set(key, stored);
        return stored;
      }
    } catch (err) {
      this.logger.warn(
        `getLivePrompt(${key}) database read failed: ${err instanceof Error ? err.message : err}`,
      );
    }

    try {
      const raw = await this.redis.get(CACHE_PROMPTS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const hit = parsed[key];
        if (typeof hit === 'string' && hit.trim()) {
          this.memoryPrompts.set(key, hit);
          return hit;
        }
      }
    } catch (err) {
      this.logger.warn(
        `getLivePrompt(${key}) cache read failed: ${err instanceof Error ? err.message : err}`,
      );
    }

    return this.getPrompt(key, fallback);
  }

  /** Batch live Super Admin prompts for a Prescribe documentation generate. */
  async getLivePrompts(keys: string[]): Promise<Record<string, string>> {
    const unique = [...new Set(keys.filter(Boolean))];
    const out: Record<string, string> = {};
    if (!unique.length) return out;
    try {
      const rows = await this.prisma.aiSystemPrompt.findMany({
        where: { key: { in: unique } },
        select: { key: true, content: true },
      });
      const fromDb = new Map(rows.map((row) => [row.key, row.content]));
      for (const key of unique) {
        const stored = fromDb.get(key);
        if (stored?.trim()) {
          this.memoryPrompts.set(key, stored);
          out[key] = stored;
          continue;
        }
        out[key] = this.getPrompt(key);
      }
      return out;
    } catch (err) {
      this.logger.warn(
        `getLivePrompts database read failed: ${err instanceof Error ? err.message : err}`,
      );
    }
    for (const key of unique) {
      out[key] = await this.getLivePrompt(key);
    }
    return out;
  }

  getSettings(): RuntimeAiSettings {
    if (this.memorySettings) return this.memorySettings;
    return {
      openaiModel: this.config.get<string>('OPENAI_MODEL', DEFAULT_OPENAI_MODEL)!,
      openaiFastModel: this.config.get<string>(
        'OPENAI_FAST_MODEL',
        DEFAULT_OPENAI_FAST_MODEL,
      )!,
      openaiEmbeddingModel: 'text-embedding-3-small',
      temperatureDefault: 0.1,
      maxRetries: 3,
      timeoutSeconds: 90,
    };
  }

  // ─── Internals ────────────────────────────────────────────────────────────

  private loadDefaultsIntoMemory() {
    this.memoryPrompts = new Map(DEFAULT_AI_PROMPTS.map((p) => [p.key, p.content]));
    this.memorySettings = {
      openaiModel: this.resolvePreferredModel(
        this.config.get<string>('OPENAI_MODEL', DEFAULT_OPENAI_MODEL)!,
        'primary',
      ),
      openaiFastModel: this.resolvePreferredModel(
        this.config.get<string>('OPENAI_FAST_MODEL', DEFAULT_OPENAI_FAST_MODEL)!,
        'fast',
      ),
      openaiEmbeddingModel: 'text-embedding-3-small',
      temperatureDefault: 0.1,
      maxRetries: 3,
      timeoutSeconds: 90,
    };
  }

  private async ensureSeeded() {
    const count = await this.prisma.aiSystemPrompt.count();
    if (count === 0) {
      await this.prisma.aiSystemPrompt.createMany({
        data: DEFAULT_AI_PROMPTS.map((p) => ({
          key: p.key,
          name: p.name,
          description: p.description,
          category: p.category,
          content: p.content,
          defaultContent: p.content,
          modelHint: p.modelHint,
          sourceFile: p.sourceFile,
          sortOrder: p.sortOrder,
        })),
      });
      this.logger.log(`Seeded ${DEFAULT_AI_PROMPTS.length} AI system prompts`);
    } else {
      // Upsert new catalog keys. Refresh metadata/defaults. Roll content forward
      // only when the row still matches the previous code default (preserve edits).
      for (const def of DEFAULT_AI_PROMPTS) {
        const existing = await this.prisma.aiSystemPrompt.findUnique({
          where: { key: def.key },
        });
        if (!existing) {
          await this.prisma.aiSystemPrompt.create({
            data: {
              key: def.key,
              name: def.name,
              description: def.description,
              category: def.category,
              content: def.content,
              defaultContent: def.content,
              modelHint: def.modelHint,
              sourceFile: def.sourceFile,
              sortOrder: def.sortOrder,
            },
          });
          continue;
        }
        const stillDefault = existing.content === existing.defaultContent;
        await this.prisma.aiSystemPrompt.update({
          where: { key: def.key },
          data: {
            name: def.name,
            description: def.description,
            category: def.category,
            modelHint: def.modelHint,
            sourceFile: def.sourceFile,
            sortOrder: def.sortOrder,
            defaultContent: def.content,
            ...(stillDefault ? { content: def.content } : {}),
          },
        });
      }
    }

    await this.getOrCreateSettings();
    await this.upgradeLegacyModelDefaults();
  }

  private resolvePreferredModel(
    value: string,
    role: 'primary' | 'fast',
  ): string {
    if (role === 'fast') {
      return (LEGACY_OPENAI_FAST_MODEL_DEFAULTS as readonly string[]).includes(value)
        ? DEFAULT_OPENAI_FAST_MODEL
        : value;
    }
    return (LEGACY_OPENAI_MODEL_DEFAULTS as readonly string[]).includes(value)
      ? DEFAULT_OPENAI_MODEL
      : value;
  }

  /**
   * One-time-safe upgrade: if platform settings still use a prior built-in
   * default (gpt-4o, Terra, etc.), move them to GPT-5.6 Luna (or current env
   * defaults when those are non-legacy).
   * Custom Super Admin selections of Sol (or an explicit non-legacy model) are left untouched.
   */
  private async upgradeLegacyModelDefaults() {
    const settings = await this.getOrCreateSettings();
    const targetPrimary = this.resolvePreferredModel(
      this.config.get<string>('OPENAI_MODEL', DEFAULT_OPENAI_MODEL)!,
      'primary',
    );
    const targetFast = this.resolvePreferredModel(
      this.config.get<string>('OPENAI_FAST_MODEL', DEFAULT_OPENAI_FAST_MODEL)!,
      'fast',
    );

    const data: { openaiModel?: string; openaiFastModel?: string } = {};
    if (
      (LEGACY_OPENAI_MODEL_DEFAULTS as readonly string[]).includes(settings.openaiModel) &&
      targetPrimary !== settings.openaiModel
    ) {
      data.openaiModel = targetPrimary;
    }
    if (
      (LEGACY_OPENAI_FAST_MODEL_DEFAULTS as readonly string[]).includes(
        settings.openaiFastModel,
      ) &&
      targetFast !== settings.openaiFastModel
    ) {
      data.openaiFastModel = targetFast;
    }

    if (!Object.keys(data).length) return;

    await this.prisma.aiPlatformSettings.update({
      where: { id: settings.id },
      data,
    });
    this.logger.log(
      `Upgraded AI platform models from legacy defaults → ${data.openaiModel ?? settings.openaiModel} / ${data.openaiFastModel ?? settings.openaiFastModel}`,
    );
  }

  private async getOrCreateSettings() {
    const existing = await this.prisma.aiPlatformSettings.findFirst({ orderBy: { createdAt: 'asc' } });
    if (existing) return existing;
    return this.prisma.aiPlatformSettings.create({
      data: {
        openaiModel: this.resolvePreferredModel(
          this.config.get<string>('OPENAI_MODEL', DEFAULT_OPENAI_MODEL)!,
          'primary',
        ),
        openaiFastModel: this.resolvePreferredModel(
          this.config.get<string>('OPENAI_FAST_MODEL', DEFAULT_OPENAI_FAST_MODEL)!,
          'fast',
        ),
        openaiEmbeddingModel: 'text-embedding-3-small',
        temperatureDefault: 0.1,
        maxRetries: 3,
        timeoutSeconds: 90,
      },
    });
  }

  private async refreshLocalCache() {
    const [prompts, settings] = await Promise.all([
      this.prisma.aiSystemPrompt.findMany(),
      this.getOrCreateSettings(),
    ]);

    this.memoryPrompts = new Map(prompts.map((p) => [p.key, p.content]));
    this.memorySettings = {
      openaiModel: settings.openaiModel,
      openaiFastModel: settings.openaiFastModel,
      openaiEmbeddingModel: settings.openaiEmbeddingModel,
      temperatureDefault: settings.temperatureDefault,
      maxRetries: settings.maxRetries,
      timeoutSeconds: settings.timeoutSeconds,
    };

    const promptsPayload = Object.fromEntries(this.memoryPrompts);
    await Promise.all([
      this.redis.set(CACHE_PROMPTS_KEY, JSON.stringify(promptsPayload), CACHE_TTL_SECONDS).catch(() => undefined),
      this.redis.set(CACHE_SETTINGS_KEY, JSON.stringify(this.memorySettings), CACHE_TTL_SECONDS).catch(() => undefined),
    ]);
  }

  private async syncToAiEngine(): Promise<{ ok: boolean; message: string }> {
    const baseUrl = this.config.get<string>('AI_ENGINE_URL')?.replace(/\/$/, '');
    if (!baseUrl) {
      return { ok: false, message: 'Assist engine URL not configured' };
    }

    const secret =
      this.config.get<string>('AI_ENGINE_INTERNAL_SECRET') ??
      this.config.get<string>('INTERNAL_SECRET') ??
      'change-me-internal-secret-32chars';

    const payload = {
      prompts: Object.fromEntries(this.memoryPrompts),
      settings: this.getSettings(),
    };

    try {
      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(`${baseUrl}/api/v1/config/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': secret,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(id);

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        return { ok: false, message: `Assist Engine returned ${res.status}: ${text}` };
      }
      return { ok: true, message: 'Synced to Assist Engine' };
    } catch (err) {
      return {
        ok: false,
        message: err instanceof Error ? err.message : 'Failed to reach Assist Engine',
      };
    }
  }

  private maskSecret(value: string): string {
    if (value.length <= 8) return '••••••••';
    return `${value.slice(0, 4)}…${value.slice(-4)}`;
  }
}
