import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateTenantDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  name?: string;

  @ApiPropertyOptional({
    description: 'Pharmacy outbound fax number shown on PCP communications',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  faxNumber?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string | null;

  @ApiPropertyOptional({
    description: 'Pharmacy street address shown on the Patient Care Summary',
  })
  @IsOptional()
  @IsString()
  @MaxLength(240)
  address?: string | null;
}
