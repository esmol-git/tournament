import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateTournamentRegistrationDto {
  @ApiPropertyOptional({ description: 'Команда, от имени которой подаётся заявка' })
  @IsString()
  teamId!: string;

  @ApiPropertyOptional({ description: 'Комментарий от представителя команды' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  message?: string;
}
