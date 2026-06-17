import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

/** Регламент допуска на уровне серии (создаёт/обновляет EligibilityPolicy). */
export class EditionEligibilityDto {
  @IsOptional()
  @IsString()
  ageGroupId?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2100)
  minBirthYear?: number | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1900)
  @Max(2100)
  maxBirthYear?: number | null;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  requireBirthDate?: boolean;
}
