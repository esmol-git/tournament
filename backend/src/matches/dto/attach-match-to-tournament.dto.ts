import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class AttachMatchToTournamentDto {
  @ApiProperty({
    description:
      'Турнир с форматом MANUAL; обе команды матча должны быть в составе.',
  })
  @IsString()
  tournamentId: string;
}
