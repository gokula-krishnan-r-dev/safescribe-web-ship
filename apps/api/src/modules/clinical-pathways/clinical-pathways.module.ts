import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClinicalPathwaysController } from './clinical-pathways.controller';
import { ClinicalPathwaysService } from './clinical-pathways.service';
import { PathwayAuthoringService } from './pathway-authoring.service';
import { AiPipelineService } from './ai-pipeline.service';
import { DocumentExtractorService } from './document-extractor.service';
import { AiEngineClient } from './ai-engine.client';
import { TreatmentExcelImportParser } from './treatment-excel-import.parser';
import { PrismaModule } from '@/prisma/prisma.module';
import { AuditModule } from '@/modules/audit/audit.module';
import { AiConfigModule } from '@/modules/ai-config/ai-config.module';
import { ReferenceLibraryModule } from '@/modules/reference-library/reference-library.module';
import { ReviewerLibraryModule } from '@/modules/reviewer-library/reviewer-library.module';

@Module({
  imports: [
    PrismaModule,
    AuditModule,
    AiConfigModule,
    ReferenceLibraryModule,
    ReviewerLibraryModule,
    MulterModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        dest: config.get('UPLOAD_DIR', './uploads'),
        limits: {
          fileSize: parseInt(config.get('UPLOAD_MAX_SIZE_MB', '20')) * 1024 * 1024,
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [ClinicalPathwaysController],
  providers: [
    ClinicalPathwaysService,
    PathwayAuthoringService,
    AiPipelineService,
    DocumentExtractorService,
    AiEngineClient,
    TreatmentExcelImportParser,
  ],
  exports: [ClinicalPathwaysService, PathwayAuthoringService],
})
export class ClinicalPathwaysModule {}
