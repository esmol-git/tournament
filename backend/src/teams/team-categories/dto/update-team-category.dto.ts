import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { PlayerGender } from '@prisma/client';

export class UpdateTeamCategoryDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  slug?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  minBirthYear?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  maxBirthYear?: number | null;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  requireBirthDate?: boolean;

  @IsOptional()
  @IsArray()
  @IsEnum(PlayerGender, { each: true })
  allowedGenders?: PlayerGender[];
}
