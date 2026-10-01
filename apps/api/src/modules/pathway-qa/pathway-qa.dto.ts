import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ListPathwayQaRunsQueryDto {
  @IsOptional()
  @IsString()
  pathwayId?: string;

  @IsOptional()
  @IsString()
  page?: string;

  @IsOptional()
  @IsString()
  limit?: string;
}

export class CreatePathwayQaRunDto {
  @IsString()
  @MaxLength(64)
  pathwayId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  workbookId?: string;
}
