import { Module } from '@nestjs/common';
import { AuditModule } from '@/modules/audit/audit.module';
import { ClinicalReferenceController } from './clinical-reference.controller';
import { ClinicalReferenceService } from './clinical-reference.service';

@Module({
  imports: [AuditModule],
  controllers: [ClinicalReferenceController],
  providers: [ClinicalReferenceService],
  exports: [ClinicalReferenceService],
})
export class ClinicalReferenceModule {}
