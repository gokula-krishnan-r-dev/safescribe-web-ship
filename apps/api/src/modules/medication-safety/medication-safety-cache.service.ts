import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/redis/redis.service';
import {
  SAFETY_ENGINE_VERSION,
  SAFETY_REDIS_KEYS,
  type CachedIngredientEntry,
  type CachedReleaseMeta,
  type CachedSafetyRule,
  type CachedValueSet,
} from './medication-safety.types';
import { buildClassIndex, type CachedClassIndex } from './utils/class-index.util';
import { normalizeDrugKey } from './utils/drug-name.util';
import { gestationalIntervalFromPayload } from './utils/gestational-interval.util';

@Injectable()
export class MedicationSafetyCacheService implements OnModuleInit {
  private readonly logger = new Logger(MedicationSafetyCacheService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async onModuleInit() {
    try {
      const pointer = await this.prisma.safetyReleasePointer.findUnique({
        where: { id: 'singleton' },
      });
      if (!pointer) return;

      const meta = await this.getMeta();
      const ready = await this.isReady();
      // Rebuild when empty OR when Redis still holds a superseded release
      if (ready && meta?.releaseId === pointer.releaseId) return;

      this.logger.log(
        `Warming safety engine cache from release ${pointer.releaseId}` +
          (meta?.releaseId && meta.releaseId !== pointer.releaseId
            ? ` (replacing stale ${meta.version})`
            : ''),
      );
      await this.rebuildFromRelease(pointer.releaseId);
    } catch (error) {
      this.logger.warn(`Failed to warm safety engine cache: ${String(error)}`);
    }
  }

  async cacheRelease(
    releaseId: string,
    version: string,
    checksum: string,
    rules: CachedSafetyRule[],
    ingredients: CachedIngredientEntry[],
    drugClasses: Record<string, string[]>,
    classIndex: CachedClassIndex,
    valueSets: CachedValueSet[] = [],
  ): Promise<void> {
    const meta: CachedReleaseMeta = {
      releaseId,
      version,
      checksum,
      engineVersion: SAFETY_ENGINE_VERSION,
      ruleCount: rules.length,
      ingredientCount: ingredients.length,
      classMemberCount: Object.keys(drugClasses).length,
      taxonomyClassCount: Object.keys(classIndex.taxonomy).length,
      catalogDrugCount: Object.keys(classIndex.drugToDirectClasses).length,
      publishedAt: new Date().toISOString(),
      cachedAt: new Date().toISOString(),
    };

    const ingredientMap: Record<string, CachedIngredientEntry> = {};
    for (const entry of ingredients) {
      ingredientMap[normalizeDrugKey(entry.productName)] = entry;
      if (entry.genericName) {
        ingredientMap[normalizeDrugKey(entry.genericName)] = entry;
      }
    }

    await this.clearCache();
    await Promise.all([
      this.redis.set(SAFETY_REDIS_KEYS.ACTIVE_RELEASE_ID, releaseId),
      this.redis.set(SAFETY_REDIS_KEYS.META, JSON.stringify(meta)),
      this.redis.set(SAFETY_REDIS_KEYS.RULES, JSON.stringify(rules)),
      this.redis.set(SAFETY_REDIS_KEYS.INGREDIENTS, JSON.stringify(ingredientMap)),
      this.redis.set(SAFETY_REDIS_KEYS.DRUG_CLASSES, JSON.stringify(drugClasses)),
      this.redis.set(SAFETY_REDIS_KEYS.CLASS_INDEX, JSON.stringify(classIndex)),
      this.redis.set(SAFETY_REDIS_KEYS.VALUE_SETS, JSON.stringify(valueSets)),
    ]);
  }

  async clearCache(): Promise<void> {
    await Promise.all([
      this.redis.del(SAFETY_REDIS_KEYS.ACTIVE_RELEASE_ID),
      this.redis.del(SAFETY_REDIS_KEYS.META),
      this.redis.del(SAFETY_REDIS_KEYS.RULES),
      this.redis.del(SAFETY_REDIS_KEYS.INGREDIENTS),
      this.redis.del(SAFETY_REDIS_KEYS.DRUG_CLASSES),
      this.redis.del(SAFETY_REDIS_KEYS.CLASS_INDEX),
      this.redis.del(SAFETY_REDIS_KEYS.VALUE_SETS),
    ]);
  }

  async isReady(): Promise<boolean> {
    const [meta, rules] = await Promise.all([
      this.redis.exists(SAFETY_REDIS_KEYS.META),
      this.redis.exists(SAFETY_REDIS_KEYS.RULES),
    ]);
    return Boolean(meta && rules);
  }

  async getMeta(): Promise<CachedReleaseMeta | null> {
    const raw = await this.redis.get(SAFETY_REDIS_KEYS.META);
    return raw ? (JSON.parse(raw) as CachedReleaseMeta) : null;
  }

  async getRules(): Promise<CachedSafetyRule[] | null> {
    const raw = await this.redis.get(SAFETY_REDIS_KEYS.RULES);
    return raw ? (JSON.parse(raw) as CachedSafetyRule[]) : null;
  }

  async getIngredientsMap(): Promise<Record<string, CachedIngredientEntry> | null> {
    const raw = await this.redis.get(SAFETY_REDIS_KEYS.INGREDIENTS);
    return raw ? (JSON.parse(raw) as Record<string, CachedIngredientEntry>) : null;
  }

  async getDrugClassesMap(): Promise<Record<string, string[]> | null> {
    const raw = await this.redis.get(SAFETY_REDIS_KEYS.DRUG_CLASSES);
    return raw ? (JSON.parse(raw) as Record<string, string[]>) : null;
  }

  async getClassIndex(): Promise<CachedClassIndex | null> {
    const raw = await this.redis.get(SAFETY_REDIS_KEYS.CLASS_INDEX);
    return raw ? (JSON.parse(raw) as CachedClassIndex) : null;
  }

  async getValueSets(): Promise<CachedValueSet[] | null> {
    const raw = await this.redis.get(SAFETY_REDIS_KEYS.VALUE_SETS);
    return raw ? (JSON.parse(raw) as CachedValueSet[]) : null;
  }

  async rebuildClassIndexFromDb(): Promise<CachedClassIndex> {
    const [taxonomyRows, catalogRows, membershipRows] = await Promise.all([
      this.prisma.drugClassTaxonomy.findMany(),
      this.prisma.drugCatalog.findMany(),
      this.prisma.drugClassMembership.findMany(),
    ]);

    return buildClassIndex({
      taxonomyRows: taxonomyRows.map((r) => ({
        className: r.className,
        parentClass: r.parentClass,
        therapeuticGroup: r.therapeuticGroup,
        riskTags: r.riskTags,
      })),
      catalogRows: catalogRows.map((r) => ({
        drugName: r.drugName,
        className: r.className,
        ingredient: r.ingredient,
        commonBrands: r.commonBrands,
      })),
      membershipRows: membershipRows.map((r) => ({
        drugName: r.drugName,
        className: r.className,
      })),
    });
  }

  async refreshClassIndexCache(): Promise<void> {
    const classIndex = await this.rebuildClassIndexFromDb();
    const meta = await this.getMeta();
    if (meta) {
      meta.taxonomyClassCount = Object.keys(classIndex.taxonomy).length;
      meta.catalogDrugCount = Object.keys(classIndex.drugToDirectClasses).length;
      meta.classMemberCount = Object.keys(classIndex.drugToDirectClasses).length;
      meta.cachedAt = new Date().toISOString();
      await this.redis.set(SAFETY_REDIS_KEYS.META, JSON.stringify(meta));
    }
    await Promise.all([
      this.redis.set(SAFETY_REDIS_KEYS.DRUG_CLASSES, JSON.stringify(classIndex.drugToDirectClasses)),
      this.redis.set(SAFETY_REDIS_KEYS.CLASS_INDEX, JSON.stringify(classIndex)),
    ]);
  }

  async rebuildFromRelease(releaseId: string): Promise<void> {
    const release = await this.prisma.safetyKnowledgeRelease.findUnique({
      where: { id: releaseId },
      select: { id: true, version: true, checksum: true },
    });
    if (!release) throw new Error('Release not found');

    const rules: CachedSafetyRule[] = [];
    const pageSize = 200;
    let cursor: string | undefined;
    for (;;) {
      const items = await this.prisma.safetyReleaseItem.findMany({
        where: { releaseId },
        take: pageSize,
        ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
        orderBy: { id: 'asc' },
        include: {
          version: {
            include: {
              participants: true,
              rule: true,
              labDetail: true,
              ddiDetail: true,
              drugDiseaseDetail: true,
              pregnancyDetail: true,
              lactationDetail: true,
              renalDetail: true,
            },
          },
        },
      });
      if (!items.length) break;
      for (const item of items) {
        rules.push(this.toCachedRule(item.version));
      }
      cursor = items[items.length - 1]!.id;
      if (items.length < pageSize) break;
    }
    this.logger.log(`Loaded ${rules.length} cached rule(s) for ${release.version}`);

    const [ingredients, classIndex, valueSetRows] = await Promise.all([
      this.prisma.medicationIngredient.findMany(),
      this.rebuildClassIndexFromDb(),
      this.prisma.clinicalValueSet.findMany({
        where: { recordStatus: { in: ['APPROVED', 'PUBLISHED', 'DRAFT'] } },
        include: { members: true },
      }),
    ]);

    const valueSets: CachedValueSet[] = valueSetRows.map((vs) => ({
      valueSetCode: vs.valueSetCode,
      valueSetVersion: vs.valueSetVersion,
      displayName: vs.displayName,
      routeScope: vs.routeScope,
      members: vs.members.map((m) => ({
        membershipAction: m.membershipAction as 'INCLUDE' | 'EXCLUDE',
        memberDisplayName: m.memberDisplayName,
        memberLocalCode: m.memberLocalCode,
        memberRowId: m.sourceRowId ?? m.id,
        terminologyConceptCode: m.terminologyConceptCode,
        terminologyDisplayName: m.terminologyDisplayName,
        routeScope: m.routeScope,
      })),
    }));

    const drugClasses = classIndex.drugToDirectClasses;

    await this.cacheRelease(
      release.id,
      release.version,
      release.checksum,
      rules,
      ingredients.map((i) => ({
        productName: i.productName,
        genericName: i.genericName,
        ingredients: i.ingredients,
      })),
      drugClasses,
      classIndex,
      valueSets,
    );
  }

  private toCachedRule(version: {
    id: string;
    ruleId: string;
    summary: string;
    detail: string;
    clinicalSeverity: string;
    recommendedAction: string;
    overrideAllowed: boolean;
    overrideReasonRequired: boolean;
    matchType: CachedSafetyRule['matchType'];
    relationshipType: string | null;
    deduplicationGroup: string | null;
    specificityRank: number;
    ruleEffect: string | null;
    ruleVersionLabel: string | null;
    rule: { code: string; ruleType: CachedSafetyRule['ruleType']; jurisdiction: string };
    participants: Array<{
      participantKey: string;
      selectorType: CachedSafetyRule['participants'][number]['selectorType'];
      conceptText: string;
      conceptCode: string | null;
      selectorVersion?: string | null;
    }>;
    labDetail: CachedSafetyRule['labDetail'];
    ddiDetail: CachedSafetyRule['ddiDetail'];
    drugDiseaseDetail: CachedSafetyRule['drugDiseaseDetail'];
    pregnancyDetail: CachedSafetyRule['pregnancyDetail'];
    lactationDetail: CachedSafetyRule['lactationDetail'];
    renalDetail: CachedSafetyRule['renalDetail'];
    payload?: unknown;
  }): CachedSafetyRule {
    const payload =
      version.payload && typeof version.payload === 'object' && !Array.isArray(version.payload)
        ? (version.payload as Record<string, unknown>)
        : null;
    const ga = gestationalIntervalFromPayload(payload);
    return {
      ruleId: version.ruleId,
      versionId: version.id,
      code: version.rule.code,
      ruleType: version.rule.ruleType,
      jurisdiction: version.rule.jurisdiction,
      summary: version.summary,
      detail: version.detail,
      clinicalSeverity: version.clinicalSeverity as CachedSafetyRule['clinicalSeverity'],
      recommendedAction: version.recommendedAction,
      overrideAllowed: version.overrideAllowed,
      overrideReasonRequired: version.overrideReasonRequired,
      matchType: version.matchType,
      relationshipType: version.relationshipType,
      deduplicationGroup: version.deduplicationGroup,
      specificityRank: version.specificityRank,
      ruleEffect: version.ruleEffect,
      ruleVersionLabel: version.ruleVersionLabel,
      participants: version.participants.map((p) => ({
        participantKey: p.participantKey,
        selectorType: p.selectorType,
        conceptText: p.conceptText,
        conceptCode: p.conceptCode,
        selectorVersion: p.selectorVersion ?? null,
      })),
      labDetail: version.labDetail,
      ddiDetail: version.ddiDetail,
      drugDiseaseDetail: version.drugDiseaseDetail,
      pregnancyDetail: version.pregnancyDetail
        ? {
            ...version.pregnancyDetail,
            gestationalAgeMinWeeks: ga?.minWeeks ?? null,
            gestationalAgeMinInclusive: ga?.minInclusive,
            gestationalAgeMaxWeeks: ga?.maxWeeks ?? null,
            gestationalAgeMaxInclusive: ga?.maxInclusive,
          }
        : version.pregnancyDetail,
      lactationDetail: version.lactationDetail,
      renalDetail: version.renalDetail,
    };
  }
}
