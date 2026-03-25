import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, IsString } from 'class-validator';

export class CreateStandaloneMatchDto {
  @ApiProperty()
  @IsString()
  homeTeamId: string;

  @ApiProperty()
  @IsString()
  awayTeamId: string;

  @ApiProperty({ example: '2026-04-01T15:00:00.000Z' })
  @IsDateString()
  startTime: string;
}
