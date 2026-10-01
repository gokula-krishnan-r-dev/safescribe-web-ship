import { IsArray, IsIn, IsNumber, IsOptional, IsString, Max, Min, MinLength, ValidateNested } from 'class-validator';
import { plainToInstance, Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { OPENAI_CHAT_MODEL_IDS } from '@safescript/shared';

export class ApplyPromptDto {
  @ApiProperty({ example: 'TRANSCRIPT_ANALYSIS' })
  @IsString()
  key!: string;

  @ApiProperty({ description: 'Full system prompt text' })
  @IsString()
  @MinLength(10)
  content!: string;
}

export class ApplySettingsDto {
  @ApiPropertyOptional({
    example: 'gpt-5.6-luna',
    enum: OPENAI_CHAT_MODEL_IDS,
  })
  @IsOptional()
  @IsString()
  @IsIn([...OPENAI_CHAT_MODEL_IDS])
  openaiModel?: string;

  @ApiPropertyOptional({
    example: 'gpt-5.6-luna',
    enum: OPENAI_CHAT_MODEL_IDS,
  })
  @IsOptional()
  @IsString()
  @IsIn([...OPENAI_CHAT_MODEL_IDS])
  openaiFastModel?: string;

  @ApiPropertyOptional({ example: 'text-embedding-3-small' })
  @IsOptional()
  @IsString()
  openaiEmbeddingModel?: string;

  @ApiPropertyOptional({ example: 0.1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(2)
  temperatureDefault?: number;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(10)
  maxRetries?: number;

  @ApiPropertyOptional({ example: 90 })
  @IsOptional()
  @IsNumber()
  @Min(10)
  @Max(600)
  timeoutSeconds?: number;
}

export class ApplyAiConfigDto {
  @ApiPropertyOptional({ type: [ApplyPromptDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ApplyPromptDto)
  prompts?: ApplyPromptDto[];

  @ApiPropertyOptional({ type: ApplySettingsDto })
  @IsOptional()
  @Transform(({ value }) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const src = value as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const key of [
      'openaiModel',
      'openaiFastModel',
      'openaiEmbeddingModel',
      'temperatureDefault',
      'maxRetries',
      'timeoutSeconds',
    ] as const) {
      if (src[key] !== undefined) next[key] = src[key];
    }
    // Must return a class instance — plain objects fail forbidNonWhitelisted nested checks.
    return plainToInstance(ApplySettingsDto, next);
  })
  @ValidateNested()
  @Type(() => ApplySettingsDto)
  settings?: ApplySettingsDto;
}

export class ResetPromptDto {
  @ApiProperty({ example: 'TRANSCRIPT_ANALYSIS' })
  @IsString()
  key!: string;
}
