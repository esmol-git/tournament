import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { NewsSection } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class CreateTournamentNewsDto {
  @ApiPropertyOptional({
    description:
      'Турнир (чемпионат). Если не задан — черновик без привязки. Для публикации обязателен.',
  })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined && v !== '')
  @IsString()
  tournamentId?: string | null;

  @ApiProperty({ example: 'Победа в финале' })
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiProperty({ example: 'pobeda-v-finale' })
  @IsString()
  @MaxLength(200)
  slug: string;

  @ApiPropertyOptional({ example: 'Короткий анонс новости' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  excerpt?: string;

  @ApiPropertyOptional({ example: 'Полный текст (пока plain text/markdown)' })
  @IsOptional()
  @IsString()
  content?: string;

  @ApiPropertyOptional({ example: 'https://...' })
  @IsOptional()
  @IsString()
  coverImageUrl?: string;

  @ApiPropertyOptional({ enum: NewsSection, default: NewsSection.ANNOUNCEMENT })
  @IsOptional()
  @IsEnum(NewsSection)
  section?: NewsSection;

  @ApiPropertyOptional({
    type: [String],
    description: 'Список id тегов новости из tenant-каталога',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tagIds?: string[];

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  published?: boolean;

  @ApiPropertyOptional({ example: '2026-04-01T10:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  publishedAt?: string;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
