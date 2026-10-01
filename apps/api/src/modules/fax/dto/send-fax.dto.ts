import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Allowed consultation document type ids that may be faxed. */
export const FAXABLE_DOCUMENT_TYPE_IDS = [
  'consultation_note',
  'prescription',
  'prescriber_communication',
  'patient_care_summary',
  'referral_letter',
  'renewal_summary',
  'patient_handout',
  'prescriber_notification',
] as const;

export type FaxableDocumentTypeId = (typeof FAXABLE_DOCUMENT_TYPE_IDS)[number];

export class SendConsultationFaxDto {
  @ApiProperty({ example: 'Dr. Jane Smith / Clinic Fax' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(120)
  recipientName!: string;

  @ApiProperty({
    example: '+14165551234',
    description: 'Recipient fax number (E.164 preferred; 10-digit NANP also accepted)',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(20)
  @Matches(/^[+\d][\d\s().-]{8,18}$/, {
    message: 'Enter a valid fax number (digits, optional + country code)',
  })
  faxNumber!: string;

  @ApiProperty({ example: 'prescription' })
  @IsString()
  @IsNotEmpty()
  @IsIn([...FAXABLE_DOCUMENT_TYPE_IDS])
  documentTypeId!: FaxableDocumentTypeId;

  @ApiPropertyOptional({ example: 'Prescription' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  documentName?: string;

  @ApiProperty({
    description: 'Base64-encoded PDF (no data: URL prefix). Max ~15MB decoded.',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(32)
  pdfBase64!: string;
}
