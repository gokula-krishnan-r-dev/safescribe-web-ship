import { Module } from '@nestjs/common';
import { DocFormatController } from './doc-format.controller';
import { DocFormatService } from './doc-format.service';
import { PrismaModule } from '@/prisma/prisma.module';
import { RedisModule } from '@/redis/redis.module';
import { AuditModule } from '@/modules/audit/audit.module';

@Module({
  imports: [PrismaModule, RedisModule, AuditModule],
  controllers: [DocFormatController],
  providers: [DocFormatService],
  exports: [DocFormatService],
})
export class DocFormatModule {}
