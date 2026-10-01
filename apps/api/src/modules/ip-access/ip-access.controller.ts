import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { SuperAdminScopeGuard } from '@/common/guards/super-admin-scope.guard';
import { PLATFORM_ACCESS, RequirePlatformAccess, Roles, CurrentUser } from '@/common/decorators/auth.decorator';
import { ROLES } from '@safescript/shared';
import { IpAccessService } from './ip-access.service';
import {
  CreatePharmacyNetworkDto,
  SendNetworkVerificationDto,
  UpdatePharmacyNetworkAccessDto,
  UpdatePharmacyNetworkDto,
} from './dto/pharmacy-network.dto';

@ApiTags('ip-access')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, SuperAdminScopeGuard)
@Roles(ROLES.SUPER_ADMIN)
@RequirePlatformAccess(PLATFORM_ACCESS.PHARMACY)
@Controller('ip-access')
export class IpAccessController {
  constructor(private readonly service: IpAccessService) {}

  @Get('current-ip')
  currentIp(@Req() req: Request) {
    return this.service.getDetectedIp(req);
  }

  @Get('pharmacies')
  list(@CurrentUser() user: any) {
    return this.service.listPharmacyNetworkSummaries(user);
  }

  @Get('pharmacies/:tenantId')
  overview(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.getPharmacyNetworkOverview(tenantId, user, req);
  }

  @Patch('pharmacies/:tenantId')
  updateAccess(
    @Param('tenantId') tenantId: string,
    @Body() dto: UpdatePharmacyNetworkAccessDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.updatePharmacyNetworkAccess(tenantId, dto, user, req);
  }

  @Post('pharmacies/:tenantId/networks')
  addNetwork(
    @Param('tenantId') tenantId: string,
    @Body() dto: CreatePharmacyNetworkDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.addPharmacyNetwork(tenantId, dto, user, req);
  }

  @Post('pharmacies/:tenantId/verifications')
  sendVerification(
    @Param('tenantId') tenantId: string,
    @Body() dto: SendNetworkVerificationDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.sendVerification(tenantId, dto, user, req);
  }

  @Patch('networks/:id')
  updateNetwork(
    @Param('id') id: string,
    @Body() dto: UpdatePharmacyNetworkDto,
    @CurrentUser() user: any,
    @Req() req: Request,
  ) {
    return this.service.updatePharmacyNetwork(id, dto, user, req);
  }

  @Delete('networks/:id')
  removeNetwork(@Param('id') id: string, @CurrentUser() user: any, @Req() req: Request) {
    return this.service.removePharmacyNetwork(id, user, req);
  }

  @Post('networks/:id/approve')
  approve(@Param('id') id: string, @CurrentUser() user: any, @Req() req: Request) {
    return this.service.approveNetwork(id, user, req);
  }

  @Post('networks/:id/reject')
  reject(@Param('id') id: string, @CurrentUser() user: any, @Req() req: Request) {
    return this.service.rejectNetwork(id, user, req);
  }

  @Post('verifications/:id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: any, @Req() req: Request) {
    return this.service.cancelVerification(id, user, req);
  }
}
