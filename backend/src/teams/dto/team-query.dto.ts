import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class TeamQueryDto {
  @ApiPropertyOptional({
    description: 'Filter teams participating in a tournament',
  })
  @IsOptional()
  @IsString()
  tournamentId?: string;

  @ApiPropertyOptional({ description: 'Page number (1-based)', example: 1 })
  @IsOptional()
  @Type(() => Number)
  @Transform(({ value }) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : undefined;
  })
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ description: 'Rows per page', example: 10 })
  @IsOptional()
  @Type(() => Number)
  @Transform(({ value }) => {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : undefined;
  })
  @IsInt()
  @Min(1)
  pageSize?: number;

  @ApiPropertyOptional({
    description: 'Search teams by name (contains)',
    example: 'Реал',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: 'Filter by exact team category',
    example: '2018',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({ description: 'Filter by age group id from directory' })
  @IsOptional()
  @IsString()
  ageGroupId?: string;

  @ApiPropertyOptional({ description: 'Filter by region id from directory' })
  @IsOptional()
  @IsString()
  regionId?: string;

  @ApiPropertyOptional({
    description: 'Sort field: name|playersCount',
    example: 'name',
  })
  @IsOptional()
  @IsString()
  sortField?: string;

  @ApiPropertyOptional({
    description: 'Sort order: 1 (asc) | -1 (desc)',
    example: -1,
  })
  @IsOptional()
  @Type(() => Number)
  @Transform(({ value }) => {
    const n = Number(value);
    if (!Number.isFinite(n)) return undefined;
    if (n === 1 || n === -1) return n;
    return undefined;
  })
  @IsInt()
  sortOrder?: number;
}
