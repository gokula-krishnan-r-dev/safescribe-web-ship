import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { TenantStatus } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { ROLES, SAFESCRIBE_MODULES } from '@safescript/shared';
import { UpdateTenantDto } from './dto/tenant.dto';

@Injectable()
export class TenantsService {
  constructor(private prisma: PrismaService) {}

  async list() {
    const tenants = await this.prisma.tenant.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { users: { where: { deletedAt: null } } } },
        entitlements: {
          where: { module: SAFESCRIBE_MODULES.PRESCRIBE },
          select: { active: true, includedQuantity: true, period: true },
        },
        users: {
          where: { deletedAt: null, role: { name: ROLES.PHARMACIST_ADMIN } },
          take: 1,
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            status: true,
            lastLoginAt: true,
          },
        },
      },
    });

    const pharmacistCounts = tenants.length
      ? await this.prisma.user.groupBy({
          by: ['tenantId'],
          where: {
            deletedAt: null,
            tenantId: { in: tenants.map((tenant) => tenant.id) },
            role: { name: ROLES.PHARMACIST },
          },
          _count: { _all: true },
        })
      : [];
    const pharmacistsByTenant = new Map(
      pharmacistCounts.map((row) => [row.tenantId, row._count._all]),
    );

    return tenants.map((tenant) => {
      const admin = tenant.users[0] ?? null;
      const prescribe = tenant.entitlements[0] ?? null;
      return {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        status: tenant.status,
        faxNumber: tenant.faxNumber,
        phone: tenant.phone,
        address: tenant.address,
        pharmacyLicenseNumber: tenant.pharmacyLicenseNumber,
        phixCustomer: tenant.phixCustomer,
        phixPharmacyId: tenant.phixPharmacyId,
        timezone: tenant.timezone,
        createdAt: tenant.createdAt,
        updatedAt: tenant.updatedAt,
        userCount: tenant._count.users,
        pharmacistCount: pharmacistsByTenant.get(tenant.id) ?? 0,
        prescribe: prescribe
          ? {
              active: prescribe.active,
              included: prescribe.includedQuantity,
              period: prescribe.period,
            }
          : null,
        admin: admin
          ? {
              id: admin.id,
              fullName: `${admin.firstName} ${admin.lastName}`,
              email: admin.email,
              status: admin.status,
              lastLoginAt: admin.lastLoginAt,
            }
          : null,
      };
    });
  }

  async findById(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        users: {
          where: { deletedAt: null },
          include: { role: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!tenant) throw new NotFoundException('Pharmacy not found');

    const admin = tenant.users.find((u) => u.role.name === ROLES.PHARMACIST_ADMIN) ?? null;
    const pharmacists = tenant.users.filter((u) => u.role.name === ROLES.PHARMACIST);

    return {
      id: tenant.id,
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status,
      faxNumber: tenant.faxNumber,
      phone: tenant.phone,
      address: tenant.address,
      createdAt: tenant.createdAt,
      updatedAt: tenant.updatedAt,
      hasLogo: Boolean(tenant.logoStorageKey),
      admin: admin
        ? {
            id: admin.id,
            firstName: admin.firstName,
            lastName: admin.lastName,
            fullName: `${admin.firstName} ${admin.lastName}`,
            email: admin.email,
            status: admin.status,
            lastLoginAt: admin.lastLoginAt,
            createdAt: admin.createdAt,
            emailVerifiedAt: admin.emailVerifiedAt,
          }
        : null,
      counts: {
        totalUsers: tenant.users.length,
        pharmacists: pharmacists.length,
        admins: admin ? 1 : 0,
      },
      users: tenant.users.map((u) => ({
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        fullName: `${u.firstName} ${u.lastName}`,
        status: u.status,
        role: u.role.name,
        roleDisplayName: u.role.displayName,
        lastLoginAt: u.lastLoginAt,
        createdAt: u.createdAt,
      })),
    };
  }

  async update(id: string, dto: UpdateTenantDto) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('Pharmacy not found');

    const data: {
      name?: string;
      faxNumber?: string | null;
      phone?: string | null;
      address?: string | null;
    } = {};

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) throw new BadRequestException('Please enter a pharmacy name');
      data.name = name;
    }
    if (dto.faxNumber !== undefined) {
      data.faxNumber = optionalPharmacyContact(dto.faxNumber, 'fax number');
    }
    if (dto.phone !== undefined) {
      data.phone = optionalPharmacyContact(dto.phone, 'phone number');
    }
    if (dto.address !== undefined) {
      const address = (dto.address ?? '').replace(/\s+/g, ' ').trim();
      if (address.length > 240) {
        throw new BadRequestException('Please enter a shorter pharmacy address');
      }
      data.address = address || null;
    }

    return this.prisma.tenant.update({
      where: { id },
      data,
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        faxNumber: true,
        phone: true,
        address: true,
        updatedAt: true,
      },
    });
  }

  async updateStatus(id: string, status: TenantStatus) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('Pharmacy not found');

    return this.prisma.tenant.update({
      where: { id },
      data: { status },
      select: { id: true, name: true, status: true, updatedAt: true },
    });
  }
}

function optionalPharmacyContact(
  raw: string | null | undefined,
  label: string,
): string | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 10 || digits.length > 15) {
    throw new BadRequestException(`Please enter a valid ${label}`);
  }
  return trimmed;
}
