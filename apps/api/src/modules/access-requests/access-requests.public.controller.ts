import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { getClientInfo } from '@/common/utils/client-info';
import { AccessRequestsService } from './access-requests.service';
import { CreateAccessRequestDto } from './dto/access-request.dto';

@ApiTags('public-access-requests')
@Controller('public')
export class AccessRequestsPublicController {
  constructor(private readonly accessRequests: AccessRequestsService) {}

  @Post('capture-ip')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { ttl: 60_000, limit: 10 } })
  @ApiOperation({ summary: 'Capture the pharmacy public IP from the current request' })
  captureIp(@Req() req: Request) {
    return this.accessRequests.captureIp(getClientInfo(req).ipAddress);
  }

  @Post('access-requests')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { ttl: 60_000, limit: 5 } })
  @ApiOperation({ summary: 'Submit an Alberta launch complimentary access request' })
  create(@Body() dto: CreateAccessRequestDto, @Req() req: Request) {
    return this.accessRequests.create(dto, getClientInfo(req));
  }
}
