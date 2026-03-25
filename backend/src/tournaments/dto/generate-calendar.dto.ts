import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class GenerateCalendarDto {
  @ApiPropertyOptional({
    example: '2026-03-18',
    description: 'Defaults to tournament.startsAt',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({
    example: 7,
    description: 'Defaults to tournament.intervalDays',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  intervalDays?: number;

  @ApiProperty({
    required: false,
    example: [6, 0],
    description:
      'Allowed JS day numbers, 0=Sun..6=Sat. Defaults to tournament.allowedDays',
  })
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  allowedDays?: number[];

  @ApiPropertyOptional({
    example: true,
    description:
      'If true (default), deletes existing matches (and events) for this tournament before creating a new calendar',
  })
  @IsOptional()
  @IsBoolean()
  replaceExisting?: boolean;

  @ApiPropertyOptional({
    example: 50,
    description:
      'Match duration in minutes (defaults to tournament.matchDurationMinutes)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  matchDurationMinutes?: number;

  @ApiPropertyOptional({
    example: 10,
    description:
      'Break between matches in minutes (defaults to tournament.matchBreakMinutes)',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  matchBreakMinutes?: number;

  @ApiPropertyOptional({
    example: 2,
    description:
      'Number of simultaneous matches (defaults to tournament.simultaneousMatches)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  simultaneousMatches?: number;

  @ApiPropertyOptional({
    example: '12:00',
    description:
      'Default day start time (HH:mm), defaults to tournament.dayStartTimeDefault',
  })
  @IsOptional()
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  dayStartTimeDefault?: string;

  @ApiPropertyOptional({
    example: { '0': '10:00', '6': '12:00' },
    description:
      'Overrides by JS day number, 0..6 -> HH:mm. Defaults to tournament.dayStartTimeOverrides',
  })
  @IsOptional()
  @IsObject()
  dayStartTimeOverrides?: Record<string, string>;

  @ApiPropertyOptional({
    example: 3,
    description:
      'How many rounds to place on the same day before moving to the next available date (defaults to 1)',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  roundsPerDay?: number;
}
