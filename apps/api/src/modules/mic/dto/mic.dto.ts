import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { Transform } from 'class-transformer';

export class CreateMicPairingDto {
  @IsOptional()
  @IsString()
  sourceLanguage?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  translateToEnglish?: boolean;
}

export class MicSttSettingsDto {
  @IsOptional()
  @IsString()
  sourceLanguage?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  translateToEnglish?: boolean;
}

export class ClaimPairingDto {
  @IsString()
  @MinLength(16)
  pairToken!: string;
}

export class MicCommandDto {
  @IsString()
  @IsIn(['START', 'PAUSE', 'RESUME', 'END', 'CANCEL', 'RETRY_TRANSCRIPTION', 'MIC_READY'])
  command!: 'START' | 'PAUSE' | 'RESUME' | 'END' | 'CANCEL' | 'RETRY_TRANSCRIPTION' | 'MIC_READY';

  @IsInt()
  @Min(0)
  expectedStateVersion!: number;

  @IsString()
  @MinLength(8)
  idempotencyKey!: string;
}

export class MicConsentDto {
  @IsBoolean()
  consentObtained!: boolean;

  @IsString()
  @IsIn(['VERBAL'])
  method!: 'VERBAL';

  @IsString()
  noticeVersion!: string;

  @IsInt()
  @Min(0)
  expectedStateVersion!: number;

  @IsString()
  @MinLength(8)
  idempotencyKey!: string;
}

export class UploadGrantDto {
  @IsInt()
  @Min(0)
  segmentNumber!: number;

  @IsInt()
  @Min(0)
  sequenceNumber!: number;

  @IsString()
  contentType!: string;

  @IsInt()
  @Min(1)
  contentLength!: number;

  @IsOptional()
  @IsString()
  checksumSha256?: string;
}

export class ConfirmPartDto {
  @IsInt()
  @Min(0)
  segmentNumber!: number;

  @IsInt()
  @Min(0)
  sequenceNumber!: number;

  @IsString()
  contentType!: string;

  @IsInt()
  @Min(1)
  contentLength!: number;

  @IsOptional()
  @IsString()
  checksumSha256?: string;

  @IsOptional()
  @IsString()
  storagePath?: string;
}

export class CompleteUploadDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  totalSegments?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  lastSequenceNumber?: number;

  @IsOptional()
  durationSeconds?: number;

  @IsOptional()
  totalBytes?: number;

  @IsOptional()
  @IsString()
  clientMimeType?: string;

  @IsString()
  @MinLength(8)
  idempotencyKey!: string;

  @IsInt()
  @Min(0)
  expectedStateVersion!: number;
}

export class LivePreviewDto {
  @IsString()
  text!: string;

  @IsOptional()
  @IsBoolean()
  isFinal?: boolean;
}

export class HeartbeatDto {
  @IsOptional()
  @IsString()
  clientState?: string;
}
