import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MatchRefereeAssignmentDto } from './match-referee-assignment.dto';

export class BulkUpdateMatchesDto {
  @ApiProperty({
    type: [String],
    description: 'Список id матчей в рамках одного турнира',
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  matchIds!: string[];

  @ApiPropertyOptional({
    description: 'Сдвиг времени начала в минутах (может быть отрицательным)',
    example: 30,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(-24 * 60)
  @Max(24 * 60)
  shiftMinutes?: number;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Установить площадку для всех выбранных матчей; null — снять',
  })
  @IsOptional()
  stadiumId?: string | null;

  @ApiPropertyOptional({
    description:
      'Причина переноса/изменения расписания (используется при массовом сдвиге и/или массовой установке причины)',
  })
  @IsOptional()
  @IsString()
  scheduleChangeReasonId?: string;

  @ApiPropertyOptional({
    description: 'Комментарий к причине переноса',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  scheduleChangeNote?: string;

  @ApiPropertyOptional({
    description:
      'Показывать выбранные матчи на публичном сайте и в публичном ICS (можно для любых статусов матча)',
  })
  @IsOptional()
  @IsBoolean()
  publishedOnPublic?: boolean;

  @ApiPropertyOptional({
    type: [MatchRefereeAssignmentDto],
    description:
      'Назначить одну и ту же бригаду на все выбранные матчи (заменяет текущих судей)',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MatchRefereeAssignmentDto)
  referees?: MatchRefereeAssignmentDto[];
}
