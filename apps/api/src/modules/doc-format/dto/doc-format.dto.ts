import {
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PdfLayoutSectionDto {
  @ApiProperty()
  @IsString()
  @MaxLength(64)
  id!: string;

  @ApiProperty({
    enum: ['heading', 'subheading', 'field', 'bullets', 'static', 'pharmacist', 'spacer'],
  })
  @IsString()
  @IsIn(['heading', 'subheading', 'field', 'bullets', 'static', 'pharmacist', 'spacer'])
  type!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  label?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  field?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  fallback?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  text?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showIfEmpty?: boolean;
}

export class PdfLayoutConfigDto {
  @ApiProperty({ enum: ['sections', 'prescription'] })
  @IsString()
  @IsIn(['sections', 'prescription'])
  mode!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showPatientHeader?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showPageFooter?: boolean;

  @ApiProperty({ type: [PdfLayoutSectionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PdfLayoutSectionDto)
  sections!: PdfLayoutSectionDto[];
}

export class ResponseSchemaFieldDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  key!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(200)
  label!: string;

  @ApiProperty({ enum: ['string', 'array', 'object'] })
  @IsString()
  @IsIn(['string', 'array', 'object'])
  type!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;
}

export class DocResponseSchemaDto {
  @ApiProperty({ type: [ResponseSchemaFieldDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ResponseSchemaFieldDto)
  fields!: ResponseSchemaFieldDto[];
}

export class DocFormatUpdateItemDto {
  @ApiProperty({ example: 'consultation_note' })
  @IsString()
  @MaxLength(64)
  key!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  shortName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(80)
  categoryLabel?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  bullets?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fileName?: string;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  actions?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50_000)
  aiPrompt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  styleNotes?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(50_000)
  exampleOutput?: string;

  @ApiPropertyOptional({ type: PdfLayoutConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PdfLayoutConfigDto)
  pdfLayout?: PdfLayoutConfigDto;

  @ApiPropertyOptional({ type: DocResponseSchemaDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DocResponseSchemaDto)
  responseSchema?: DocResponseSchemaDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  published?: boolean;
}

export class ApplyDocFormatsDto {
  @ApiProperty({ type: [DocFormatUpdateItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DocFormatUpdateItemDto)
  formats!: DocFormatUpdateItemDto[];
}

export class ResetDocFormatDto {
  @ApiProperty({ example: 'consultation_note' })
  @IsString()
  @MaxLength(64)
  key!: string;
}

export class PreviewDocFormatDto {
  @ApiProperty({ example: 'consultation_note' })
  @IsString()
  @MaxLength(64)
  key!: string;

  @ApiPropertyOptional({ description: 'Draft generation prompt to preview (unsaved)' })
  @IsOptional()
  @IsString()
  @MaxLength(50_000)
  aiPrompt?: string;

  @ApiPropertyOptional({ description: 'Draft style notes to preview (unsaved)' })
  @IsOptional()
  @IsString()
  @MaxLength(10_000)
  styleNotes?: string;

  @ApiPropertyOptional({ description: 'Draft example JSON/text to render' })
  @IsOptional()
  @IsString()
  @MaxLength(50_000)
  exampleOutput?: string;

  @ApiPropertyOptional({ type: PdfLayoutConfigDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PdfLayoutConfigDto)
  pdfLayout?: PdfLayoutConfigDto;
}
