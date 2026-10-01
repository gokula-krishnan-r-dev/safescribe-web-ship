import { Module } from '@nestjs/common';
import { AuditModule } from '@/modules/audit/audit.module';
import {
  MedicationSafetyAdminController,
  MedicationSafetyEvaluateController,
} from './medication-safety.controller';
import { MedicationSafetyService } from './medication-safety.service';
import { MedicationSafetyEvaluatorService } from './medication-safety-evaluator.service';
import { MedicationSafetyCacheService } from './medication-safety-cache.service';
import { MedicationSafetyReleaseService } from './medication-safety-release.service';
import { MedicationSafetyImportParser } from './medication-safety-import.parser';

@Module({
  imports: [AuditModule],
  controllers: [MedicationSafetyAdminController, MedicationSafetyEvaluateController],
  providers: [
    MedicationSafetyService,
    MedicationSafetyEvaluatorService,
    MedicationSafetyCacheService,
    MedicationSafetyReleaseService,
    MedicationSafetyImportParser,
  ],
  exports: [
    MedicationSafetyService,
    MedicationSafetyEvaluatorService,
    MedicationSafetyCacheService,
    MedicationSafetyReleaseService,
  ],
})
export class MedicationSafetyModule {}
