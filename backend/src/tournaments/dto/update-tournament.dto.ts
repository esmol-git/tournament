import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsObject,
  IsString,
  Matches,
  Max,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  TournamentFormat,
  TournamentMemberRole,
  TournamentStatus,
} from '@prisma/client';

class TournamentAdminDto {
  @ApiPropertyOptional({ example: 'clx...' })
  @IsString()
  userId: string;

  @ApiPropertyOptional({
    enum: TournamentMemberRole,
    example: TournamentMemberRole.TOURNAMENT_ADMIN,
  })
  @IsOptional()
  @IsEnum(TournamentMemberRole)
  role?: TournamentMemberRole;
}

export class UpdateTournamentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Tournament category (e.g. 2018, U12, Adult)',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'URL логотипа; null — убрать логотип',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  logoUrl?: string | null;

  @ApiPropertyOptional({ enum: TournamentFormat })
  @IsOptional()
  @IsEnum(TournamentFormat)
  format?: TournamentFormat;

  @ApiPropertyOptional({
    example: 1,
    description:
      'Number of groups (0..8). For SINGLE_GROUP use 1. For PLAYOFF use 0.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(8)
  groupCount?: number;

  @ApiPropertyOptional({
    required: false,
    example: 2,
    description: 'How many teams advance from each group into playoffs (1..8).',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8)
  playoffQualifiersPerGroup?: number;

  @ApiPropertyOptional({ enum: TournamentStatus })
  @IsOptional()
  @IsEnum(TournamentStatus)
  status?: TournamentStatus;

  @ApiPropertyOptional({ example: '2026-03-18' })
  @IsOptional()
  @IsDateString()
  startsAt?: string | null;

  @ApiPropertyOptional({ example: '2026-06-08' })
  @IsOptional()
  @IsDateString()
  endsAt?: string | null;

  @ApiPropertyOptional({ example: 7 })
  @IsOptional()
  @IsInt()
  @Min(1)
  intervalDays?: number;

  @ApiPropertyOptional({ example: [6, 0] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  allowedDays?: number[];

  @ApiPropertyOptional({
    example: 2,
    description:
      'How many round-robin cycles each pair should play in group stage (1..4)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  roundRobinCycles?: number;

  @ApiPropertyOptional({
    example: 50,
    description: 'Match duration in minutes',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  matchDurationMinutes?: number;

  @ApiPropertyOptional({
    example: 10,
    description: 'Break between matches in minutes',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  matchBreakMinutes?: number;

  @ApiPropertyOptional({
    example: 2,
    description: 'Number of simultaneous matches',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  simultaneousMatches?: number;

  @ApiPropertyOptional({
    example: '12:00',
    description: 'Default day start time (HH:mm)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  dayStartTimeDefault?: string;

  @ApiPropertyOptional({
    example: { '0': '10:00', '6': '12:00' },
    description: 'Overrides by JS day number, 0..6 -> HH:mm',
  })
  @IsOptional()
  @IsObject()
  dayStartTimeOverrides?: Record<string, string> | null;

  @ApiPropertyOptional({ example: 6 })
  @IsOptional()
  @IsInt()
  @Min(2)
  minTeams?: number;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  @Min(0)
  pointsWin?: number;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(0)
  pointsDraw?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  pointsLoss?: number;

  @ApiPropertyOptional({ type: [TournamentAdminDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TournamentAdminDto)
  admins?: TournamentAdminDto[];

  @ApiPropertyOptional({ nullable: true, description: 'Stadium id or null to clear' })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  stadiumId?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Сезон из справочника или null — снять привязку',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  seasonId?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Тип соревнования из справочника или null — снять привязку',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  competitionId?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Возрастная группа из справочника или null — снять привязку',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  ageGroupId?: string | null;

  @ApiPropertyOptional({ type: [String], description: 'Replace tournament referees' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  refereeIds?: string[];
}
