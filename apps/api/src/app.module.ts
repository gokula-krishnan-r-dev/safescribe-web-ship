import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { buildThrottlerOptions } from './config/throttle.config';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { AuditModule } from './modules/audit/audit.module';
import { HealthModule } from './modules/health/health.module';
import { ClinicalPathwaysModule } from './modules/clinical-pathways/clinical-pathways.module';
import { ConsultationsModule } from './modules/consultations/consultations.module';
import { TerminologyModule } from './modules/terminology/terminology.module';
import { MedicationSafetyModule } from './modules/medication-safety/medication-safety.module';
import { ClinicalRepositoryModule } from './modules/clinical-repository/clinical-repository.module';
import { ClinicalReferenceModule } from './modules/clinical-reference/clinical-reference.module';
import { IpAccessModule } from './modules/ip-access/ip-access.module';
import { AiConfigModule } from './modules/ai-config/ai-config.module';
import { DocFormatModule } from './modules/doc-format/doc-format.module';
import { StorageModule } from './modules/storage/storage.module';
import { BrandingModule } from './modules/branding/branding.module';
import { SttModule } from './modules/stt/stt.module';
import { FaxModule } from './modules/fax/fax.module';
import { MicModule } from './modules/mic/mic.module';
import { ContactModule } from './modules/contact/contact.module';
import { EntitlementsModule } from './modules/entitlements/entitlements.module';
import { ProfessionalAcknowledgementModule } from './modules/professional-acknowledgement/professional-acknowledgement.module';
import { PhixSyncModule } from './modules/phix-sync/phix-sync.module';
import { PlatformAdminsModule } from './modules/platform-admins/platform-admins.module';
import { TreatmentLibraryModule } from './modules/treatment-library/treatment-library.module';
import { ReferenceLibraryModule } from './modules/reference-library/reference-library.module';
import { ReviewerLibraryModule } from './modules/reviewer-library/reviewer-library.module';
import { ApprovedIndicationsModule } from './modules/approved-indications/approved-indications.module';
import { PathwayQaModule } from './modules/pathway-qa/pathway-qa.module';
import { AccessRequestsModule } from './modules/access-requests/access-requests.module';
import { validateEnv } from './config/env.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env', '.env'],
      validate: validateEnv,
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => buildThrottlerOptions(config),
    }),
    PrismaModule,
    RedisModule,
    StorageModule,
    BrandingModule,
    AuthModule,
    UsersModule,
    TenantsModule,
    AuditModule,
    HealthModule,
    ClinicalPathwaysModule,
    ConsultationsModule,
    TerminologyModule,
    MedicationSafetyModule,
    ClinicalRepositoryModule,
    ClinicalReferenceModule,
    IpAccessModule,
    AiConfigModule,
    DocFormatModule,
    SttModule,
    FaxModule,
    MicModule,
    ContactModule,
    EntitlementsModule,
    ProfessionalAcknowledgementModule,
    PhixSyncModule,
    PlatformAdminsModule,
    TreatmentLibraryModule,
    ReferenceLibraryModule,
    ReviewerLibraryModule,
    ApprovedIndicationsModule,
    PathwayQaModule,
    AccessRequestsModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
