import { Body, Controller, Get, Param, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { SuperAdminScopeGuard } from '@/common/guards/super-admin-scope.guard';
import { CurrentUser, PLATFORM_ACCESS, RequirePlatformAccess, Roles } from '@/common/decorators/auth.decorator';
import type { RequestUser } from '@/common/decorators/auth.decorator';
import { ROLES, SAFESCRIBE_MODULES } from '@safescript/shared';
import { EntitlementsService } from './entitlements.service';
import { UpdatePharmacyEntitlementsDto } from './dto/entitlement.dto';

@ApiTags('Entitlements')
@Controller('entitlements')
@UseGuards(JwtAuthGuard, RolesGuard, SuperAdminScopeGuard)
@ApiBearerAuth()
export class EntitlementsController {
  constructor(private entitlements: EntitlementsService) {}

  @Get('usage')
  @ApiOperation({ summary: 'Current pharmacy module usage for the signed-in user' })
  async myUsage(
    @CurrentUser() user: RequestUser,
    @Query('module') module?: string,
  ) {
    if (!user.tenantId) {
      return {
        timezone: null,
        entitlements: [],
        current: null,
      };
    }
    const mod = module?.trim() || SAFESCRIBE_MODULES.PRESCRIBE;
    const current = await this.entitlements.getUsageSnapshot(user.tenantId, mod);
    return {
      timezone: current.timezone,
      current,
    };
  }

  @Get('platform/overview')
  @Roles(ROLES.SUPER_ADMIN)
  @RequirePlatformAccess(PLATFORM_ACCESS.PHARMACY)
  @ApiOperation({ summary: 'Batched Prescribe usage across all pharmacies' })
  platformOverview(@Query('module') module?: string) {
    const mod = module?.trim() || SAFESCRIBE_MODULES.PRESCRIBE;
    return this.entitlements.listPlatformUsageOverview(mod);
  }

  @Get('pharmacy/:tenantId/analysis')
  @Roles(ROLES.SUPER_ADMIN)
  @RequirePlatformAccess(PLATFORM_ACCESS.PHARMACY)
  @ApiOperation({ summary: 'Pharmacist breakdown and 7-day usage trend for a pharmacy' })
  pharmacyAnalysis(
    @Param('tenantId') tenantId: string,
    @Query('module') module?: string,
  ) {
    const mod = module?.trim() || SAFESCRIBE_MODULES.PRESCRIBE;
    return this.entitlements.getPharmacyUsageAnalysis(tenantId, mod);
  }

  @Get('pharmacy/:tenantId')
  @Roles(ROLES.SUPER_ADMIN)
  @RequirePlatformAccess(PLATFORM_ACCESS.PHARMACY)
  @ApiOperation({ summary: 'List entitlements and usage for a pharmacy' })
  listForPharmacy(@Param('tenantId') tenantId: string) {
    return this.entitlements.listForTenant(tenantId);
  }

  @Put('pharmacy/:tenantId')
  @Roles(ROLES.SUPER_ADMIN)
  @RequirePlatformAccess(PLATFORM_ACCESS.PHARMACY)
  @ApiOperation({ summary: 'Update pharmacy timezone and module allowances' })
  async updatePharmacy(
    @Param('tenantId') tenantId: string,
    @Body() dto: UpdatePharmacyEntitlementsDto,
  ) {
    if (dto.timezone) {
      await this.entitlements.updateTenantTimezone(tenantId, dto.timezone);
    }
    if (dto.items?.length) {
      for (const item of dto.items) {
        await this.entitlements.upsertEntitlement(tenantId, item.module, item);
      }
    }
    return this.entitlements.listForTenant(tenantId);
  }
}
