import { Module } from '@nestjs/common';
import { AuditModule } from '@/modules/audit/audit.module';
import { TerminologyModule } from '@/modules/terminology/terminology.module';
import { ApprovedIndicationsController } from './approved-indications.controller';
import { ApprovedIndicationsService } from './approved-indications.service';
import { IndicationMappingsService } from './indication-mappings.service';

@Module({
  imports: [AuditModule, TerminologyModule],
  controllers: [ApprovedIndicationsController],
  providers: [ApprovedIndicationsService, IndicationMappingsService],
  exports: [ApprovedIndicationsService, IndicationMappingsService],
})
export class ApprovedIndicationsModule {}
