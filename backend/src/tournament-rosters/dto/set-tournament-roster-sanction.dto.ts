import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class SetTournamentRosterSanctionDto {
  @ApiProperty({ description: 'true — дисквалифицировать, false — вернуть в состав' })
  @IsBoolean()
  disqualified!: boolean;

  @ApiPropertyOptional({ description: 'Причина / комментарий' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}
