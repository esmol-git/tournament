import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsNumber,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';

export class UpdateTenantShareTableImageDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(500)
  shareTableImageLogoUrl?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  shareTableImageShowLogo?: boolean;

  @ApiPropertyOptional({ minimum: 0.55, maximum: 1.25, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.55)
  @Max(1.25)
  shareTableImageFontScale?: number;
}
