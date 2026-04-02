import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  Max,
  Matches,
} from 'class-validator';
import { MatchStage, MatchStatus } from '@prisma/client';

const parseCsvToArray = (value: unknown): unknown[] => {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
};

export class MatchesFilterQueryDto {
  @ApiPropertyOptional({ example: '2026-03-18' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateFrom?: string;

  @ApiPropertyOptional({ example: '2026-03-31' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateTo?: string;

  @ApiPropertyOptional({ example: 'SCHEDULED,FINISHED' })
  @IsOptional()
  @Transform(({ value }) => parseCsvToArray(value))
  @IsArray()
  @IsEnum(MatchStatus, { each: true })
  statuses?: MatchStatus[];

  @ApiPropertyOptional({ example: 'teamId1,teamId2' })
  @IsOptional()
  @Transform(({ value }) => parseCsvToArray(value))
  @IsArray()
  @IsString({ each: true })
  teamIds?: string[];

  @ApiPropertyOptional({ enum: MatchStage, example: MatchStage.PLAYOFF })
  @IsOptional()
  @IsEnum(MatchStage)
  stage?: MatchStage;

  @ApiPropertyOptional({ example: 0, description: 'Pagination offset for matches' })
  @IsOptional()
  @Transform(({ value }) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : undefined;
  })
  @IsInt()
  @Min(0)
  matchesOffset?: number;

  @ApiPropertyOptional({ example: 50, description: 'Pagination limit for matches (1..200)' })
  @IsOptional()
  @Transform(({ value }) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : undefined;
  })
  @IsInt()
  @Min(1)
  @Max(200)
  matchesLimit?: number;
}
