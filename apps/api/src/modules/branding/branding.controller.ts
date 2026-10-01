import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import type { Request, Response } from 'express';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CurrentUser, Roles, type RequestUser } from '@/common/decorators/auth.decorator';
import { ROLES } from '@safescript/shared';
import { getClientInfo } from '@/common/utils/client-info';
import { BrandingService } from './branding.service';
import { BRANDING_MAX_BYTES } from './branding.util';

const imageUpload = FileInterceptor('file', {
  storage: memoryStorage(),
  limits: { fileSize: BRANDING_MAX_BYTES },
});

@ApiTags('branding')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('branding')
export class BrandingController {
  constructor(private readonly branding: BrandingService) {}

  @Post('signature')
  @Roles(ROLES.PHARMACIST, ROLES.PHARMACIST_ADMIN)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(imageUpload)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload the signed-in pharmacist signature image' })
  uploadSignature(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    if (!file) throw new BadRequestException('Please choose a PNG or JPEG image');
    return this.branding.uploadSignature(user, file, getClientInfo(req));
  }

  @Delete('signature')
  @Roles(ROLES.PHARMACIST, ROLES.PHARMACIST_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove the signed-in pharmacist signature image' })
  deleteSignature(@CurrentUser() user: RequestUser, @Req() req: Request) {
    return this.branding.deleteSignature(user, getClientInfo(req));
  }

  @Get('signature/file')
  @SkipThrottle()
  @Roles(ROLES.PHARMACIST, ROLES.PHARMACIST_ADMIN)
  @ApiOperation({ summary: 'Preview the signed-in pharmacist signature' })
  streamOwnSignature(@CurrentUser() user: RequestUser, @Res() res: Response) {
    return this.branding.streamOwnSignature(user, res);
  }

  @Post('tenants/:tenantId/logo')
  @Roles(ROLES.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(imageUpload)
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Upload a pharmacy logo / profile image' })
  uploadLogo(
    @Param('tenantId') tenantId: string,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    if (!file) throw new BadRequestException('Please choose a PNG or JPEG image');
    return this.branding.uploadTenantLogo(tenantId, user, file, getClientInfo(req));
  }

  @Delete('tenants/:tenantId/logo')
  @Roles(ROLES.SUPER_ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a pharmacy logo' })
  deleteLogo(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.branding.deleteTenantLogo(tenantId, user, getClientInfo(req));
  }

  @Get('tenants/:tenantId/logo/file')
  @SkipThrottle()
  @Roles(ROLES.SUPER_ADMIN, ROLES.PHARMACIST, ROLES.PHARMACIST_ADMIN)
  @ApiOperation({ summary: 'Preview a pharmacy logo' })
  streamLogo(
    @Param('tenantId') tenantId: string,
    @CurrentUser() user: RequestUser,
    @Res() res: Response,
  ) {
    return this.branding.streamTenantLogo(tenantId, user, res);
  }
}
