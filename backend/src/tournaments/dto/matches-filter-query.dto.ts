import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  Matches,
} from 'class-validator';
import { MatchStatus } from '@prisma/client';

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
}
