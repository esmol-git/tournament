import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { MatchStage, PlayoffRound } from '@prisma/client';

export class CreateMatchDto {
  @ApiProperty()
  @IsString()
  homeTeamId: string;

  @ApiProperty()
  @IsString()
  awayTeamId: string;

  @ApiProperty({ example: '2026-04-01T15:00:00.000Z' })
  @IsDateString()
  startTime: string;

  @ApiPropertyOptional({ enum: MatchStage })
  @IsOptional()
  @IsEnum(MatchStage)
  stage?: MatchStage;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(1)
  roundNumber?: number;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  groupId?: string | null;

  @ApiPropertyOptional({ enum: PlayoffRound, nullable: true })
  @IsOptional()
  @IsEnum(PlayoffRound)
  playoffRound?: PlayoffRound | null;

  @ApiPropertyOptional({
    description:
      'Площадка из справочника; при списке площадок турнира должна быть из него',
  })
  @IsOptional()
  @IsString()
  stadiumId?: string;
}
