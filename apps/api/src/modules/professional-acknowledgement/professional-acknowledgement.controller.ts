import { Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentUser, type RequestUser } from '@/common/decorators/auth.decorator';
import { SkipProfessionalAck } from '@/common/decorators/skip-professional-ack.decorator';
import { getClientInfo } from '@/common/utils/client-info';
import { PROFESSIONAL_ACK_VERSION } from '@safescript/shared';
import { ProfessionalAcknowledgementService } from './professional-acknowledgement.service';

@ApiTags('Professional use acknowledgement')
@ApiBearerAuth()
@SkipProfessionalAck()
@UseGuards(JwtAuthGuard)
@Controller('professional-use-acknowledgement')
export class ProfessionalAcknowledgementController {
  constructor(private acks: ProfessionalAcknowledgementService) {}

  @Get()
  @ApiOperation({ summary: 'Current professional-use acknowledgement status' })
  async status(@CurrentUser() user: RequestUser, @Req() req: Request) {
    const status = await this.acks.getStatusForUser(user);
    if (status.required) {
      const { ipAddress, userAgent } = getClientInfo(req);
      await this.acks.recordRequired(user, { ipAddress, userAgent });
    }
    return status;
  }

  @Post()
  @ApiOperation({ summary: 'Record the current professional-use acknowledgement' })
  async acknowledge(@CurrentUser() user: RequestUser, @Req() req: Request) {
    const { ipAddress, userAgent } = getClientInfo(req);
    const status = await this.acks.acknowledge(user, { ipAddress, userAgent });
    return {
      acknowledged: status.acknowledged,
      version: PROFESSIONAL_ACK_VERSION,
    };
  }
}
