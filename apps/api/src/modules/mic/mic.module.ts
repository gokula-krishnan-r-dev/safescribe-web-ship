import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { AuditModule } from '@/modules/audit/audit.module';
import { SttModule } from '@/modules/stt/stt.module';
import { MicService } from './mic.service';
import { MicAuthService } from './mic-auth.service';
import { MicAuthGuard } from './mic-auth.guard';
import { MicEventsService } from './mic-events.service';
import { MicFinalizationService } from './mic-finalization.service';
import { MicLiveTranslateService } from './mic-live-translate.service';
import { MicDesktopController } from './mic-desktop.controller';
import { MicPhoneController } from './mic-phone.controller';

@Module({
  imports: [
    MulterModule.register({ storage: memoryStorage() }),
    AuditModule,
    SttModule,
  ],
  controllers: [MicDesktopController, MicPhoneController],
  providers: [
    MicService,
    MicAuthService,
    MicAuthGuard,
    MicEventsService,
    MicFinalizationService,
    MicLiveTranslateService,
  ],
  exports: [MicService],
})
export class MicModule {}
