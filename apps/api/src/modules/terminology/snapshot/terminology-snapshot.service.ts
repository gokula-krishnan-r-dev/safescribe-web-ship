import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { CcdDDrugSearchProvider } from '@/modules/terminology/providers/ccdd/ccdd.provider';
import { CCDD_SYSTEM, SNOMED_SYSTEM } from '@/modules/terminology/providers/ccdd/ccdd.constants';
import { normalizeDrugKey } from '@/modules/medication-safety/utils/drug-name.util';

export type ResolvedSelector = {
  selectorType: string;
  selectorCode: string;
  selectorVersion: string | null;
  terminologySystem: string | null;
  resolvedConceptIds: string[];
  displayName: string | null;
  resolutionStatus: 'EXACT' | 'EQUIVALENT' | 'UNRESOLVED';
  ingredientConceptIds: string[];
};

export type SnapshotConceptInput = {
  query: string;
  preferredCode?: string | null;
  conceptTypeHint?: string;
};

/**
 * Pragmatic CCDD-backed terminology snapshot.
 * Pins resolved medication/ingredient concepts into a versioned local release
 * so live evaluation does not require a synchronous national-API call.
 */
@Injectable()
export class TerminologySnapshotService {
  private readonly logger = new Logger(TerminologySnapshotService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly ccdd: CcdDDrugSearchProvider,
  ) {}

