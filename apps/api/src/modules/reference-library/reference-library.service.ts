import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import {
  evidenceReferenceSearchText,
  evidenceReferenceStableKey,
  sanitizeLibrarySearch,
  shouldRevokeVerificationOnEdit,
} from '@safescript/shared';
import type { RequestUser } from '@/common/decorators/auth.decorator';
import { getClientInfo } from '@/common/utils/client-info';
import { AuditService } from '@/modules/audit/audit.service';
import { PrismaService } from '@/prisma/prisma.service';
import type {
  ListReferenceLibraryQueryDto,
  SaveReferenceLibraryDto,
  SearchReferenceLibraryQueryDto,
} from './reference-library.dto';

const AUDIT_MODULE = 'REFERENCE_LIBRARY';

export type EvidenceCitationFields = {
  citationTitle: string;
  organization?: string | null;
  edition?: string | null;
  publicationYear?: number | null;
  url?: string | null;
  doi?: string | null;
  documentType?: string | null;
  jurisdiction?: string | null;
  referenceType?: string | null;
  status?: string | null;
  verifiedBy?: string | null;
  verificationDate?: Date | string | null;
  importSource?: string | null;
  clinicalUseTags?: string[];
  suggestedSections?: string[];
  documentationCandidate?: boolean;
  verificationRequired?: boolean;
  notes?: string | null;
};

@Injectable()
export class ReferenceLibraryService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async list(query: ListReferenceLibraryQueryDto, user: RequestUser) {
    this.assertClinicalAccess(user);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const search = sanitizeLibrarySearch(query.search);
    const sort = query.sort ?? 'updatedAt';
    const order = query.order ?? 'desc';

    const where: Prisma.EvidenceReferenceLibraryItemWhereInput = {
      ...(search ? { searchText: { contains: search, mode: 'insensitive' } } : {}),
      ...(query.documentType ? { documentType: query.documentType } : {}),
      ...this.statusWhere(query.status),
    };

