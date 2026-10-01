import { IsEmail, IsString, MinLength, IsOptional, IsBoolean, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LOGIN_CHANNELS } from '@safescript/shared';

export class LoginDto {
  @ApiProperty({ example: 'admin@safescript.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'SuperAdmin123!' })
  @IsString()
  @MinLength(1)
  password!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  rememberMe?: boolean;

  /**
   * Entry channel for this login attempt.
   * Super Admin accounts are accepted only with `super_admin_access`.
   * Pharmacy workspace logins use `pharmacy` (default).
   */
  @ApiPropertyOptional({
    enum: [LOGIN_CHANNELS.PHARMACY, LOGIN_CHANNELS.SUPER_ADMIN_ACCESS],
    default: LOGIN_CHANNELS.PHARMACY,
  })
  @IsOptional()
  @IsIn([LOGIN_CHANNELS.PHARMACY, LOGIN_CHANNELS.SUPER_ADMIN_ACCESS])
  loginChannel?: typeof LOGIN_CHANNELS.PHARMACY | typeof LOGIN_CHANNELS.SUPER_ADMIN_ACCESS;

  /** Required when the same email exists in more than one pharmacy. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tenantId?: string;
}

export class ForgotPasswordDto {
  @ApiProperty()
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  token!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password!: string;
}

export class ChangePasswordDto {
  @ApiProperty()
  @IsString()
  currentPassword!: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  newPassword!: string;
}

export class RefreshTokenDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  refreshToken?: string;

  @ApiPropertyOptional({
    description: 'Optional logout source for privacy-minimized audit events',
  })
  @IsOptional()
  @IsString()
  source?: string;
}

export class VerifyLoginEmailDto {
  @ApiProperty({ description: 'One-time token from the verification email link' })
  @IsString()
  @MinLength(32)
  token!: string;
}

export class ResendLoginEmailDto {
  @ApiProperty({ description: 'Challenge id returned from login when email 2FA is required' })
  @IsString()
  @MinLength(8)
  challengeId!: string;
}
