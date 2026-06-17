import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  CompetitionAudience,
  EditionStatus,
  SanctionScope,
} from '@prisma/client';
import { EditionEligibilityDto } from './edition-eligibility.dto';

export class CreateCompetitionEditionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  slug: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsString()
  @IsNotEmpty()
  seasonId: string;

  @IsString()
  @IsNotEmpty()
  competitionId: string;

  @IsOptional()
  @IsEnum(CompetitionAudience)
  audience?: CompetitionAudience;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsEnum(SanctionScope)
  sanctionScope?: SanctionScope;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  cardAutoBanEnabled?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  redCardBanMatches?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  yellowAccumulationThreshold?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  yellowAccumulationBanMatches?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  technicalWinGoalsFor?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  technicalWinGoalsAgainst?: number;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  published?: boolean;

  @IsOptional()
  @IsEnum(EditionStatus)
  status?: EditionStatus;

  @IsOptional()
  @ValidateNested()
  @Type(() => EditionEligibilityDto)
  eligibility?: EditionEligibilityDto;
}
