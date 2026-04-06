import { ApiProperty } from '@nestjs/swagger';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { TournamentFormat, TournamentTemplateKind } from '@prisma/client';

export class CreateTournamentTemplateDto {
  @ApiProperty({ example: 'Летний кубок U-12 (пресет)' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: TournamentTemplateKind, required: false })
  @IsOptional()
  @IsEnum(TournamentTemplateKind)
  kind?: TournamentTemplateKind;

  @ApiProperty({ enum: TournamentFormat, required: false })
  @IsOptional()
  @IsEnum(TournamentFormat)
  format?: TournamentFormat;

  @ApiProperty({ required: false, example: 2 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(8)
  groupCount?: number;

  @ApiProperty({ required: false, example: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(8)
  playoffQualifiersPerGroup?: number;

  @ApiProperty({ required: false, example: 7 })
  @IsOptional()
  @IsInt()
  @Min(1)
  intervalDays?: number;

  @ApiProperty({ required: false, example: [6] })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  allowedDays?: number[];

  @ApiProperty({ required: false, example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  roundRobinCycles?: number;

  @ApiProperty({ required: false, example: 50 })
  @IsOptional()
  @IsInt()
  @Min(1)
  matchDurationMinutes?: number;

  @ApiProperty({ required: false, example: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  matchBreakMinutes?: number;

  @ApiProperty({ required: false, example: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  simultaneousMatches?: number;

  @ApiProperty({ required: false, example: '10:00' })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  dayStartTimeDefault?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsObject()
  dayStartTimeOverrides?: Record<string, string>;

  @ApiProperty({ required: false, example: 8 })
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

  @ApiProperty({ required: false, example: '#6366f1' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  calendarColor?: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  seasonId?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  competitionId?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  ageGroupId?: string | null;

  @ApiProperty({ required: false, nullable: true })
  @IsOptional()
  @IsString()
  stadiumId?: string | null;

  @ApiProperty({ required: false, type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  refereeIds?: string[];
}
