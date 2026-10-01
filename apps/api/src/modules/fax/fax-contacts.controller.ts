import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CurrentUser, Roles } from '@/common/decorators/auth.decorator';
import type { RequestUser } from '@/common/decorators/auth.decorator';
import { ROLES } from '@safescript/shared';
import { FaxContactsService } from './fax-contacts.service';
import {
  CreatePharmacyFaxContactDto,
  UpdatePharmacyFaxContactDto,
} from './dto/fax-contacts.dto';

@ApiTags('Fax contacts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('fax-contacts')
export class FaxContactsController {
  constructor(private readonly service: FaxContactsService) {}

  /** Active pharmacy fax directory — used by Send Fax autofill. */
  @Get()
  @Roles(ROLES.PHARMACIST_ADMIN, ROLES.PHARMACIST)
  @ApiOperation({ summary: 'List active pharmacy fax contacts for Send Fax' })
  listActive(@CurrentUser() user: RequestUser) {
    return this.service.listActiveForTenant(user);
  }

  /** Full directory including inactive — pharmacy admin only. */
  @Get('manage')
  @Roles(ROLES.PHARMACIST_ADMIN)
  @ApiOperation({ summary: 'List all pharmacy fax contacts (admin)' })
  listAll(@CurrentUser() user: RequestUser) {
    return this.service.listAll(user);
  }

  @Post()
  @Roles(ROLES.PHARMACIST_ADMIN)
  @ApiOperation({ summary: 'Add a pharmacy fax contact' })
  create(
    @Body() dto: CreatePharmacyFaxContactDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.create(dto, user, req);
  }

  @Patch(':id')
  @Roles(ROLES.PHARMACIST_ADMIN)
  @ApiOperation({ summary: 'Update a pharmacy fax contact' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdatePharmacyFaxContactDto,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.update(id, dto, user, req);
  }

  @Delete(':id')
  @Roles(ROLES.PHARMACIST_ADMIN)
  @ApiOperation({ summary: 'Delete a pharmacy fax contact' })
  remove(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Req() req: Request,
  ) {
    return this.service.remove(id, user, req);
  }
}
