import { ApiPropertyOptional } from '@nestjs/swagger';
import { DemoLeadStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';

export class PatchDemoLeadDto {
  @ApiPropertyOptional({ enum: DemoLeadStatus })
  @IsEnum(DemoLeadStatus)
  @IsOptional()
  status?: DemoLeadStatus;

  @ApiPropertyOptional({ example: 'Перезвонить завтра утром' })
  @IsString()
  @MaxLength(5000)
  @IsOptional()
  note?: string;
}
