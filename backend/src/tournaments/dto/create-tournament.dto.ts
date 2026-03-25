import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsObject,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  TournamentFormat,
  TournamentMemberRole,
  TournamentStatus,
} from '@prisma/client';
import { Type } from 'class-transformer';

class TournamentAdminDto {
  @ApiProperty({ example: 'clx...' })
  @IsString()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({
    required: false,
    enum: TournamentMemberRole,
    example: TournamentMemberRole.TOURNAMENT_ADMIN,
  })
  @IsOptional()
  @IsEnum(TournamentMemberRole)
  role?: TournamentMemberRole;
}

export class CreateTournamentDto {
  @ApiProperty({ example: 'Весенний кубок 2026' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ example: 'vesenniy-kubok-2026' })
  @IsString()
  @IsNotEmpty()
  slug: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    required: false,
    description: 'Tournament category (e.g. 2018, U12, Adult)',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  logoUrl?: string;

  @ApiProperty({
    enum: TournamentFormat,
    example: TournamentFormat.SINGLE_GROUP,
  })
  @IsEnum(TournamentFormat)
  format: TournamentFormat;

  @ApiProperty({
    required: false,
    example: 1,
    description:
      'Number of groups (0..8). For SINGLE_GROUP use 1. For PLAYOFF use 0.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(8)
  groupCount?: number;

  @ApiProperty({
    required: false,
    example: 2,
    description: 'How many teams advance from each group into playoffs (1..8).',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8)
  playoffQualifiersPerGroup?: number;

  @ApiProperty({
    required: false,
    enum: TournamentStatus,
    example: TournamentStatus.DRAFT,
  })
  @IsOptional()
  @IsEnum(TournamentStatus)
  status?: TournamentStatus;

  @ApiProperty({ required: false, example: '2026-03-18' })
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiProperty({ required: false, example: '2026-06-08' })
  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @ApiProperty({ required: false, example: 7 })
  @IsOptional()
  @IsInt()
  @Min(1)
  intervalDays?: number;

  @ApiProperty({
    required: false,
    example: [6, 0],
    description: 'Allowed JS day numbers, 0=Sun..6=Sat',
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  allowedDays?: number[];

  @ApiProperty({
    required: false,
    example: 50,
    description: 'Match duration in minutes',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  matchDurationMinutes?: number;

  @ApiProperty({
    required: false,
    example: 10,
    description: 'Break between matches in minutes',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  matchBreakMinutes?: number;

  @ApiProperty({
    required: false,
    example: 2,
    description: 'Number of simultaneous matches',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  simultaneousMatches?: number;

  @ApiProperty({
    required: false,
    example: '12:00',
    description: 'Default day start time (HH:mm)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  dayStartTimeDefault?: string;

  @ApiProperty({
    required: false,
    example: { '0': '10:00', '6': '12:00' },
    description: 'Overrides by JS day number, 0..6 -> HH:mm',
  })
  @IsOptional()
  @IsObject()
  dayStartTimeOverrides?: Record<string, string>;

  @ApiProperty({ required: false, example: 2 })
  @IsOptional()
  @IsInt()
  @Min(2)
  minTeams?: number;

  @ApiProperty({ required: false, example: 3 })
  @IsOptional()
  @IsInt()
  pointsWin?: number;

  @ApiProperty({ required: false, example: 1 })
  @IsOptional()
  @IsInt()
  pointsDraw?: number;

  @ApiProperty({ required: false, example: 0 })
  @IsOptional()
  @IsInt()
  pointsLoss?: number;

  @ApiProperty({
    required: false,
    type: [TournamentAdminDto],
    description: 'Tournament admins (users of tenant) with per-tournament role',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TournamentAdminDto)
  admins?: TournamentAdminDto[];
}
