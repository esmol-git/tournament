import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateMatchDto {
  @ApiPropertyOptional({ example: '2026-03-21T12:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  startTime?: string;

  /** Только для турниров `MANUAL`; иначе игнорируется или 400 при попытке смены. */
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  homeTeamId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  awayTeamId?: string;

  /** Номер тура (круг). Только `MANUAL`. */
  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  roundNumber?: number;

  /** Группа турнира. Только `MANUAL`; `null` — без группы. */
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  groupId?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  scheduleChangeReasonId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  scheduleChangeNote?: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Площадка матча; null — снять привязку',
  })
  @IsOptional()
  stadiumId?: string | null;

  @ApiPropertyOptional({
    description: 'Показывать матч на публичном сайте и в публичном ICS',
  })
  @IsOptional()
  @IsBoolean()
  publishedOnPublic?: boolean;
}
