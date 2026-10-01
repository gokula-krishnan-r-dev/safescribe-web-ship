import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import {
  reviewerLibrarySearchText,
  reviewerLibraryStableKey,
  sanitizeLibrarySearch,
} from '@safescript/shared';
import type { RequestUser } from '@/common/decorators/auth.decorator';
import { getClientInfo } from '@/common/utils/client-info';
import { AuditService } from '@/modules/audit/audit.service';
import { PrismaService } from '@/prisma/prisma.service';
import type {
  ListReviewerLibraryQueryDto,
  SaveReviewerLibraryDto,
  SearchReviewerLibraryQueryDto,
} from './reviewer-library.dto';

const AUDIT_MODULE = 'REVIEWER_LIBRARY';

export type ReviewerLibraryFields = {
  reviewerType: string;
  name: string;
  credentials: string;
  organization?: string | null;
  role: string;
};

@Injectable()
export class ReviewerLibraryService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async list(query: ListReviewerLibraryQueryDto, user: RequestUser) {
    this.assertClinicalAccess(user);
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 25;
    const search = sanitizeLibrarySearch(query.search);
    const sort = query.sort ?? 'updatedAt';
    const order = query.order ?? 'desc';
    const status = query.status ?? 'active';

    const where: Prisma.ReviewerLibraryItemWhereInput = {
      ...(search ? { searchText: { contains: search, mode: 'insensitive' } } : {}),
      ...(query.reviewerType && query.reviewerType !== 'all'
        ? { reviewerType: query.reviewerType }
        : {}),
      ...(status === 'retired' ? { isRetired: true } : status === 'all' ? {} : { isRetired: false }),
    };

