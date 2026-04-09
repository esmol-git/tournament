import { ApiPropertyOptional } from '@nestjs/swagger';
import { DemoLeadStatus } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ListDemoLeadsQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  pageSize?: number = 20;

  @ApiPropertyOptional({ enum: DemoLeadStatus })
  @IsEnum(DemoLeadStatus)
  @IsOptional()
  status?: DemoLeadStatus;

  @ApiPropertyOptional({ description: 'Поиск по name/contact/league/message' })
  @IsString()
  @IsOptional()
  q?: string;
}
