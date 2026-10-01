import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Request } from 'express';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/redis/redis.service';
import { AuditService } from '@/modules/audit/audit.service';
import type { RequestUser } from '@/common/decorators/auth.decorator';
import { DEFAULT_DOC_FORMATS, getDefaultDocFormat, LEGACY_DOC_FORMAT_KEYS } from './doc-format.defaults';
import { ApplyDocFormatsDto, PreviewDocFormatDto } from './dto/doc-format.dto';
import type { DocResponseSchema, PdfLayoutConfig } from './pdf-layout.types';

const CACHE_KEY = 'doc:formats:published:v3';
const CACHE_TTL_SECONDS = 60; // short TTL so published PDF/prompt changes feel live

function isMissingSchemaError(err: unknown): boolean {
  return (
    err instanceof Prisma.PrismaClientKnownRequestError &&
    (err.code === 'P2021' || err.code === 'P2022')
  );
}

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

@Injectable()
export class DocFormatService implements OnModuleInit {
  private readonly logger = new Logger(DocFormatService.name);
  private memoryPublished: PublishedDocFormat[] | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit() {
    try {
      await this.ensureSeeded();
      await this.refreshLocalCache();
    } catch (err) {
      this.loadDefaultsIntoMemory();
      if (isMissingSchemaError(err)) {
        this.logger.error(
          'Document format tables are missing. Run `pnpm db:migrate:deploy` (or `make db-migrate-deploy`), then restart. Using in-memory defaults until then.',
        );
      } else {
        this.logger.error(
          `Doc format boot seed failed; using in-memory defaults. ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }

  // ─── Admin catalog ─────────────────────────────────────────────────────────

  async getCatalog() {
    try {
      await this.ensureSeeded();
    } catch (err) {
      if (isMissingSchemaError(err)) {
        throw new ServiceUnavailableException(
          'Document format tables are missing. Apply migrations with `pnpm db:migrate:deploy` and restart the API.',
        );
      }
      throw err;
    }

    const rows = await this.prisma.documentFormatTemplate.findMany({
      orderBy: { sortOrder: 'asc' },
    });

    return {
      formats: rows.map((r) => this.toAdminItem(r)),
    };
  }

  async apply(dto: ApplyDocFormatsDto, user: RequestUser, req: Request) {
    if (!dto.formats?.length) {
      throw new BadRequestException('Provide at least one document format to apply.');
    }

    const previous: Record<string, unknown> = {};
    const next: Record<string, unknown> = {};

    for (const item of dto.formats) {
      const existing = await this.prisma.documentFormatTemplate.findUnique({
        where: { key: item.key },
      });
      if (!existing) {
        throw new NotFoundException(`Unknown document format key: ${item.key}`);
      }

      previous[item.key] = {
        name: existing.name,
        published: existing.published,
        aiPromptLength: existing.aiPrompt.length,
        hasPdfLayout: !!existing.pdfLayout,
      };

      if (item.pdfLayout) {
        this.assertPdfLayout(item.pdfLayout as PdfLayoutConfig);
      }
      if (item.responseSchema) {
        this.assertResponseSchema(item.responseSchema as DocResponseSchema);
      }

      const updated = await this.prisma.documentFormatTemplate.update({
        where: { key: item.key },
        data: {
          ...(item.name !== undefined && { name: item.name.trim() }),
          ...(item.shortName !== undefined && { shortName: item.shortName.trim() || null }),
          ...(item.description !== undefined && { description: item.description.trim() }),
          ...(item.categoryLabel !== undefined && {
            categoryLabel: item.categoryLabel.trim(),
          }),
          ...(item.bullets !== undefined && {
            bullets: item.bullets.map((b) => b.trim()).filter(Boolean) as Prisma.InputJsonValue,
          }),
          ...(item.fileName !== undefined && { fileName: item.fileName.trim() }),
          ...(item.actions !== undefined && {
            actions: item.actions as Prisma.InputJsonValue,
          }),
          ...(item.aiPrompt !== undefined && { aiPrompt: item.aiPrompt.trim() }),
          ...(item.styleNotes !== undefined && {
            styleNotes: item.styleNotes.trim() || null,
          }),
          ...(item.exampleOutput !== undefined && {
            exampleOutput: item.exampleOutput.trim(),
          }),
          ...(item.pdfLayout !== undefined && {
            pdfLayout: item.pdfLayout as unknown as Prisma.InputJsonValue,
          }),
          ...(item.responseSchema !== undefined && {
            responseSchema: item.responseSchema as unknown as Prisma.InputJsonValue,
          }),
          ...(item.published !== undefined && { published: item.published }),
          updatedById: user.id,
        },
      });

      next[item.key] = {
        name: updated.name,
        published: updated.published,
        aiPromptLength: updated.aiPrompt.length,
        hasPdfLayout: !!updated.pdfLayout,
      };
    }

    await this.invalidateCache();

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'DOC_FORMAT_APPLY',
      module: 'doc-download-format',
      previousValue: previous,
      newValue: next,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    const catalog = await this.getCatalog();
    return {
      message: `Published ${dto.formats.length} document download format(s). PDF preview/download and generation prompts are live.`,
      catalog,
    };
  }

  async resetOne(key: string, user: RequestUser, req: Request) {
    const def = getDefaultDocFormat(key);
    if (!def) {
      throw new NotFoundException(`Unknown document format key: ${key}`);
    }

    const existing = await this.prisma.documentFormatTemplate.findUnique({ where: { key } });
    if (!existing) {
      throw new NotFoundException(`Document format not found: ${key}`);
    }

    await this.prisma.documentFormatTemplate.update({
      where: { key },
      data: {
        name: def.name,
        shortName: def.shortName,
        description: def.description,
        categoryLabel: def.categoryLabel,
        bullets: def.bullets as Prisma.InputJsonValue,
        fileName: def.fileName,
        actions: def.actions as Prisma.InputJsonValue,
        aiPrompt: def.aiPrompt,
        styleNotes: def.styleNotes,
        exampleOutput: def.exampleOutput,
        pdfLayout: def.pdfLayout as unknown as Prisma.InputJsonValue,
        responseSchema: def.responseSchema as unknown as Prisma.InputJsonValue,
        defaultPdfLayout: def.pdfLayout as unknown as Prisma.InputJsonValue,
        defaultResponseSchema: def.responseSchema as unknown as Prisma.InputJsonValue,
        published: true,
        updatedById: user.id,
      },
    });

    await this.invalidateCache();

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'DOC_FORMAT_RESET',
      module: 'doc-download-format',
      previousValue: { key },
      newValue: { key, reset: true },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return {
      message: `Reset ${def.name} to defaults.`,
      catalog: await this.getCatalog(),
    };
  }

  async resetAll(user: RequestUser, req: Request) {
    for (const def of DEFAULT_DOC_FORMATS) {
      await this.prisma.documentFormatTemplate.update({
        where: { key: def.key },
        data: {
          name: def.name,
          shortName: def.shortName,
          description: def.description,
          categoryLabel: def.categoryLabel,
          bullets: def.bullets as Prisma.InputJsonValue,
          fileName: def.fileName,
          actions: def.actions as Prisma.InputJsonValue,
          aiPrompt: def.aiPrompt,
          styleNotes: def.styleNotes,
          exampleOutput: def.exampleOutput,
          pdfLayout: def.pdfLayout as unknown as Prisma.InputJsonValue,
          responseSchema: def.responseSchema as unknown as Prisma.InputJsonValue,
          defaultPdfLayout: def.pdfLayout as unknown as Prisma.InputJsonValue,
          defaultResponseSchema: def.responseSchema as unknown as Prisma.InputJsonValue,
          published: true,
          updatedById: user.id,
        },
      });
    }

    await this.invalidateCache();

    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'DOC_FORMAT_RESET_ALL',
      module: 'doc-download-format',
      previousValue: {},
      newValue: { resetAll: true },
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
    });

    return {
      message: 'All document download formats reset to defaults.',
      catalog: await this.getCatalog(),
    };
  }

  /**
   * Preview returns example content + resolved layout for client-side PDF render.
   * Does not call the AI engine — instant and stable for admin review.
   */
  async preview(dto: PreviewDocFormatDto) {
    await this.ensureSeeded();
    const row = await this.prisma.documentFormatTemplate.findUnique({
      where: { key: dto.key },
    });
    if (!row) {
      throw new NotFoundException(`Unknown document format key: ${dto.key}`);
    }

    const exampleRaw = (dto.exampleOutput ?? row.exampleOutput).trim();
    let parsed: unknown = exampleRaw;
    try {
      parsed = JSON.parse(exampleRaw);
    } catch {
      // keep as plain text
    }

    const pdfLayout =
      (dto.pdfLayout as PdfLayoutConfig | undefined) ??
      this.asPdfLayout(row.pdfLayout) ??
      getDefaultDocFormat(row.key)?.pdfLayout ??
      null;

    return {
      key: row.key,
      name: row.name,
      shortName: row.shortName,
      description: row.description,
      category: row.category,
      categoryLabel: row.categoryLabel,
      bullets: this.asStringArray(row.bullets),
      styleNotes: dto.styleNotes ?? row.styleNotes,
      aiPromptPreview: (dto.aiPrompt ?? row.aiPrompt).slice(0, 500),
      example: parsed,
      exampleRaw,
      pdfLayout,
      responseSchema:
        this.asResponseSchema(row.responseSchema) ??
        getDefaultDocFormat(row.key)?.responseSchema ??
        null,
      renderedAt: new Date().toISOString(),
      note: 'Preview uses example content with the PDF layout. Publish to apply prompts and layout to live download/preview.',
    };
  }

  // ─── Runtime (pharmacist Doc module + AI generation) ───────────────────────

  async getPublishedFormats(): Promise<PublishedDocFormat[]> {
    if (this.memoryPublished?.length) {
      return this.memoryPublished;
    }

    const cached = await this.redis.get(CACHE_KEY);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as PublishedDocFormat[];
        this.memoryPublished = parsed;
        return parsed;
      } catch {
        // fall through
      }
    }

    await this.refreshLocalCache();
    return this.memoryPublished ?? [];
  }

  /** Instructions appended when NestJS calls AI documentation generation. */
  async getGenerationInstructions(): Promise<
    Record<
      string,
      {
        aiPrompt: string;
        styleNotes: string | null;
        name: string;
        responseSchema: DocResponseSchema | null;
      }
    >
  > {
    const formats = await this.getPublishedFormats();
    const out: Record<
      string,
      {
        aiPrompt: string;
        styleNotes: string | null;
        name: string;
        responseSchema: DocResponseSchema | null;
      }
    > = {};
    for (const f of formats) {
      out[f.key] = {
        name: f.name,
        aiPrompt: f.aiPrompt,
        styleNotes: f.styleNotes,
        responseSchema: f.responseSchema,
      };
    }
    return out;
  }

  // ─── Internals ─────────────────────────────────────────────────────────────

  private loadDefaultsIntoMemory() {
    this.memoryPublished = DEFAULT_DOC_FORMATS.map((def) => ({
      key: def.key,
      name: def.name,
      shortName: def.shortName,
      description: def.description,
      category: def.category,
      categoryLabel: def.categoryLabel,
      bullets: [...def.bullets],
      fileName: def.fileName,
      sortOrder: def.sortOrder,
      actions: [...def.actions],
      aiPrompt: def.aiPrompt,
      styleNotes: def.styleNotes,
      pdfLayout: def.pdfLayout,
      responseSchema: def.responseSchema,
    }));
  }

  private async ensureSeeded() {
    // Migrate legacy Prescribe keys → canonical snake_case; unpublish obsolete Rx template
    for (const [legacyKey, canonicalKey] of Object.entries(LEGACY_DOC_FORMAT_KEYS)) {
      const legacy = await this.prisma.documentFormatTemplate.findUnique({
        where: { key: legacyKey },
      });
      if (!legacy) continue;
      const existingCanonical = await this.prisma.documentFormatTemplate.findUnique({
        where: { key: canonicalKey },
      });
      if (existingCanonical) {
        await this.prisma.documentFormatTemplate.delete({ where: { key: legacyKey } });
      } else {
        await this.prisma.documentFormatTemplate.update({
          where: { key: legacyKey },
          data: { key: canonicalKey },
        });
      }
    }

    const obsoleteRx = await this.prisma.documentFormatTemplate.findUnique({
      where: { key: 'prescription' },
    });
    if (obsoleteRx) {
      await this.prisma.documentFormatTemplate.update({
        where: { key: 'prescription' },
        data: { published: false },
      });
    }

    for (const def of DEFAULT_DOC_FORMATS) {
      const exists = await this.prisma.documentFormatTemplate.findUnique({
        where: { key: def.key },
      });
      if (!exists) {
        await this.createFromDefault(def);
        continue;
      }

      // Sync display metadata for Prescribe catalog (names/actions) while preserving
      // admin-customized prompts/layouts unless missing.
      const needsMetaSync =
        exists.name !== def.name ||
        exists.fileName !== def.fileName ||
        JSON.stringify(exists.actions) !== JSON.stringify(def.actions);

      if (needsMetaSync) {
        await this.prisma.documentFormatTemplate.update({
          where: { key: def.key },
          data: {
            name: def.name,
            shortName: def.shortName,
            description: def.description,
            categoryLabel: def.categoryLabel,
            bullets: def.bullets as Prisma.InputJsonValue,
            fileName: def.fileName,
            actions: def.actions as Prisma.InputJsonValue,
            sortOrder: def.sortOrder,
            published: true,
          },
        });
      }

      const staleDapPrompt =
        def.key === 'consultation_note' &&
        (/IF consultationMode is CLINICAL_JUDGMENT/i.test(exists.aiPrompt) ||
          /Generate the consultation_note object as a pharmacist DAP note/i.test(
            exists.aiPrompt,
          ) ||
          exists.aiPrompt === exists.defaultAiPrompt);
      if (staleDapPrompt && exists.aiPrompt !== def.aiPrompt) {
        await this.prisma.documentFormatTemplate.update({
          where: { key: def.key },
          data: {
            aiPrompt: def.aiPrompt,
            defaultAiPrompt: def.aiPrompt,
            styleNotes: def.styleNotes,
            exampleOutput: def.exampleOutput,
            description: def.description,
          },
        });
      }

      const stalePcpPrompt =
        def.key === 'prescriber_communication' &&
        (/exact confirmed regimen \(strength, dose, route/i.test(exists.aiPrompt) ||
          /regarding a pharmacist assessment completed/i.test(exists.aiPrompt) ||
          /REQUIRED JSON FIELDS for prescriber_communication/i.test(exists.aiPrompt) ||
          /PCP communication should allow the PCP to understand/i.test(exists.aiPrompt) ||
          exists.aiPrompt === exists.defaultAiPrompt);
      if (stalePcpPrompt && exists.aiPrompt !== def.aiPrompt) {
        await this.prisma.documentFormatTemplate.update({
          where: { key: def.key },
          data: {
            aiPrompt: def.aiPrompt,
            defaultAiPrompt: def.aiPrompt,
            styleNotes: def.styleNotes,
            exampleOutput: def.exampleOutput,
            description: def.description,
          },
        });
      }

      const staleHandoutPrompt =
        def.key === 'patient_care_summary' &&
        (/Optional technique line only if confirmed/i.test(exists.aiPrompt) ||
          /exact confirmed regimen \(name \+ directions\)/i.test(exists.aiPrompt) ||
          exists.aiPrompt === exists.defaultAiPrompt);
      if (staleHandoutPrompt && exists.aiPrompt !== def.aiPrompt) {
        await this.prisma.documentFormatTemplate.update({
          where: { key: def.key },
          data: {
            aiPrompt: def.aiPrompt,
            defaultAiPrompt: def.aiPrompt,
            styleNotes: def.styleNotes,
            exampleOutput: def.exampleOutput,
            description: def.description,
          },
        });
      }

      // Backfill layout/schema for rows created before Doc Download Format
      if (!exists.pdfLayout || !exists.responseSchema) {
        await this.prisma.documentFormatTemplate.update({
          where: { key: def.key },
          data: {
            ...(!exists.pdfLayout && {
              pdfLayout: def.pdfLayout as unknown as Prisma.InputJsonValue,
              defaultPdfLayout: def.pdfLayout as unknown as Prisma.InputJsonValue,
            }),
            ...(!exists.responseSchema && {
              responseSchema: def.responseSchema as unknown as Prisma.InputJsonValue,
              defaultResponseSchema: def.responseSchema as unknown as Prisma.InputJsonValue,
            }),
          },
        });
      }
    }

    await this.invalidateCache();
  }

  private async createFromDefault(def: (typeof DEFAULT_DOC_FORMATS)[number]) {
    await this.prisma.documentFormatTemplate.create({
      data: {
        key: def.key,
        name: def.name,
        shortName: def.shortName,
        description: def.description,
        category: def.category,
        categoryLabel: def.categoryLabel,
        bullets: def.bullets as Prisma.InputJsonValue,
        fileName: def.fileName,
        sortOrder: def.sortOrder,
        actions: def.actions as Prisma.InputJsonValue,
        aiPrompt: def.aiPrompt,
        styleNotes: def.styleNotes,
        exampleOutput: def.exampleOutput,
        pdfLayout: def.pdfLayout as unknown as Prisma.InputJsonValue,
        responseSchema: def.responseSchema as unknown as Prisma.InputJsonValue,
        defaultName: def.name,
        defaultShortName: def.shortName,
        defaultDescription: def.description,
        defaultCategoryLabel: def.categoryLabel,
        defaultBullets: def.bullets as Prisma.InputJsonValue,
        defaultAiPrompt: def.aiPrompt,
        defaultStyleNotes: def.styleNotes,
        defaultExampleOutput: def.exampleOutput,
        defaultPdfLayout: def.pdfLayout as unknown as Prisma.InputJsonValue,
        defaultResponseSchema: def.responseSchema as unknown as Prisma.InputJsonValue,
        published: true,
      },
    });
  }

  private async refreshLocalCache() {
    const rows = await this.prisma.documentFormatTemplate.findMany({
      where: { published: true },
      orderBy: { sortOrder: 'asc' },
    });

    this.memoryPublished = rows.map((r) => {
      const def = getDefaultDocFormat(r.key);
      return {
        key: r.key,
        name: r.name,
        shortName: r.shortName,
        description: r.description,
        category: r.category,
        categoryLabel: r.categoryLabel,
        bullets: this.asStringArray(r.bullets),
        fileName: r.fileName,
        sortOrder: r.sortOrder,
        actions: this.asStringArray(r.actions),
        aiPrompt: r.aiPrompt,
        styleNotes: r.styleNotes,
        pdfLayout: this.asPdfLayout(r.pdfLayout) ?? def?.pdfLayout ?? null,
        responseSchema: this.asResponseSchema(r.responseSchema) ?? def?.responseSchema ?? null,
      };
    });

    await this.redis
      .set(CACHE_KEY, JSON.stringify(this.memoryPublished), CACHE_TTL_SECONDS)
      .catch(() => undefined);
  }

  private async invalidateCache() {
    this.memoryPublished = null;
    await this.redis.del(CACHE_KEY).catch(() => undefined);
    await this.refreshLocalCache();
  }

  private asStringArray(value: Prisma.JsonValue): string[] {
    if (Array.isArray(value)) {
      return value.filter((v): v is string => typeof v === 'string');
    }
    return [];
  }

  private asPdfLayout(value: Prisma.JsonValue | null | undefined): PdfLayoutConfig | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const obj = value as Record<string, unknown>;
    if (obj.mode !== 'sections' && obj.mode !== 'prescription') return null;
    if (typeof obj.title !== 'string') return null;
    if (!Array.isArray(obj.sections)) return null;
    return obj as unknown as PdfLayoutConfig;
  }

  private asResponseSchema(
    value: Prisma.JsonValue | null | undefined,
  ): DocResponseSchema | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const obj = value as Record<string, unknown>;
    if (!Array.isArray(obj.fields)) return null;
    return obj as unknown as DocResponseSchema;
  }

  private assertPdfLayout(layout: PdfLayoutConfig) {
    if (!layout.title?.trim()) {
      throw new BadRequestException('PDF layout requires a title.');
    }
    if (layout.mode === 'sections' && !Array.isArray(layout.sections)) {
      throw new BadRequestException('PDF layout sections must be an array.');
    }
  }

  private assertResponseSchema(schema: DocResponseSchema) {
    if (!Array.isArray(schema.fields)) {
      throw new BadRequestException('Response schema fields must be an array.');
    }
    for (const f of schema.fields) {
      if (!f.key?.trim() || !f.label?.trim()) {
        throw new BadRequestException('Each response field needs a key and label.');
      }
    }
  }

  private toAdminItem(r: {
    id: string;
    key: string;
    name: string;
    shortName: string | null;
    description: string;
    category: string;
    categoryLabel: string;
    bullets: Prisma.JsonValue;
    fileName: string;
    sortOrder: number;
    actions: Prisma.JsonValue;
    aiPrompt: string;
    styleNotes: string | null;
    exampleOutput: string;
    pdfLayout: Prisma.JsonValue | null;
    responseSchema: Prisma.JsonValue | null;
    defaultName: string;
    defaultShortName: string | null;
    defaultDescription: string;
    defaultCategoryLabel: string;
    defaultBullets: Prisma.JsonValue;
    defaultAiPrompt: string;
    defaultStyleNotes: string | null;
    defaultExampleOutput: string;
    defaultPdfLayout: Prisma.JsonValue | null;
    defaultResponseSchema: Prisma.JsonValue | null;
    published: boolean;
    updatedAt: Date;
    updatedById: string | null;
  }) {
    const def = getDefaultDocFormat(r.key);
    const bullets = this.asStringArray(r.bullets);
    const defaultBullets = this.asStringArray(r.defaultBullets);
    const pdfLayout = this.asPdfLayout(r.pdfLayout) ?? def?.pdfLayout ?? null;
    const responseSchema =
      this.asResponseSchema(r.responseSchema) ?? def?.responseSchema ?? null;
    const defaultPdfLayout =
      this.asPdfLayout(r.defaultPdfLayout) ?? def?.pdfLayout ?? null;
    const defaultResponseSchema =
      this.asResponseSchema(r.defaultResponseSchema) ?? def?.responseSchema ?? null;

    const isModified =
      r.name !== r.defaultName ||
      (r.shortName ?? '') !== (r.defaultShortName ?? '') ||
      r.description !== r.defaultDescription ||
      r.categoryLabel !== r.defaultCategoryLabel ||
      JSON.stringify(bullets) !== JSON.stringify(defaultBullets) ||
      r.aiPrompt !== r.defaultAiPrompt ||
      (r.styleNotes ?? '') !== (r.defaultStyleNotes ?? '') ||
      r.exampleOutput !== r.defaultExampleOutput ||
      JSON.stringify(pdfLayout) !== JSON.stringify(defaultPdfLayout) ||
      JSON.stringify(responseSchema) !== JSON.stringify(defaultResponseSchema) ||
      !r.published;

    return {
      id: r.id,
      key: r.key,
      name: r.name,
      shortName: r.shortName,
      description: r.description,
      category: r.category,
      categoryLabel: r.categoryLabel,
      bullets,
      fileName: r.fileName,
      sortOrder: r.sortOrder,
      actions: this.asStringArray(r.actions),
      aiPrompt: r.aiPrompt,
      styleNotes: r.styleNotes,
      exampleOutput: r.exampleOutput,
      pdfLayout,
      responseSchema,
      published: r.published,
      isModified,
      updatedAt: r.updatedAt,
      updatedById: r.updatedById,
    };
  }
}
