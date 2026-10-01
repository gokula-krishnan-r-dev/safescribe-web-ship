import { Controller, Get, Param, Post, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { IpAccessService } from './ip-access.service';

@ApiTags('network-verify')
@Controller('network-verify')
export class NetworkVerifyController {
  constructor(private readonly service: IpAccessService) {}

  @Get(':token')
  @Throttle({ short: { limit: 20, ttl: 60_000 } })
  open(@Param('token') token: string, @Req() req: Request) {
    return this.service.openVerification(token, req);
  }

  @Post(':token/confirm')
  @Throttle({ short: { limit: 10, ttl: 60_000 } })
  confirm(@Param('token') token: string, @Req() req: Request) {
    return this.service.confirmVerification(token, req);
  }
}
