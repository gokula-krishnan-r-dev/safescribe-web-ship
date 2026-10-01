import { Controller, Get, Param, Query, UseGuards, Res } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Response } from 'express';
import { AuditService } from './audit.service';
import { ListAuditLogsQueryDto } from './dto/audit.dto';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { SuperAdminScopeGuard } from '@/common/guards/super-admin-scope.guard';
import { CurrentUser, PLATFORM_ACCESS, RequirePlatformAccess, Roles } from '@/common/decorators/auth.decorator';
import { ROLES } from '@safescript/shared';
import type { RequestUser } from '@/common/decorators/auth.decorator';

@ApiTags('audit')
@Controller('audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard, SuperAdminScopeGuard)
@RequirePlatformAccess(PLATFORM_ACCESS.PHARMACY)
@ApiBearerAuth()
export class AuditController {
  constructor(private auditService: AuditService) {}

  @Get()
  @Roles(ROLES.SUPER_ADMIN, ROLES.PHARMACIST_ADMIN)
  @ApiOperation({ summary: 'List audit logs' })
  list(@Query() query: ListAuditLogsQueryDto, @CurrentUser() user: RequestUser) {
    return this.auditService.list(query, user);
  }

  @Get('export')
  @Roles(ROLES.SUPER_ADMIN, ROLES.PHARMACIST_ADMIN)
  @ApiOperation({ summary: 'Export audit logs as CSV' })
  async export(
    @Query() query: ListAuditLogsQueryDto,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    const result = await this.auditService.list({ ...query, limit: 10000, page: 1 }, user);
    const headers = [
      'Timestamp',
      'User',
      'Role',
      'Organization',
      'Action',
      'Module',
      'Status',
      'IP Address',
      'Browser',
    ];
    const rows = result.data.map((log) => [
      new Date(log.createdAt).toISOString(),
      log.userName ?? '',
      log.userRole ?? '',
      log.organization ?? '',
      log.action,
      log.module,
      log.status,
      log.ipAddress ?? '',
      (log.userAgent ?? '').replace(/,/g, ';'),
    ]);
    const csv = [headers, ...rows].map((row) => row.map((c) => `"${c}"`).join(',')).join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=audit-logs.csv');
    res.send(csv);
  }

  @Get(':id')
  @Roles(ROLES.SUPER_ADMIN, ROLES.PHARMACIST_ADMIN)
  @ApiOperation({ summary: 'Get audit log by ID' })
  findOne(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.auditService.findById(id, user);
  }
}
