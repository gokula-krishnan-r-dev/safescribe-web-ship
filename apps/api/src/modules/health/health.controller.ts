import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '@/prisma/prisma.service';
import { RedisService } from '@/redis/redis.service';
import { SkipProfessionalAck } from '@/common/decorators/skip-professional-ack.decorator';

@ApiTags('health')
@SkipThrottle()
@SkipProfessionalAck()
@Controller('health')
export class HealthController {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  @Get()
  async check() {
    let db = 'ok';
    let redis = 'ok';

    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      db = 'error';
    }

    try {
      await this.redis.getClient().ping();
    } catch {
      redis = 'error';
    }

    return {
      status: db === 'ok' && redis === 'ok' ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      services: { database: db, redis },
    };
  }
}