    const orderBy: Prisma.EvidenceReferenceLibraryItemOrderByWithRelationInput =
      sort === 'citationTitle'
        ? { citationTitle: order }
        : sort === 'status'
          ? { status: order }
          : sort === 'pathwayUsageCount'
            ? { pathwayUsageCount: order }
            : { updatedAt: order };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.evidenceReferenceLibraryItem.count({ where }),
      this.prisma.evidenceReferenceLibraryItem.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      data: await this.withPathwayIds(items),
      meta: {
        total,
        page,
        limit: pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  async search(query: SearchReferenceLibraryQueryDto, user: RequestUser) {
    this.assertClinicalAccess(user);
    const q = sanitizeLibrarySearch(query.q);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 50);
    const linkedIds = query.pathwayId
      ? (
          await this.prisma.pathwayEvidenceReference.findMany({
            where: { pathwayId: query.pathwayId, libraryItemId: { not: null } },
            select: { libraryItemId: true },
          })
        )
          .map((row) => row.libraryItemId)
          .filter((id): id is string => Boolean(id))
      : [];

    const where: Prisma.EvidenceReferenceLibraryItemWhereInput = {
      isRetired: false,
      ...(q ? { searchText: { contains: q, mode: 'insensitive' } } : {}),
    };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.evidenceReferenceLibraryItem.count({ where }),
      this.prisma.evidenceReferenceLibraryItem.findMany({
        where,
        orderBy: [{ pathwayUsageCount: 'desc' }, { updatedAt: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    const linked = new Set(linkedIds);
    return {
      data: items.map((item) => ({ ...item, alreadyLinked: linked.has(item.id) })),
      meta: {
        total,
        page,
        limit: pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  async get(id: string, user: RequestUser) {
    this.assertClinicalAccess(user);
    const item = await this.load(id);
    const [withIds] = await this.withPathwayIds([item]);
    return withIds;
  }

  async create(dto: SaveReferenceLibraryDto, user: RequestUser, req: Request) {
    this.assertClinicalAccess(user);
    const data = this.normalize(dto, user.id);
    const existing = await this.prisma.evidenceReferenceLibraryItem.findUnique({
      where: { stableKey: data.stableKey },
    });
    if (existing) {
      throw new ConflictException('A master reference with this title, organization, and year already exists.');
    }
    const created = await this.prisma.evidenceReferenceLibraryItem.create({ data });
    if (dto.pathwayIds?.length) {
      await this.linkToPathways(created.id, dto.pathwayIds, dto.suggestedSections ?? [], user);
    }
    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'reference_library_created',
      module: AUDIT_MODULE,
      newValue: created,
      ...getClientInfo(req),
    });
    const [withIds] = await this.withPathwayIds([created]);
    return withIds;
  }

  async update(id: string, dto: SaveReferenceLibraryDto, user: RequestUser, req: Request) {
    this.assertClinicalAccess(user);
    const existing = await this.load(id);
    if (existing.isRetired) {
      throw new ConflictException('Retired references cannot be edited. Restore them first.');
    }
    const next = this.normalize(dto, user.id, existing);
    const { createdById: _createdById, ...data } = next;
    if (next.stableKey !== existing.stableKey) {
      const clash = await this.prisma.evidenceReferenceLibraryItem.findUnique({
        where: { stableKey: next.stableKey },
      });
      if (clash && clash.id !== id) {
        throw new ConflictException('Another master reference already uses this title, organization, and year.');
      }
    }
    const revoke = shouldRevokeVerificationOnEdit(existing, dto);
    let status = next.status;
    if (revoke && status === 'verified') status = 'needs_review';
    const updated = await this.prisma.evidenceReferenceLibraryItem.update({
      where: { id },
      data: {
        ...data,
        status,
        verifiedBy: status === 'verified' ? next.verifiedBy : revoke ? null : next.verifiedBy,
        verificationDate:
          status === 'verified'
            ? next.verificationDate ?? existing.verificationDate ?? new Date()
            : revoke
              ? null
              : next.verificationDate,
      },
    });
    if (dto.pathwayIds !== undefined) {
      await this.linkToPathways(id, dto.pathwayIds, dto.suggestedSections ?? updated.suggestedSections, user);
    }
    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'reference_library_updated',
      module: AUDIT_MODULE,
      previousValue: existing,
      newValue: updated,
      ...getClientInfo(req),
    });
    const [withIds] = await this.withPathwayIds([updated]);
    return withIds;
  }

  async retire(id: string, user: RequestUser, req: Request) {
    this.assertClinicalAccess(user);
    const existing = await this.load(id);
    const updated = await this.prisma.evidenceReferenceLibraryItem.update({
      where: { id },
      data: { isRetired: true, status: 'archived', updatedById: user.id },
    });
    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'reference_library_retired',
      module: AUDIT_MODULE,
      previousValue: existing,
      newValue: updated,
      ...getClientInfo(req),
    });
    return updated;
  }

  async restore(id: string, user: RequestUser, req: Request) {
    this.assertClinicalAccess(user);
    const existing = await this.load(id);
    const updated = await this.prisma.evidenceReferenceLibraryItem.update({
      where: { id },
      data: {
        isRetired: false,
        status: existing.status === 'archived' ? 'needs_review' : existing.status,
        updatedById: user.id,
      },
    });
    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'reference_library_restored',
      module: AUDIT_MODULE,
      previousValue: existing,
      newValue: updated,
      ...getClientInfo(req),
    });
    return updated;
  }

  async usage(id: string, user: RequestUser) {
    this.assertClinicalAccess(user);
    await this.load(id);
    const rows = await this.prisma.pathwayEvidenceReference.findMany({
      where: { libraryItemId: id },
      include: {
        pathway: { select: { id: true, name: true, province: true, status: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
    return {
      items: rows.map((row) => ({
        pathwayId: row.pathwayId,
        pathwayName: row.pathway.name,
        province: row.pathway.province,
        pathwayStatus: row.pathway.status,
        pathwayReferenceId: row.id,
      })),
    };
  }

  async upsertFromCitation(fields: EvidenceCitationFields, user: RequestUser) {
    const stableKey = evidenceReferenceStableKey({
      citationTitle: fields.citationTitle,
      organization: fields.organization,
      publicationYear: fields.publicationYear,
    });
    const existing = await this.prisma.evidenceReferenceLibraryItem.findUnique({
      where: { stableKey },
    });
    if (existing) {
      // Merge clinical-use tags / sections without overwriting verified bibliographic metadata.
      const mergedTags = [
        ...new Set([...(existing.clinicalUseTags ?? []), ...(fields.clinicalUseTags ?? [])]),
      ];
      const mergedSections = [
        ...new Set([...(existing.suggestedSections ?? []), ...(fields.suggestedSections ?? [])]),
      ];
      const needsMerge =
        mergedTags.length !== (existing.clinicalUseTags?.length ?? 0) ||
        mergedSections.length !== (existing.suggestedSections?.length ?? 0) ||
        (fields.documentationCandidate && !existing.documentationCandidate) ||
        (fields.verificationRequired && !existing.verificationRequired) ||
        (fields.notes && !existing.notes);
      if (!needsMerge) return existing;
      return this.prisma.evidenceReferenceLibraryItem.update({
        where: { id: existing.id },
        data: {
          clinicalUseTags: mergedTags,
          suggestedSections: mergedSections,
          documentationCandidate:
            existing.documentationCandidate || Boolean(fields.documentationCandidate),
          verificationRequired:
            existing.verificationRequired || Boolean(fields.verificationRequired),
          notes: existing.notes || fields.notes?.trim() || null,
          updatedById: user.id,
        },
      });
    }
    return this.prisma.evidenceReferenceLibraryItem.create({
      data: {
        citationTitle: fields.citationTitle.trim(),
        organization: fields.organization?.trim() || null,
        edition: fields.edition?.trim() || null,
        publicationYear: fields.publicationYear ?? null,
        url: fields.url?.trim() || null,
        doi: fields.doi?.trim() || null,
        documentType: fields.documentType?.trim() || null,
        jurisdiction: fields.jurisdiction?.trim() || null,
        referenceType: fields.referenceType?.trim() || 'source',
        status: fields.status || 'needs_review',
        verifiedBy: fields.status === 'verified' ? fields.verifiedBy?.trim() || null : null,
        verificationDate:
          fields.status === 'verified'
            ? fields.verificationDate
              ? new Date(fields.verificationDate)
              : new Date()
            : null,
        importSource: fields.importSource || 'manual',
        clinicalUseTags: fields.clinicalUseTags ?? [],
        suggestedSections: fields.suggestedSections ?? [],
        documentationCandidate: Boolean(fields.documentationCandidate),
        verificationRequired: Boolean(fields.verificationRequired),
        notes: fields.notes?.trim()?.slice(0, 500) || null,
        searchText: evidenceReferenceSearchText(fields),
        stableKey,
        createdById: user.id,
        updatedById: user.id,
      },
    });
  }

  async recountUsage(itemId: string) {
    const count = await this.prisma.pathwayEvidenceReference.count({
      where: { libraryItemId: itemId },
    });
    await this.prisma.evidenceReferenceLibraryItem.update({
      where: { id: itemId },
      data: { pathwayUsageCount: count },
    });
  }

  snapshot(item: {
    citationTitle: string;
    organization: string | null;
    edition: string | null;
    publicationYear: number | null;
    url: string | null;
    doi: string | null;
    documentType: string | null;
    jurisdiction: string | null;
    referenceType: string;
    status: string;
    verifiedBy: string | null;
    verificationDate: Date | null;
    clinicalUseTags?: string[];
    documentationCandidate?: boolean;
    verificationRequired?: boolean;
    notes?: string | null;
  }) {
    return {
      citationTitle: item.citationTitle,
      organization: item.organization,
      edition: item.edition,
      publicationYear: item.publicationYear,
      url: item.url,
      doi: item.doi,
      documentType: item.documentType,
      jurisdiction: item.jurisdiction,
      referenceType: item.referenceType,
      status: item.status,
      verifiedBy: item.verifiedBy,
      verificationDate: item.verificationDate,
      clinicalUseTags: item.clinicalUseTags ?? [],
      documentationCandidate: Boolean(item.documentationCandidate),
      verificationRequired: Boolean(item.verificationRequired),
      notes: item.notes ?? null,
    };
  }

  private async load(id: string) {
    const item = await this.prisma.evidenceReferenceLibraryItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Master reference not found');
    return item;
  }

  private statusWhere(status?: string): Prisma.EvidenceReferenceLibraryItemWhereInput {
    if (!status || status === 'active') return { isRetired: false };
    if (status === 'retired') return { isRetired: true };
    return { status, isRetired: false };
  }

  private normalize(
    dto: SaveReferenceLibraryDto,
    userId: string,
    existing?: { status: string; verifiedBy: string | null; verificationDate: Date | null },
  ) {
    const status = dto.status ?? existing?.status ?? 'needs_review';
    const fields = {
      citationTitle: dto.citationTitle.trim(),
      organization: dto.organization.trim(),
      edition: dto.edition?.trim() || null,
      publicationYear: dto.publicationYear ?? null,
      url: dto.url?.trim() || null,
      doi: dto.doi?.trim() || null,
      documentType: dto.documentType,
      jurisdiction: dto.jurisdiction.trim(),
      referenceType: dto.referenceType?.trim() || 'source',
      status,
      verifiedBy:
        status === 'verified' ? dto.verifiedBy?.trim() || existing?.verifiedBy || null : null,
      verificationDate:
        status === 'verified'
          ? dto.verificationDate
            ? new Date(dto.verificationDate)
            : existing?.verificationDate ?? new Date()
          : null,
      clinicalUseTags: dto.clinicalUseTags ?? [],
      suggestedSections: dto.suggestedSections ?? [],
      documentationCandidate: Boolean(dto.documentationCandidate),
      verificationRequired: Boolean(dto.verificationRequired),
      notes: dto.notes?.trim()?.slice(0, 500) || null,
    };
    return {
      ...fields,
      searchText: evidenceReferenceSearchText(fields),
      stableKey: evidenceReferenceStableKey(fields),
      updatedById: userId,
      createdById: userId,
    };
  }

  /** Link a master citation onto one or more pathways with optional section suggestions. */
  private async linkToPathways(
    libraryItemId: string,
    pathwayIds: string[],
    suggestedSections: string[],
    user: RequestUser,
  ) {
    const master = await this.load(libraryItemId);
    const uniquePathwayIds = [...new Set(pathwayIds.map((id) => id.trim()).filter(Boolean))];
    for (const pathwayId of uniquePathwayIds) {
      const pathway = await this.prisma.clinicalPathway.findUnique({ where: { id: pathwayId } });
      if (!pathway) continue;
      let link = await this.prisma.pathwayEvidenceReference.findFirst({
        where: { pathwayId, libraryItemId },
      });
      if (!link) {
        link = await this.prisma.pathwayEvidenceReference.create({
          data: {
            pathwayId,
            tenantId: user.tenantId ?? null,
            libraryItemId,
            citationTitle: master.citationTitle,
            organization: master.organization,
            edition: master.edition,
            publicationYear: master.publicationYear,
            url: master.url,
            doi: master.doi,
            documentType: master.documentType,
            jurisdiction: master.jurisdiction,
            referenceType: master.referenceType,
            status: master.status,
            verifiedBy: master.verifiedBy,
            verificationDate: master.verificationDate,
            clinicalUseTags: master.clinicalUseTags,
            documentationCandidate: master.documentationCandidate,
            verificationRequired: master.verificationRequired,
            notes: master.notes,
            importSource: 'library',
            createdById: user.id,
          },
        });
      }
      if (suggestedSections.length) {
        await this.prisma.pathwayEvidenceMapping.createMany({
          data: suggestedSections.map((section) => ({
            pathwayId,
            referenceId: link!.id,
            section,
            mappingType: 'section',
            targetId: '',
            suggested: true,
            createdById: user.id,
          })),
          skipDuplicates: true,
        });
      }
    }
    await this.recountUsage(libraryItemId);
  }

  private async withPathwayIds<T extends { id: string }>(
    items: T[],
  ): Promise<Array<T & { pathwayIds: string[] }>> {
    if (!items.length) return [];
    const links = await this.prisma.pathwayEvidenceReference.findMany({
      where: { libraryItemId: { in: items.map((item) => item.id) } },
      select: { libraryItemId: true, pathwayId: true },
    });
    const byLibrary = new Map<string, string[]>();
    for (const link of links) {
      if (!link.libraryItemId) continue;
      const existing = byLibrary.get(link.libraryItemId) ?? [];
      if (!existing.includes(link.pathwayId)) existing.push(link.pathwayId);
      byLibrary.set(link.libraryItemId, existing);
    }
    return items.map((item) => ({
      ...item,
      pathwayIds: byLibrary.get(item.id) ?? [],
    }));
  }

  private assertClinicalAccess(user: RequestUser) {
    if (user.role === 'SUPER_ADMIN') return;
    throw new ForbiddenException('Reference library is managed from the clinical platform.');
  }
}
