import { IsBoolean, IsEmail, IsOptional, IsString } from 'class-validator';

export class CreatePharmacyNetworkDto {
  @IsString()
  cidr!: string;

  @IsOptional()
  @IsString()
  label?: string;
}

export class UpdatePharmacyNetworkDto {
  @IsOptional()
  @IsString()
  cidr?: string;

  @IsOptional()
  @IsString()
  label?: string;
}

export class SendNetworkVerificationDto {
  @IsEmail()
  email!: string;
}

export class UpdatePharmacyNetworkAccessDto {
  @IsBoolean()
  networkAccessEnabled!: boolean;
}
