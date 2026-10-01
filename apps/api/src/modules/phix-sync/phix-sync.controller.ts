import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { SkipProfessionalAck } from '@/common/decorators/skip-professional-ack.decorator';
import { PhixSyncEventDto } from './dto/phix-sync.dto';
import { PhixSyncService } from './phix-sync.service';

@ApiTags('integrations')
@SkipProfessionalAck()
@Controller('integrations/phix')
export class PhixSyncController {
  constructor(private phixSync: PhixSyncService) {}

  @Post('events')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { ttl: 60000, limit: 120 } })
  @ApiOperation({ summary: 'Idempotent Phix pharmacy/user lifecycle events' })
  @ApiHeader({ name: 'X-Phix-Timestamp', required: true })
  @ApiHeader({ name: 'X-Phix-Nonce', required: true })
  @ApiHeader({ name: 'X-Phix-Signature', required: true })
  ingest(@Body() dto: PhixSyncEventDto, @Req() req: Request) {
    return this.phixSync.handleEvent(dto, req);
  }
}
