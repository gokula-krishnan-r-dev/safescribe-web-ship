import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { SuperAdminScopeGuard } from '@/common/guards/super-admin-scope.guard';
import {
  CurrentUser,
  PLATFORM_ACCESS,
  RequirePlatformAccess,
  Roles,
  type RequestUser,
} from '@/common/decorators/auth.decorator';
import { ROLES } from '@safescript/shared';
import { PlatformAdminsService } from './platform-admins.service';
import {
  CreatePlatformAdminDto,
  ListPlatformAdminsQueryDto,
  ResetPlatformAdminPasswordDto,
  UpdatePlatformAdminDto,
} from './dto/platform-admin.dto';

@ApiTags('platform-admins')
@Controller('platform-admins')
@UseGuards(JwtAuthGuard, RolesGuard, SuperAdminScopeGuard)
@Roles(ROLES.SUPER_ADMIN)
@RequirePlatformAccess(PLATFORM_ACCESS.FULL)
@ApiBearerAuth()
export class PlatformAdminsController {
  constructor(private readonly service: PlatformAdminsService) {}

  @Get()
  @ApiOperation({ summary: 'List platform administrators (full-access Super Admin)' })
  list(@Query() query: ListPlatformAdminsQueryDto, @CurrentUser() user: RequestUser) {
    return this.service.list(query, user);
  }

  @Post()
  @ApiOperation({ summary: 'Create a platform administrator with a pharmacy/clinical/full function' })
  create(
    @Body() dto: CreatePlatformAdminDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.create(dto, user, req);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a platform administrator' })
  getById(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.service.getById(id, user);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update a platform administrator' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePlatformAdminDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.update(id, dto, user, req);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a platform administrator' })
  delete(@Param('id') id: string, @CurrentUser() user: RequestUser, @Req() req: Request) {
    return this.service.delete(id, user, req);
  }

  @Post(':id/reset-password')
  @ApiOperation({ summary: 'Reset a platform administrator password and revoke sessions' })
  resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetPlatformAdminPasswordDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.resetPassword(id, dto.password, user, req);
  }
}
