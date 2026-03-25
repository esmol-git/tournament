import { ApiPropertyOptional } from '@nestjs/swagger';
import { PlayerGender, TeamCategoryType } from '@prisma/client';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';

class TeamCategoryRuleDto {
  @ApiPropertyOptional({ enum: TeamCategoryType })
  @IsOptional()
  @IsEnum(TeamCategoryType)
  type?: TeamCategoryType;

  @ApiPropertyOptional({ example: 2018 })
  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  minBirthYear?: number | null;

  @ApiPropertyOptional({ example: 2020 })
  @IsOptional()
  @IsInt()
  @Min(1900)
  @Max(2100)
  maxBirthYear?: number | null;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  requireBirthDate?: boolean;

  @ApiPropertyOptional({ isArray: true, enum: PlayerGender })
  @IsOptional()
  @IsArray()
  @IsEnum(PlayerGender, { each: true })
  allowedGenders?: PlayerGender[];
}

export class UpdateTeamCategoryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  slug?: string;

  @ApiPropertyOptional({
    type: [TeamCategoryRuleDto],
    description: 'Multiple rules inside one category',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TeamCategoryRuleDto)
  rules?: TeamCategoryRuleDto[];
}
