import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { NewsSection } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

export class ListTenantNewsQueryDto {
  @ApiPropertyOptional({ description: 'Фильтр по турниру' })
  @IsOptional()
  @IsString()
  tournamentId?: string;

  @ApiPropertyOptional({
    description: 'Если true — только опубликованные новости',
    default: false,
  })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  publishedOnly?: boolean;

  @ApiPropertyOptional({ enum: NewsSection, description: 'Фильтр по разделу новости' })
  @IsOptional()
  @IsEnum(NewsSection)
  section?: NewsSection;

  @ApiPropertyOptional({ description: 'Фильтр по тегу новости (id)' })
  @IsOptional()
  @IsString()
  tagId?: string;
}
