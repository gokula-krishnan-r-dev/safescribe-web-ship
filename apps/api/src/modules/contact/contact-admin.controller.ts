import { Body, Controller, Get, Param, Patch, Query, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { ROLES } from '@safescript/shared';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { SuperAdminScopeGuard } from '@/common/guards/super-admin-scope.guard';
import { CurrentUser, PLATFORM_ACCESS, RequirePlatformAccess, Roles, type RequestUser } from '@/common/decorators/auth.decorator';
import { ContactService } from './contact.service';
import { ListContactInquiriesQueryDto, UpdateContactInquiryDto } from './dto/contact.dto';

@ApiTags('contact')
@Controller('contact/inquiries')
@UseGuards(JwtAuthGuard, RolesGuard, SuperAdminScopeGuard)
@Roles(ROLES.SUPER_ADMIN)
@RequirePlatformAccess(PLATFORM_ACCESS.PHARMACY)
@ApiBearerAuth()
@SkipThrottle()
export class ContactAdminController {
  constructor(private readonly contact: ContactService) {}

  @Get()
  @ApiOperation({ summary: 'List Contact Us inquiries' })
  list(@Query() query: ListContactInquiriesQueryDto) {
    return this.contact.list(query);
  }

  @Get('summary')
  @ApiOperation({ summary: 'Contact inquiry status counts' })
  summary() {
    return this.contact.summary();
  }

  @Get('export')
  @ApiOperation({ summary: 'Export Contact Us inquiries as CSV' })
  async export(@Query() query: ListContactInquiriesQueryDto, @Res() res: Response) {
    const csv = await this.contact.exportCsv(query);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=contact-inquiries.csv');
    res.send(csv);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a Contact Us inquiry' })
  findOne(@Param('id') id: string) {
    return this.contact.findById(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update inquiry status or internal note' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateContactInquiryDto,
    @CurrentUser() user: RequestUser,
  ) {
    return this.contact.update(id, dto, user);
  }
}