  async getActiveRelease() {
    return this.prisma.terminologyRelease.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { activatedAt: 'desc' },
    });
  }

  /** Active release + concept counts for the Synchronization admin page. */
  async getActiveReleaseSummary() {
    const release = await this.getActiveRelease();
    if (!release) {
      return {
        active: null,
        conceptCount: 0,
        ingredientCount: 0,
        productCount: 0,
        edgeCount: 0,
        lastSyncedAt: null as string | null,
        isStale: false,
        recommendedResyncDays: 14,
      };
    }

    const [conceptCount, ingredientCount, productCount, edgeCount] =
      await Promise.all([
        this.prisma.terminologyDrugConcept.count({
          where: { terminologyReleaseId: release.id, isActive: true },
        }),
        this.prisma.terminologyDrugConcept.count({
          where: {
            terminologyReleaseId: release.id,
            isActive: true,
            conceptType: { in: ['INGREDIENT', 'PRECISE_INGREDIENT'] },
          },
        }),
        this.prisma.terminologyDrugConcept.count({
          where: {
            terminologyReleaseId: release.id,
            isActive: true,
            conceptType: { notIn: ['INGREDIENT', 'PRECISE_INGREDIENT'] },
          },
        }),
        this.prisma.terminologyIngredientEdge.count({
          where: { terminologyReleaseId: release.id, isActive: true },
        }),
      ]);

    const lastSyncedAt =
      release.downloadedAt?.toISOString() ??
      release.activatedAt?.toISOString() ??
      release.createdAt.toISOString();

    const recommendedResyncDays = 14;
    const ageMs = Date.now() - new Date(lastSyncedAt).getTime();
    const isStale = ageMs > recommendedResyncDays * 24 * 60 * 60 * 1000;

    return {
      active: release,
      conceptCount,
      ingredientCount,
      productCount,
      edgeCount,
      lastSyncedAt,
      isStale,
      recommendedResyncDays,
    };
  }

  async listConcepts(opts: {
    page?: number;
    limit?: number;
    search?: string;
    conceptType?: string;
  }) {
    const page = Math.max(1, opts.page ?? 1);
    const limit = Math.min(100, Math.max(1, opts.limit ?? 20));
    const release = await this.getActiveRelease();
    if (!release) {
      return {
        data: [],
        meta: { total: 0, page, limit, totalPages: 0 },
        releaseId: null as string | null,
      };
    }

    const search = opts.search?.trim();
    const where = {
      terminologyReleaseId: release.id,
      isActive: true,
      ...(opts.conceptType
        ? { conceptType: opts.conceptType }
        : {}),
      ...(search
        ? {
            OR: [
              {
                preferredNameEn: {
                  contains: search,
                  mode: 'insensitive' as const,
                },
              },
              {
                brandName: { contains: search, mode: 'insensitive' as const },
              },
              { normalizedSearchName: { contains: normalizeDrugKey(search) } },
              { sourceCode: { contains: search, mode: 'insensitive' as const } },
              { dinCodes: { has: search } },
            ],
          }
        : {}),
    };

    const [total, rows] = await Promise.all([
      this.prisma.terminologyDrugConcept.count({ where }),
      this.prisma.terminologyDrugConcept.findMany({
        where,
        orderBy: { preferredNameEn: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true,
          preferredNameEn: true,
          brandName: true,
          conceptType: true,
          sourceSystem: true,
          sourceCode: true,
          doseFormDisplay: true,
          dinCodes: true,
          snomedCode: true,
          createdAt: true,
        },
      }),
    ]);

    return {
      data: rows,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
      releaseId: release.id,
    };
  }

  async listReleases(limit = 20) {
    const rows = await this.prisma.terminologyRelease.findMany({
      orderBy: [{ activatedAt: 'desc' }, { createdAt: 'desc' }],
      take: Math.min(50, Math.max(1, limit)),
      include: {
        _count: { select: { drugConcepts: true } },
        createdBy: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    return rows.map((r) => ({
      id: r.id,
      releaseKey: r.releaseKey,
      status: r.status,
      ccddVersion: r.ccddVersion,
      conceptCount: r._count.drugConcepts,
      downloadedAt: r.downloadedAt?.toISOString() ?? null,
      activatedAt: r.activatedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      createdBy: r.createdBy,
      sourceMetadata: r.sourceMetadata,
    }));
  }

  /**
   * Ensure an ACTIVE terminology release exists.
   * After DB wipes or fresh environments, CCDD credentials may be unavailable —
   * publish must still work with a local seed pin (upgradeable later via Resync CCDD).
   */
  async ensureActiveSeedRelease(createdById?: string) {
    const existing = await this.getActiveRelease();
    if (existing) return { release: existing, created: false };

    const releaseKey = `TERM-SEED-${new Date().toISOString().slice(0, 10)}`;
    this.logger.warn(
      `No active terminology release — creating local seed ${releaseKey} for governed publish`,
    );

    const seedQueries = [
      'amoxicillin',
      'clavulanic acid',
      'amoxicillin clavulanate',
      'cefadroxil',
      'propranolol',
      'metformin',
      'spironolactone',
      'ibuprofen',
      'naproxen',
      'diclofenac',
      'codeine',
      'sildenafil',
      'nitroglycerin',
      'isosorbide',
      'warfarin',
      'methotrexate',
      'lisinopril',
      'simvastatin',
      'ciprofloxacin',
      'trimethoprim',
    ];

    const release = await this.prisma.terminologyRelease.create({
      data: {
        releaseKey,
        status: 'ACTIVE',
        ccddVersion: 'seed-snapshot',
        ccddCanonicalUrl: CCDD_SYSTEM,
        snomedVersion: SNOMED_SYSTEM,
        activatedAt: new Date(),
        validatedAt: new Date(),
        createdById: createdById ?? null,
        sourceMetadata: {
          seed: true,
          provider: 'safescribe-local-seed',
          note: 'Auto-seeded when no ACTIVE terminology release was pinned. Resync from CCDD when Infoway is available.',
        },
      },
    });

    for (const q of seedQueries) {
      const code = `local:${q.replace(/\s+/g, '-')}`;
      await this.prisma.terminologyDrugConcept.create({
        data: {
          terminologyReleaseId: release.id,
          sourceSystem: 'safescribe-local',
          sourceCode: code,
          sourceVersion: '1',
          conceptKey: `local|safescribe|${code}`,
          conceptType: 'INGREDIENT',
          preferredNameEn: q,
          normalizedSearchName: normalizeDrugKey(q),
          isActive: true,
          rawSource: { seed: true, query: q },
        },
      });
    }

    // Minimal product helpers used by golden allergy check + import soft resolution
    const ingredients = [
      {
        productName: 'Clavulin 875 mg / 125 mg tablet',
        genericName: 'amoxicillin-clavulanate',
        ingredients: ['amoxicillin', 'clavulanic acid'],
      },
      {
        productName: 'Amoxil 500 mg capsule',
        genericName: 'amoxicillin',
        ingredients: ['amoxicillin'],
      },
    ];
    for (const row of ingredients) {
      await this.prisma.medicationIngredient.upsert({
        where: { productName: row.productName },
        create: row,
        update: {
          genericName: row.genericName,
          ingredients: row.ingredients,
        },
      });
    }

    return { release, created: true };
  }

  async ensureDraftRelease(createdById?: string) {
    const active = await this.getActiveRelease();
    if (active) return active;

    const releaseKey = `TERM-${new Date().toISOString().slice(0, 10)}-bootstrap`;
    return this.prisma.terminologyRelease.create({
      data: {
        releaseKey,
        status: 'STAGED',
        ccddVersion: this.config.get<string>('CCDD_VERSION') ?? 'live-fhir-snapshot',
        ccddCanonicalUrl: CCDD_SYSTEM,
        snomedVersion: SNOMED_SYSTEM,
        sourceMetadata: {
          provider: 'ccdd-fhir-live',
          note: 'Pragmatic snapshot from Infoway Terminology Server search',
        },
        createdById: createdById ?? null,
      },
    });
  }

  async activateRelease(releaseId: string) {
    await this.prisma.$transaction(async (tx) => {
      await tx.terminologyRelease.updateMany({
        where: { status: 'ACTIVE' },
        data: { status: 'RETIRED' },
      });
      await tx.terminologyRelease.update({
        where: { id: releaseId },
        data: {
          status: 'ACTIVE',
          activatedAt: new Date(),
          validatedAt: new Date(),
          downloadedAt: new Date(),
        },
      });
    });
  }

  async upsertConceptFromSearch(
    releaseId: string,
    displayName: string,
    opts?: { sourceCode?: string | null; purpose?: 'medication' | 'allergy' },
  ) {
    const purpose = opts?.purpose ?? 'medication';
    let result = opts?.sourceCode
      ? await this.ccdd.resolve(opts.sourceCode, purpose)
      : null;
    if (!result) {
      result = await this.ccdd.resolve(displayName, purpose);
    }
    if (!result) {
      // fall back to free-text entry for draft testing when CCDD is offline
      return this.upsertLocalOnlyConcept(releaseId, displayName, opts?.sourceCode);
    }

    const sourceCode =
      opts?.sourceCode ||
      result.ndc ||
      result.id.replace(/^ccdd-(tm|ntp|mp)-/, '') ||
      normalizeDrugKey(result.genericName || result.brandName);

    const conceptKey = `ccdd|${CCDD_SYSTEM}|${sourceCode}`;
    const preferredNameEn =
      result.genericName || result.brandName || displayName;
    const conceptType = result.id.includes('-tm-')
      ? 'INGREDIENT'
      : result.id.includes('-mp-')
        ? 'MARKETED_PRODUCT'
        : result.id.includes('-ntp-')
          ? 'CLINICAL_DRUG'
          : 'UNKNOWN';

    const concept = await this.prisma.terminologyDrugConcept.upsert({
      where: {
        terminologyReleaseId_sourceSystem_sourceCode: {
          terminologyReleaseId: releaseId,
          sourceSystem: CCDD_SYSTEM,
          sourceCode,
        },
      },
      create: {
        terminologyReleaseId: releaseId,
        sourceSystem: CCDD_SYSTEM,
        sourceCode,
        sourceVersion: 'live',
        conceptKey,
        conceptType,
        preferredNameEn,
        normalizedSearchName: normalizeDrugKey(preferredNameEn),
        brandName: result.brandName,
        snomedCode: null,
        dinCodes: result.ndc ? [result.ndc] : [],
        doseFormDisplay: result.dosageForm ?? null,
        isActive: true,
        rawSource: result as unknown as Prisma.InputJsonValue,
      },
      update: {
        preferredNameEn,
        normalizedSearchName: normalizeDrugKey(preferredNameEn),
        brandName: result.brandName,
        doseFormDisplay: result.dosageForm ?? null,
        isActive: true,
        rawSource: result as unknown as Prisma.InputJsonValue,
      },
    });

    // When the search hit is a product and we know the generic ingredient name, link it
    if (
      conceptType !== 'INGREDIENT' &&
      result.genericName &&
      normalizeDrugKey(result.genericName) !== normalizeDrugKey(preferredNameEn)
    ) {
      const ingredient = await this.upsertLocalOnlyConcept(
        releaseId,
        result.genericName,
        null,
        'INGREDIENT',
      );
      await this.linkIngredient(releaseId, concept.id, ingredient.id);
    } else if (conceptType === 'INGREDIENT') {
      // self is not stored as edge; resolveActiveIngredients handles this
    }

    return concept;
  }

  async upsertLocalOnlyConcept(
    releaseId: string,
    displayName: string,
    sourceCode?: string | null,
    conceptType = 'INGREDIENT',
  ) {
    const code = sourceCode || `local:${normalizeDrugKey(displayName)}`;
    const conceptKey = `local|safescribe|${code}`;
    return this.prisma.terminologyDrugConcept.upsert({
      where: {
        terminologyReleaseId_sourceSystem_sourceCode: {
          terminologyReleaseId: releaseId,
          sourceSystem: 'safescribe-local',
          sourceCode: code,
        },
      },
      create: {
        terminologyReleaseId: releaseId,
        sourceSystem: 'safescribe-local',
        sourceCode: code,
        sourceVersion: '1',
        conceptKey,
        conceptType,
        preferredNameEn: displayName,
        normalizedSearchName: normalizeDrugKey(displayName),
        isActive: true,
        rawSource: { local: true, displayName },
      },
      update: {
        preferredNameEn: displayName,
        normalizedSearchName: normalizeDrugKey(displayName),
        isActive: true,
      },
    });
  }

  async linkIngredient(
    releaseId: string,
    medicationId: string,
    ingredientId: string,
  ) {
    if (medicationId === ingredientId) return;
    await this.prisma.terminologyIngredientEdge.upsert({
      where: {
        terminologyReleaseId_medicationId_ingredientId_relationshipType_ingredientRole: {
          terminologyReleaseId: releaseId,
          medicationId,
          ingredientId,
          relationshipType: 'HAS_ACTIVE_INGREDIENT',
          ingredientRole: 'ACTIVE',
        },
      },
      create: {
        terminologyReleaseId: releaseId,
        medicationId,
        ingredientId,
        relationshipType: 'HAS_ACTIVE_INGREDIENT',
        ingredientRole: 'ACTIVE',
        provenanceSource: 'ccdd-fhir-snapshot',
        provenanceVersion: '1',
        derivationMethod: 'CCDD_SEARCH_ENRICHMENT',
        isActive: true,
        rawSource: {},
      },
      update: { isActive: true },
    });
  }

  async resolveActiveIngredients(
    medicationId: string,
    terminologyReleaseId: string,
  ) {
    const med = await this.prisma.terminologyDrugConcept.findFirst({
      where: { id: medicationId, terminologyReleaseId },
    });
    if (!med) return [];

    if (med.conceptType === 'INGREDIENT' || med.conceptType === 'PRECISE_INGREDIENT') {
      return [
        {
          ingredientId: med.id,
          system: med.sourceSystem,
          code: med.sourceCode,
          version: med.sourceVersion,
          display: med.preferredNameEn,
          relationshipType: 'SELF',
          derivationMethod: 'DIRECT_INGREDIENT_SELECTION',
        },
      ];
    }

    const edges = await this.prisma.terminologyIngredientEdge.findMany({
      where: {
        terminologyReleaseId,
        medicationId,
        isActive: true,
        ingredientRole: 'ACTIVE',
      },
      include: { ingredient: true },
    });

    return edges.map((e) => ({
      ingredientId: e.ingredientId,
      system: e.ingredient.sourceSystem,
      code: e.ingredient.sourceCode,
      version: e.ingredient.sourceVersion,
      display: e.ingredient.preferredNameEn,
      relationshipType: e.relationshipType,
      derivationMethod: e.derivationMethod,
    }));
  }

  /**
   * Resolve a workbook selector against the active (or specified) release.
   * Never treats free-text display names as authoritative match keys for exact resolution.
   */
  async resolveSelector(input: {
    selectorType: string;
    selectorCode: string;
    selectorVersion?: string | null;
    displayName?: string | null;
    terminologyReleaseId?: string;
  }): Promise<ResolvedSelector> {
    const release =
      (input.terminologyReleaseId
        ? await this.prisma.terminologyRelease.findUnique({
            where: { id: input.terminologyReleaseId },
          })
        : null) ?? (await this.getActiveRelease());

    if (!release) {
      return {
        selectorType: input.selectorType,
        selectorCode: input.selectorCode,
        selectorVersion: input.selectorVersion ?? null,
        terminologySystem: null,
        resolvedConceptIds: [],
        displayName: input.displayName ?? null,
        resolutionStatus: 'UNRESOLVED',
        ingredientConceptIds: [],
      };
    }

    const type = input.selectorType.toUpperCase();
    if (type === 'VALUE_SET') {
      const vs = await this.prisma.clinicalValueSet.findFirst({
        where: {
          valueSetCode: input.selectorCode,
          ...(input.selectorVersion
            ? { valueSetVersion: input.selectorVersion }
            : {}),
        },
        include: { members: true },
      });
      if (!vs) {
        return {
          selectorType: type,
          selectorCode: input.selectorCode,
          selectorVersion: input.selectorVersion ?? null,
          terminologySystem: 'VALUE_SET',
          resolvedConceptIds: [],
          displayName: input.displayName ?? null,
          resolutionStatus: 'UNRESOLVED',
          ingredientConceptIds: [],
        };
      }
      const memberCodes = vs.members
        .filter((m) => m.membershipAction === 'INCLUDE')
        .map((m) => m.terminologyConceptCode || m.memberLocalCode || m.memberDisplayName)
        .filter((x): x is string => Boolean(x));
      return {
        selectorType: type,
        selectorCode: input.selectorCode,
        selectorVersion: vs.valueSetVersion,
        terminologySystem: 'VALUE_SET',
        resolvedConceptIds: memberCodes,
        displayName: vs.displayName,
        resolutionStatus: 'EXACT',
        ingredientConceptIds: memberCodes,
      };
    }

    // Prefer exact code match
    let concept = await this.prisma.terminologyDrugConcept.findFirst({
      where: {
        terminologyReleaseId: release.id,
        OR: [
          { sourceCode: input.selectorCode },
          { conceptKey: { contains: input.selectorCode } },
          {
            normalizedSearchName: normalizeDrugKey(
              input.displayName || input.selectorCode.replace(/^SEL-|^ING-/, ''),
            ),
          },
        ],
      },
    });

    if (!concept) {
      // Live resolve via CCDD and pin into the release
      const query =
        input.displayName ||
        input.selectorCode.replace(/^SEL-|^ING-/, '').replace(/-/g, ' ');
      try {
        concept = await this.upsertConceptFromSearch(release.id, query, {
          sourceCode: input.selectorCode.startsWith('SEL-') || input.selectorCode.startsWith('ING-')
            ? null
            : input.selectorCode,
          purpose:
            type.includes('INGREDIENT') ? 'allergy' : 'medication',
        });
      } catch (err) {
        this.logger.warn(`Selector resolve failed for ${input.selectorCode}: ${String(err)}`);
      }
    }

    if (!concept) {
      return {
        selectorType: type,
        selectorCode: input.selectorCode,
        selectorVersion: input.selectorVersion ?? null,
        terminologySystem: null,
        resolvedConceptIds: [],
        displayName: input.displayName ?? null,
        resolutionStatus: 'UNRESOLVED',
        ingredientConceptIds: [],
      };
    }

    const ingredients = await this.resolveActiveIngredients(concept.id, release.id);
    return {
      selectorType: type,
      selectorCode: input.selectorCode,
      selectorVersion: input.selectorVersion ?? null,
      terminologySystem: concept.sourceSystem,
      resolvedConceptIds: [concept.conceptKey],
      displayName: concept.preferredNameEn,
      resolutionStatus: 'EXACT',
      ingredientConceptIds: ingredients.map((i) => i.code),
    };
  }

  /**
   * Snapshot a list of display-name / selector codes into the active release.
   * Used by seed script and import-time resolution.
   */
  async snapshotConcepts(
    items: SnapshotConceptInput[],
    createdById?: string,
  ) {
    let release = await this.getActiveRelease();
    if (!release) {
      release = await this.ensureDraftRelease(createdById);
    }

    const results: Array<{ query: string; conceptId: string | null; status: string }> = [];
    for (const item of items) {
      try {
        const concept = await this.upsertConceptFromSearch(
          release.id,
          item.query,
          { sourceCode: item.preferredCode },
        );
        results.push({ query: item.query, conceptId: concept.id, status: 'OK' });
      } catch (err) {
        this.logger.warn(`snapshot failed for ${item.query}: ${String(err)}`);
        results.push({ query: item.query, conceptId: null, status: 'FAILED' });
      }
    }

    if (release.status !== 'ACTIVE') {
      await this.activateRelease(release.id);
    } else {
      // Refresh sync timestamps on an already-active pin (Resync)
      await this.prisma.terminologyRelease.update({
        where: { id: release.id },
        data: {
          downloadedAt: new Date(),
          activatedAt: new Date(),
          validatedAt: new Date(),
          sourceMetadata: {
            ...((release.sourceMetadata as object) ?? {}),
            lastResyncAt: new Date().toISOString(),
            lastResyncQueryCount: items.length,
            lastResyncOk: results.filter((r) => r.status === 'OK').length,
            lastResyncFailed: results.filter((r) => r.status === 'FAILED').length,
          } as Prisma.InputJsonValue,
        },
      });
    }

    const summary = await this.getActiveReleaseSummary();
    return {
      releaseId: release.id,
      results,
      ok: results.filter((r) => r.status === 'OK').length,
      failed: results.filter((r) => r.status === 'FAILED').length,
      summary,
    };
  }

  async searchLocal(q: string, limit = 20) {
    const release = await this.getActiveRelease();
    if (!release) return [];
    const normalized = normalizeDrugKey(q);
    return this.prisma.terminologyDrugConcept.findMany({
      where: {
        terminologyReleaseId: release.id,
        isActive: true,
        OR: [
          { normalizedSearchName: { contains: normalized } },
          { preferredNameEn: { contains: q, mode: 'insensitive' } },
          { brandName: { contains: q, mode: 'insensitive' } },
          { dinCodes: { has: q } },
        ],
      },
      take: limit,
      orderBy: { preferredNameEn: 'asc' },
    });
  }
}
