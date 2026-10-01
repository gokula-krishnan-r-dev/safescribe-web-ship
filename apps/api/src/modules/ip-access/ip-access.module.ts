import { Module } from '@nestjs/common';
import { IpAccessService } from './ip-access.service';
import { IpAccessController } from './ip-access.controller';
import { NetworkVerifyController } from './network-verify.controller';
import { AuditModule } from '@/modules/audit/audit.module';
import { ContactModule } from '@/modules/contact/contact.module';

@Module({
  imports: [AuditModule, ContactModule],
  controllers: [IpAccessController, NetworkVerifyController],
  providers: [IpAccessService],
  exports: [IpAccessService],
})
export class IpAccessModule {}
