import { Controller, Get, Param, Patch, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { TenantStatus } from '@prisma/client';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { SuperAdminScopeGuard } from '@/common/guards/super-admin-scope.guard';
import { PLATFORM_ACCESS, RequirePlatformAccess, Roles } from '@/common/decorators/auth.decorator';
import { ROLES } from '@safescript/shared';
import { TenantsService } from './tenants.service';
import { UpdateTenantDto } from './dto/tenant.dto';

@ApiTags('tenants')
@Controller('tenants')
@UseGuards(JwtAuthGuard, RolesGuard, SuperAdminScopeGuard)
@Roles(ROLES.SUPER_ADMIN)
@RequirePlatformAccess(PLATFORM_ACCESS.PHARMACY)
@ApiBearerAuth()
export class TenantsController {
  constructor(private tenantsService: TenantsService) {}

  @Get()
  async list() {
    return this.tenantsService.list();
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.tenantsService.findById(id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() dto: UpdateTenantDto) {
    return this.tenantsService.update(id, dto);
  }

  @Patch(':id/status')
  async updateStatus(@Param('id') id: string, @Body('status') status: TenantStatus) {
    return this.tenantsService.updateStatus(id, status);
  }
}
