import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { AuthController } from './auth.controller';
import { AuditModule } from '@/modules/audit/audit.module';
import { IpAccessModule } from '@/modules/ip-access/ip-access.module';
import { ProfessionalAcknowledgementModule } from '@/modules/professional-acknowledgement/professional-acknowledgement.module';
import { ContactModule } from '@/modules/contact/contact.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_ACCESS_SECRET'),
        signOptions: { expiresIn: config.get('JWT_ACCESS_EXPIRES_IN', '15m') },
      }),
    }),
    AuditModule,
    IpAccessModule,
    ProfessionalAcknowledgementModule,
    ContactModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