    const orderBy: Prisma.ReviewerLibraryItemOrderByWithRelationInput =
      sort === 'name'
        ? { name: order }
        : sort === 'reviewerType'
          ? { reviewerType: order }
          : sort === 'pathwayUsageCount'
            ? { pathwayUsageCount: order }
            : { updatedAt: order };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.reviewerLibraryItem.count({ where }),
      this.prisma.reviewerLibraryItem.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      data: items,
      meta: {
        total,
        page,
        limit: pageSize,
        totalPages: Math.max(1, Math.ceil(total / pageSize)),
      },
    };
  }

  async search(query: SearchReviewerLibraryQueryDto, user: RequestUser) {
    this.assertClinicalAccess(user);
    const q = sanitizeLibrarySearch(query.q);
    const page = query.page ?? 1;
    const pageSize = Math.min(query.pageSize ?? 20, 50);
    const linked = query.pathwayId
      ? await this.prisma.pathwayReviewer.findMany({
          where: { pathwayId: query.pathwayId, libraryReviewerId: { not: null } },
          select: { libraryReviewerId: true, reviewerType: true },
        })
      : [];
    const linkedKeys = new Set(
      linked
        .filter((row) => row.libraryReviewerId)
        .map((row) => `${row.libraryReviewerId}:${row.reviewerType}`),
    );

    const where: Prisma.ReviewerLibraryItemWhereInput = {
      isRetired: false,
      ...(q ? { searchText: { contains: q, mode: 'insensitive' } } : {}),
      ...(query.reviewerType ? { reviewerType: query.reviewerType } : {}),
    };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.reviewerLibraryItem.count({ where }),
      this.prisma.reviewerLibraryItem.findMany({
        where,
        orderBy: [{ pathwayUsageCount: 'desc' }, { name: 'asc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    return {
      data: items.map((item) => ({
        ...item,
        alreadyLinked: linkedKeys.has(`${item.id}:${query.reviewerType || item.reviewerType}`),
      })),
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
    return this.load(id);
  }

  async create(dto: SaveReviewerLibraryDto, user: RequestUser, req: Request) {
    this.assertClinicalAccess(user);
    const data = this.normalize(dto, user.id);
    const existing = await this.prisma.reviewerLibraryItem.findUnique({
      where: { stableKey: data.stableKey },
    });
    if (existing) {
      throw new ConflictException('A master reviewer with this name, credentials, and organization already exists.');
    }
    const created = await this.prisma.reviewerLibraryItem.create({ data });
    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'reviewer_library_created',
      module: AUDIT_MODULE,
      newValue: created,
      ...getClientInfo(req),
    });
    return created;
  }

  async update(id: string, dto: SaveReviewerLibraryDto, user: RequestUser, req: Request) {
    this.assertClinicalAccess(user);
    const existing = await this.load(id);
    if (existing.isRetired) {
      throw new ConflictException('Retired reviewers cannot be edited. Restore them first.');
    }
    const next = this.normalize(dto, user.id);
    const { createdById: _createdById, ...data } = next;
    if (next.stableKey !== existing.stableKey) {
      const clash = await this.prisma.reviewerLibraryItem.findUnique({
        where: { stableKey: next.stableKey },
      });
      if (clash && clash.id !== id) {
        throw new ConflictException(
          'Another master reviewer already uses this name, credentials, and organization.',
        );
      }
    }
    const updated = await this.prisma.reviewerLibraryItem.update({
      where: { id },
      data,
    });
    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'reviewer_library_updated',
      module: AUDIT_MODULE,
      previousValue: existing,
      newValue: updated,
      ...getClientInfo(req),
    });
    return updated;
  }

  async retire(id: string, user: RequestUser, req: Request) {
    this.assertClinicalAccess(user);
    const existing = await this.load(id);
    const updated = await this.prisma.reviewerLibraryItem.update({
      where: { id },
      data: { isRetired: true, updatedById: user.id },
    });
    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'reviewer_library_retired',
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
    const updated = await this.prisma.reviewerLibraryItem.update({
      where: { id },
      data: { isRetired: false, updatedById: user.id },
    });
    await this.audit.log({
      userId: user.id,
      tenantId: user.tenantId ?? null,
      action: 'reviewer_library_restored',
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
    const rows = await this.prisma.pathwayReviewer.findMany({
      where: { libraryReviewerId: id },
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
        reviewerType: row.reviewerType,
        pathwayReviewerId: row.id,
      })),
    };
  }

  async upsertFromReviewer(fields: ReviewerLibraryFields, user: RequestUser) {
    const stableKey = reviewerLibraryStableKey(fields);
    const existing = await this.prisma.reviewerLibraryItem.findUnique({
      where: { stableKey },
    });
    if (existing) return existing;
    return this.prisma.reviewerLibraryItem.create({
      data: {
        reviewerType: fields.reviewerType,
        name: fields.name.trim(),
        credentials: fields.credentials.trim(),
        organization: fields.organization?.trim() || null,
        role: fields.role.trim(),
        searchText: reviewerLibrarySearchText(fields),
        stableKey,
        createdById: user.id,
        updatedById: user.id,
      },
    });
  }

  async recountUsage(itemId: string) {
    const count = await this.prisma.pathwayReviewer.count({
      where: { libraryReviewerId: itemId },
    });
    await this.prisma.reviewerLibraryItem.update({
      where: { id: itemId },
      data: { pathwayUsageCount: count },
    });
  }

  snapshot(item: ReviewerLibraryFields) {
    return {
      reviewerType: item.reviewerType,
      name: item.name,
      credentials: item.credentials,
      organization: item.organization?.trim() || null,
      role: item.role,
    };
  }

  private async load(id: string) {
    const item = await this.prisma.reviewerLibraryItem.findUnique({ where: { id } });
    if (!item) throw new NotFoundException('Master reviewer not found');
    return item;
  }

  private normalize(dto: SaveReviewerLibraryDto, userId: string) {
    const fields = {
      reviewerType: dto.reviewerType,
      name: dto.name.trim(),
      credentials: dto.credentials.trim(),
      organization: dto.organization?.trim() || null,
      role: dto.role.trim(),
    };
    return {
      ...fields,
      searchText: reviewerLibrarySearchText(fields),
      stableKey: reviewerLibraryStableKey(fields),
      updatedById: userId,
      createdById: userId,
    };
  }

  private assertClinicalAccess(user: RequestUser) {
    if (user.role === 'SUPER_ADMIN') return;
    throw new ForbiddenException('Reviewer library is managed from the clinical platform.');
  }
}
