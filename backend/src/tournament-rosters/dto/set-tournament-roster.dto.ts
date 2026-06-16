import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class TournamentRosterPlayerItemDto {
  @ApiProperty({ example: 'clx...' })
  @IsString()
  playerId: string;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(99)
  jerseyNumber?: number;
}

export class SetTournamentRosterDto {
  @ApiProperty({ type: [TournamentRosterPlayerItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TournamentRosterPlayerItemDto)
  players: TournamentRosterPlayerItemDto[];
}
