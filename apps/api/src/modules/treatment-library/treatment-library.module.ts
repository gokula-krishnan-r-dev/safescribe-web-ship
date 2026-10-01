import { Module } from '@nestjs/common';
import { AuditModule } from '@/modules/audit/audit.module';
import { TreatmentLibraryController } from './treatment-library.controller';
import { TreatmentLibraryService } from './treatment-library.service';

@Module({
  imports: [AuditModule],
  controllers: [TreatmentLibraryController],
  providers: [TreatmentLibraryService],
  exports: [TreatmentLibraryService],
})
export class TreatmentLibraryModule {}
