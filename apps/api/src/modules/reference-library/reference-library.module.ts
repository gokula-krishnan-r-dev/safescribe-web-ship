import { Module } from '@nestjs/common';
import { AuditModule } from '@/modules/audit/audit.module';
import { ReferenceLibraryController } from './reference-library.controller';
import { ReferenceLibraryService } from './reference-library.service';

@Module({
  imports: [AuditModule],
  controllers: [ReferenceLibraryController],
  providers: [ReferenceLibraryService],
  exports: [ReferenceLibraryService],
})
export class ReferenceLibraryModule {}
