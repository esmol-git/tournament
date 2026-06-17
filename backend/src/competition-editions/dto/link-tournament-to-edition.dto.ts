import { IsEnum, IsOptional } from 'class-validator';
import { TournamentRegulationMode } from '@prisma/client';

export class LinkTournamentToEditionDto {
  @IsOptional()
  @IsEnum(TournamentRegulationMode)
  regulationMode?: TournamentRegulationMode;
}
