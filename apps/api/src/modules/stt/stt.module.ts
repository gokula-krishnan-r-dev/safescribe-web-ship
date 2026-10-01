import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { SttController } from './stt.controller';
import { SttService } from './stt.service';
import { WhisperSttProvider } from './providers/whisper.provider';
import { GoogleMedicalSttProvider } from './providers/google-medical.provider';
import { BatchTranscribeService } from './batch-transcribe.service';

@Module({
  imports: [MulterModule.register({ storage: memoryStorage() })],
  controllers: [SttController],
  providers: [
    SttService,
    WhisperSttProvider,
    GoogleMedicalSttProvider,
    BatchTranscribeService,
  ],
  exports: [SttService, BatchTranscribeService],
})
export class SttModule {}
