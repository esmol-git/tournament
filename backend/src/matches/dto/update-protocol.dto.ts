import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { MatchEventType, MatchStatus, MatchTeamSide } from '@prisma/client';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

class ProtocolEventDto {
  @ApiProperty({ enum: MatchEventType, example: MatchEventType.GOAL })
  @IsEnum(MatchEventType)
  type: MatchEventType;

  @ApiProperty({ required: false, example: 15 })
  @IsOptional()
  @IsInt()
  @Min(0)
  minute?: number;

  @ApiProperty({ required: false, example: 'player123' })
  @IsOptional()
  @IsString()
  playerId?: string;

  @ApiProperty({
    required: false,
    enum: MatchTeamSide,
    example: MatchTeamSide.HOME,
  })
  @IsOptional()
  @IsEnum(MatchTeamSide)
  teamSide?: MatchTeamSide;

  @ApiProperty({ required: false, example: { assistId: 'p2' } })
  @IsOptional()
  @IsObject()
  payload?: Record<string, any>;
}

export class UpdateProtocolDto {
  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(0)
  homeScore: number;

  @ApiProperty({ example: 1 })
  @IsInt()
  @Min(0)
  awayScore: number;

  @ApiProperty({
    required: false,
    enum: MatchStatus,
    example: MatchStatus.PLAYED,
  })
  @IsOptional()
  @IsEnum(MatchStatus)
  status?: MatchStatus;

  @ApiProperty({ required: false, type: [ProtocolEventDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProtocolEventDto)
  events?: ProtocolEventDto[];
}
