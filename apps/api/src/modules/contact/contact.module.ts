import { Module } from '@nestjs/common';
import { AuditModule } from '@/modules/audit/audit.module';
import { ContactAdminController } from './contact-admin.controller';
import { ContactController } from './contact.controller';
import { ContactService } from './contact.service';
import { MailService } from './mail.service';

@Module({
  imports: [AuditModule],
  controllers: [ContactController, ContactAdminController],
  providers: [ContactService, MailService],
  exports: [MailService],
})
export class ContactModule {}
