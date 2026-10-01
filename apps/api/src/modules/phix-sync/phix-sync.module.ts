import { Module } from '@nestjs/common';
import { AuditModule } from '@/modules/audit/audit.module';
import { PhixSyncController } from './phix-sync.controller';
import { PhixSyncService } from './phix-sync.service';

@Module({
  imports: [AuditModule],
  controllers: [PhixSyncController],
  providers: [PhixSyncService],
  exports: [PhixSyncService],
})
export class PhixSyncModule {}
