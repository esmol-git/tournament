import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Min,
} from 'class-validator';

export class TeamPlayersQueryDto {
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
  sortField?:
    | 'jerseyNumber'
    | 'lastName'
    | 'firstName'
    | 'birthDate'
    | 'position'
    | 'phone';

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
      'Поиск по имени и/или фамилии (слова через пробел), как в списке игроков',
    example: 'Иван Петров',
  })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'Иванов' })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ example: 'Иван' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ example: 'Вратарь' })
  @IsOptional()
  @IsString()
  position?: string;

  @ApiPropertyOptional({ example: '+7' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ example: '10' })
  @IsOptional()
  @Type(() => Number)
  @Transform(({ value }) => {
    const n = Number(value);
    return Number.isFinite(n) ? Math.trunc(n) : undefined;
  })
  @IsInt()
  jerseyNumber?: number;

  @ApiPropertyOptional({ example: '2007-01-01' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'birthDateFrom must be YYYY-MM-DD',
  })
  birthDateFrom?: string;

  @ApiPropertyOptional({ example: '2007-12-31' })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'birthDateTo must be YYYY-MM-DD' })
  birthDateTo?: string;

  @ApiPropertyOptional({
    description:
      'Если true — только игроки с активной связью (для протокола матча и заявки на турнир)',
    example: true,
  })
  @IsOptional()
  @Transform(
    ({ value }) =>
      value === true || value === 'true' || value === 1 || value === '1',
  )
  @IsBoolean()
  activeOnly?: boolean;
}
