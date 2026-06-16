import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ImportTournamentRosterCsvDto {
  @ApiProperty({ description: 'Содержимое CSV (UTF-8)' })
  @IsString()
  csvText!: string;

  @ApiPropertyOptional({
    description:
      'Создавать игроков в каталоге команды, если не найдены по ФИО и дате рождения',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  createMissingPlayers?: boolean;
}
