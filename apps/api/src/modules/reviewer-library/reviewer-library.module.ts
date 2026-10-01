import { Module } from '@nestjs/common';
import { AuditModule } from '@/modules/audit/audit.module';
import { ReviewerLibraryController } from './reviewer-library.controller';
import { ReviewerLibraryService } from './reviewer-library.service';

@Module({
  imports: [AuditModule],
  controllers: [ReviewerLibraryController],
  providers: [ReviewerLibraryService],
  exports: [ReviewerLibraryService],
})
export class ReviewerLibraryModule {}
