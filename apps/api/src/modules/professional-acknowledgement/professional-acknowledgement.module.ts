import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AuditModule } from '@/modules/audit/audit.module';
import { ProfessionalAcknowledgementController } from './professional-acknowledgement.controller';
import { ProfessionalAcknowledgementService } from './professional-acknowledgement.service';
import { ProfessionalAckInterceptor } from './professional-ack.interceptor';

@Module({
  imports: [AuditModule],
  controllers: [ProfessionalAcknowledgementController],
  providers: [
    ProfessionalAcknowledgementService,
    {
      provide: APP_INTERCEPTOR,
      useClass: ProfessionalAckInterceptor,
    },
  ],
  exports: [ProfessionalAcknowledgementService],
})
export class ProfessionalAcknowledgementModule {}
