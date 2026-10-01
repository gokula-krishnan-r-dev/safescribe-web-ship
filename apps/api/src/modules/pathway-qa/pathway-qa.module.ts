import { Module } from '@nestjs/common';
import { AuditModule } from '@/modules/audit/audit.module';
import { MedicationSafetyModule } from '@/modules/medication-safety/medication-safety.module';
import { PathwayQaController } from './pathway-qa.controller';
import { PathwayQaService } from './pathway-qa.service';

@Module({
  imports: [AuditModule, MedicationSafetyModule],
  controllers: [PathwayQaController],
  providers: [PathwayQaService],
  exports: [PathwayQaService],
})
export class PathwayQaModule {}
