import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UpdateTenantSocialLinksDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(500)
  websiteUrl?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(500)
  socialYoutubeUrl?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(500)
  socialInstagramUrl?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(500)
  socialTelegramUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showWebsiteLink?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(500)
  socialMaxUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showSocialYoutubeLink?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showSocialInstagramLink?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showSocialTelegramLink?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  showSocialMaxLink?: boolean;
}
