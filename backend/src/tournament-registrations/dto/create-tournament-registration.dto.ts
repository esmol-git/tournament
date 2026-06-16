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

  @ApiPropertyOptional({ description: 'URL вложения (Excel/CSV от клуба)' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  attachmentUrl?: string;

  @ApiPropertyOptional({ description: 'Имя файла вложения' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  attachmentFileName?: string;
}
