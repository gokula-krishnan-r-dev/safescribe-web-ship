import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { Request } from 'express';
import { UsersService } from './users.service';
import {
  CreateUserDto,
  UpdateUserDto,
  ListUsersQueryDto,
  BulkActionDto,
  ResetPasswordDto,
} from './dto/users.dto';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { SuperAdminScopeGuard } from '@/common/guards/super-admin-scope.guard';
import { CurrentUser, PLATFORM_ACCESS, RequirePlatformAccess, Roles, type RequestUser } from '@/common/decorators/auth.decorator';
import { ROLES } from '@safescript/shared';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard, SuperAdminScopeGuard)
@RequirePlatformAccess(PLATFORM_ACCESS.PHARMACY)
@ApiBearerAuth()
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get('pharmacist-admins')
  @Roles(ROLES.SUPER_ADMIN)
  @ApiOperation({ summary: 'List pharmacist admins (Super Admin)' })
  listPharmacistAdmins(
    @Query() query: ListUsersQueryDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.usersService.listPharmacistAdmins(query, user, req);
  }

  @Post('pharmacist-admins')
  @Roles(ROLES.SUPER_ADMIN)
  @ApiOperation({ summary: 'Create pharmacist admin' })
  createPharmacistAdmin(
    @Body() dto: CreateUserDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.usersService.createPharmacistAdmin(dto, user, req);
  }

  @Get('pharmacists')
  @Roles(ROLES.SUPER_ADMIN, ROLES.PHARMACIST_ADMIN)
  @ApiOperation({ summary: 'List pharmacists' })
  listPharmacists(
    @Query() query: ListUsersQueryDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.usersService.listPharmacists(query, user, req);
  }

  @Post('pharmacists')
  @Roles(ROLES.PHARMACIST_ADMIN)
  @ApiOperation({ summary: 'Create pharmacist' })
  createPharmacist(
    @Body() dto: CreateUserDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.usersService.createPharmacist(dto, user, req);
  }

  @Get(':id')
  @Roles(ROLES.SUPER_ADMIN, ROLES.PHARMACIST_ADMIN)
  @ApiOperation({ summary: 'Get user by ID' })
  getUser(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.usersService.getUser(id, user);
  }

  @Patch(':id')
  @Roles(ROLES.SUPER_ADMIN, ROLES.PHARMACIST_ADMIN)
  @ApiOperation({ summary: 'Update user' })
  updateUser(
    @Param('id') id: string,
    @Body() dto: UpdateUserDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.usersService.updateUser(id, dto, user, req);
  }

  @Delete(':id')
  @Roles(ROLES.SUPER_ADMIN, ROLES.PHARMACIST_ADMIN)
  @ApiOperation({ summary: 'Delete user (soft)' })
  deleteUser(@Param('id') id: string, @CurrentUser() user: RequestUser, @Req() req: Request) {
    return this.usersService.deleteUser(id, user, req);
  }

  @Post('bulk')
  @Roles(ROLES.SUPER_ADMIN, ROLES.PHARMACIST_ADMIN)
  @ApiOperation({ summary: 'Bulk suspend/activate/delete' })
  bulkAction(@Body() dto: BulkActionDto, @CurrentUser() user: RequestUser, @Req() req: Request) {
    return this.usersService.bulkAction(dto, user, req);
  }

  @Post(':id/reset-password')
  @Roles(ROLES.SUPER_ADMIN, ROLES.PHARMACIST_ADMIN)
  @ApiOperation({ summary: 'Reset user password' })
  resetPassword(
    @Param('id') id: string,
    @Body() dto: ResetPasswordDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.usersService.resetPassword(id, dto.password, user, req);
  }

  @Get(':id/login-history')
  @Roles(ROLES.SUPER_ADMIN, ROLES.PHARMACIST_ADMIN)
  @ApiOperation({ summary: 'Get user login history' })
  loginHistory(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.usersService.getLoginHistory(id, user);
  }
}
