import { Module, forwardRef } from '@nestjs/common';
import { AuditModule } from '@/modules/audit/audit.module';
import { MedicationSafetyModule } from '@/modules/medication-safety/medication-safety.module';
import { TerminologyModule } from '@/modules/terminology/terminology.module';
import { ClinicalRepositoryController } from './clinical-repository.controller';
import { ClinicalRepositoryService } from './clinical-repository.service';
import { ClinicalRepositoryPromoteService } from './import/promote-drafts';
import { ClinicalRepositoryTestRunner } from './tests/repository-test-runner';
import { ClinicalRepositoryPublicationService } from './governance/publication.service';

@Module({
  imports: [AuditModule, forwardRef(() => MedicationSafetyModule), TerminologyModule],
  controllers: [ClinicalRepositoryController],
  providers: [
    ClinicalRepositoryService,
    ClinicalRepositoryPromoteService,
    ClinicalRepositoryTestRunner,
    ClinicalRepositoryPublicationService,
  ],
  exports: [
    ClinicalRepositoryService,
    ClinicalRepositoryTestRunner,
    ClinicalRepositoryPublicationService,
  ],
})
export class ClinicalRepositoryModule {}
