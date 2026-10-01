import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ROLES } from '@safescript/shared';
import { CurrentUser, PLATFORM_ACCESS, RequirePlatformAccess, Roles, type RequestUser } from '@/common/decorators/auth.decorator';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { SuperAdminScopeGuard } from '@/common/guards/super-admin-scope.guard';
import { DocFormatService } from './doc-format.service';
import { ApplyDocFormatsDto, PreviewDocFormatDto, ResetDocFormatDto } from './dto/doc-format.dto';

@ApiTags('Doc Download Format')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, SuperAdminScopeGuard)
@Controller()
export class DocFormatController {
  constructor(private readonly service: DocFormatService) {}

  // ── Super Admin ────────────────────────────────────────────────────────────

  @Get('admin/doc-formats')
  @Roles(ROLES.SUPER_ADMIN)
  @RequirePlatformAccess(PLATFORM_ACCESS.CLINICAL)
  @ApiOperation({ summary: 'List all document format templates (Super Admin)' })
  getCatalog() {
    return this.service.getCatalog();
  }

  @Post('admin/doc-formats/apply')
  @Roles(ROLES.SUPER_ADMIN)
  @RequirePlatformAccess(PLATFORM_ACCESS.CLINICAL)
  @ApiOperation({ summary: 'Save and publish document format edits (live)' })
  apply(
    @Body() dto: ApplyDocFormatsDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.apply(dto, user, req);
  }

  @Post('admin/doc-formats/reset')
  @Roles(ROLES.SUPER_ADMIN)
  @RequirePlatformAccess(PLATFORM_ACCESS.CLINICAL)
  @ApiOperation({ summary: 'Reset one document format to defaults' })
  resetOne(
    @Body() dto: ResetDocFormatDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.resetOne(dto.key, user, req);
  }

  @Post('admin/doc-formats/reset-all')
  @Roles(ROLES.SUPER_ADMIN)
  @RequirePlatformAccess(PLATFORM_ACCESS.CLINICAL)
  @ApiOperation({ summary: 'Reset all document formats to defaults' })
  resetAll(@CurrentUser() user: RequestUser, @Req() req: Request) {
    return this.service.resetAll(user, req);
  }

  @Post('admin/doc-formats/preview')
  @Roles(ROLES.SUPER_ADMIN)
  @RequirePlatformAccess(PLATFORM_ACCESS.CLINICAL)
  @ApiOperation({ summary: 'Preview document format card + example content' })
  preview(@Body() dto: PreviewDocFormatDto) {
    return this.service.preview(dto);
  }

  // ── Runtime (pharmacists / admins using Doc module) ────────────────────────

  @Get('doc-formats')
  @Roles(ROLES.SUPER_ADMIN, ROLES.PHARMACIST_ADMIN, ROLES.PHARMACIST)
  @ApiOperation({ summary: 'Published document formats for the consultation Doc module' })
  getPublished() {
    return this.service.getPublishedFormats();
  }
}
