import { Module } from '@nestjs/common';
import { ConsultationsController } from './consultations.controller';
import { ConsultationsService } from './consultations.service';
import { ClinicalExtractionService } from './clinical-extraction.service';
import { ClinicalAssessmentService } from './clinical-assessment.service';
import { ClinicalJudgmentService } from './clinical-judgment.service';
import { ClinicalJudgmentRedFlagsService } from './clinical-judgment-red-flags.service';
import { ConsultationDeletionService } from './consultation-deletion.service';
import { TranscriptExtractorService } from './transcript-extractor.service';
import { LabReportExtractorService } from './lab-report-extractor.service';
import { ClinicalPhotoAnalyzerService } from './clinical-photo-analyzer.service';
import { GoogleHandoutTranslateClient } from './google-handout-translate.client';
import { TreatmentQuickAddService } from './treatment-quick-add.service';
import { TreatmentCandidateService } from './treatment-candidate.service';
import { AdjustedRegimenProductService } from './adjusted-regimen-product.service';
import { PathwayClinicalJudgementService } from './pathway-clinical-judgement.service';
import { RenewMedicationExtractorService } from './renew-medication-extractor.service';
import { RenewMedicationNormalizerService } from './renew-medication-normalizer.service';
import { RenewTherapyReviewService } from './renew-therapy-review.service';
import { RenewMonitoringSafetyService } from './renew-monitoring-safety.service';
import { RenewDecisionService } from './renew-decision.service';
import { RenewStep3ResolverService } from './renew-step3-resolver.service';
import { AdaptReferenceSelectorService } from './adapt-reference-selector.service';
import { AdaptDocumentationService } from './adapt-documentation.service';
import { AdaptIndicationService } from './adapt-indication.service';
import { AdaptSubstitutionAlternativesService } from './adapt-substitution-alternatives.service';
import { AdaptClinicalGuidanceService } from './adapt-clinical-guidance.service';
import { AdaptClinicalRationaleService } from './adapt-clinical-rationale.service';
import { AdaptCounsellingService } from './adapt-counselling.service';
import { AiEngineClient } from '@/modules/clinical-pathways/ai-engine.client';
import { AuditModule } from '@/modules/audit/audit.module';
import { MedicationSafetyModule } from '@/modules/medication-safety/medication-safety.module';
import { AiConfigModule } from '@/modules/ai-config/ai-config.module';
import { DocFormatModule } from '@/modules/doc-format/doc-format.module';
import { TerminologyModule } from '@/modules/terminology/terminology.module';
import { EntitlementsModule } from '@/modules/entitlements/entitlements.module';
import { BrandingModule } from '@/modules/branding/branding.module';
import { ApprovedIndicationsModule } from '@/modules/approved-indications/approved-indications.module';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

@Module({
  imports: [
    AuditModule,
    MedicationSafetyModule,
    AiConfigModule,
    DocFormatModule,
    TerminologyModule,
    EntitlementsModule,
    BrandingModule,
    ApprovedIndicationsModule,
    MulterModule.register({ storage: memoryStorage() }),
  ],
  controllers: [ConsultationsController],
  providers: [
    ConsultationsService,
    ClinicalExtractionService,
    ClinicalAssessmentService,
    ClinicalJudgmentService,
    ClinicalJudgmentRedFlagsService,
    ConsultationDeletionService,
    AiEngineClient,
    TranscriptExtractorService,
    LabReportExtractorService,
    ClinicalPhotoAnalyzerService,
    GoogleHandoutTranslateClient,
    TreatmentQuickAddService,
    TreatmentCandidateService,
    AdjustedRegimenProductService,
    PathwayClinicalJudgementService,
    RenewMedicationExtractorService,
    RenewMedicationNormalizerService,
    RenewTherapyReviewService,
    RenewMonitoringSafetyService,
    RenewStep3ResolverService,
    RenewDecisionService,
    AdaptReferenceSelectorService,
    AdaptDocumentationService,
    AdaptIndicationService,
    AdaptSubstitutionAlternativesService,
    AdaptClinicalGuidanceService,
    AdaptClinicalRationaleService,
    AdaptCounsellingService,
  ],
  exports: [ConsultationsService, ConsultationDeletionService, AdaptReferenceSelectorService],
})
export class ConsultationsModule {}
