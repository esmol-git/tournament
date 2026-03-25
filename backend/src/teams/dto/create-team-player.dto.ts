import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateTeamPlayerDto {
  @ApiPropertyOptional({ description: 'Player id' })
  @IsString()
  playerId: string;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsInt()
  @Min(0)
  jerseyNumber?: number;

  @ApiPropertyOptional({ example: 'Вратарь' })
  @IsOptional()
  @IsString()
  position?: string;
}
