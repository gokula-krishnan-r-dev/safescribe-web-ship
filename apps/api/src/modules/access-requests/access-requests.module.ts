import { Module } from '@nestjs/common';
import { AuditModule } from '@/modules/audit/audit.module';
import { ContactModule } from '@/modules/contact/contact.module';
import { IpAccessModule } from '@/modules/ip-access/ip-access.module';
import { AccessRequestsAdminController } from './access-requests.admin.controller';
import { AccessRequestsPublicController } from './access-requests.public.controller';
import { AccessRequestsService } from './access-requests.service';

@Module({
  imports: [AuditModule, ContactModule, IpAccessModule],
  controllers: [AccessRequestsPublicController, AccessRequestsAdminController],
  providers: [AccessRequestsService],
})
export class AccessRequestsModule {}
