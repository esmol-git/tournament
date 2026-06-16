import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString } from 'class-validator';

export class ImportTournamentRosterXlsxDto {
  @ApiProperty({
    description: 'Содержимое XLSX в base64',
  })
  @IsString()
  fileBase64!: string;

  @ApiPropertyOptional({
    description:
      'Создавать игроков в каталоге команды, если не найдены по ФИО и дате рождения',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  createMissingPlayers?: boolean;
}
