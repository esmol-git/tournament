import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

export class PlayersFilterQueryDto {
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

  @ApiPropertyOptional({ description: 'Sort field', example: 'lastName' })
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

  @ApiPropertyOptional({
    description:
      'Поиск по имени и/или фамилии: слова через пробел — каждое слово ищется в имени или фамилии (AND)',
    example: 'Иван Иванов',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({
    description: 'Filter last name (contains)',
    example: 'Иванов',
  })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({
    description: 'Filter first name (contains)',
    example: 'Иван',
  })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({
    description: 'Filter position / role (contains)',
    example: 'Вратарь',
  })
  @IsOptional()
  @IsString()
  position?: string;

  @ApiPropertyOptional({
    description: 'Filter phone (contains)',
    example: '+7',
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    description: 'Birth date from YYYY-MM-DD',
    example: '2007-01-01',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'birthDateFrom must be YYYY-MM-DD',
  })
  birthDateFrom?: string;

  @ApiPropertyOptional({
    description: 'Birth date to YYYY-MM-DD',
    example: '2007-12-31',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'birthDateTo must be YYYY-MM-DD' })
  birthDateTo?: string;

  @ApiPropertyOptional({
    description: 'Filter by team id (player must be in this team)',
    example: 'clxyz...',
  })
  @IsOptional()
  @IsString()
  teamId?: string;
}
