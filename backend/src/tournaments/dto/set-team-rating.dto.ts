import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, Max, Min } from 'class-validator';

export class SetTeamRatingDto {
  @ApiProperty({
    example: 4,
    description: 'TournamentTeam rating from 1 (weak) to 5 (strong)',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;
}
