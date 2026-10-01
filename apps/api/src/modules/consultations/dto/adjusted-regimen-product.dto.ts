import { IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AdjustedProductCandidatesDto {
  @ApiProperty({
    description:
      'Stable treatment key: treatmentInstanceId, pathwayTreatmentId, or drugId',
  })
  @IsString()
  treatmentKey!: string;

  @ApiPropertyOptional({
    description: 'Pharmacist search text. Omit or null to use the generated query.',
  })
  @IsOptional()
  @IsString()
  query?: string | null;

  @ApiPropertyOptional({
    description: 'Fingerprint of the renal recommendation the UI is displaying.',
  })
  @IsOptional()
  @IsString()
  recommendationId?: string;
}
