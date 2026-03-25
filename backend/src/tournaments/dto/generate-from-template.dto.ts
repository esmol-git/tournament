import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class GenerateFromTemplateDto {
  @ApiProperty({ example: 'kids_mini_8' })
  @IsString()
  templateId: string;

  @ApiProperty({ example: '2026-03-25' })
  @IsDateString()
  startDate: string;

  @ApiPropertyOptional({
    example: 2,
    description: 'Overrides tournament.simultaneousMatches',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  parallelMatches?: number;

  @ApiPropertyOptional({
    example: true,
    description:
      'If true (default), deletes existing matches (and events) for this tournament before creating a new calendar',
  })
  @IsOptional()
  @IsBoolean()
  replaceExisting?: boolean;
}
