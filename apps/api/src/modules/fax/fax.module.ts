import { Module } from '@nestjs/common';
import { AuditModule } from '@/modules/audit/audit.module';
import { FaxController } from './fax.controller';
import { FaxService } from './fax.service';
import { FaxContactsController } from './fax-contacts.controller';
import { FaxContactsService } from './fax-contacts.service';
import { IfaxClient } from './ifax.client';

@Module({
  imports: [AuditModule],
  controllers: [FaxController, FaxContactsController],
  providers: [FaxService, FaxContactsService, IfaxClient],
  exports: [FaxService, FaxContactsService, IfaxClient],
})
export class FaxModule {}
