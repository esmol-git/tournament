import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UpdateTenantPublicBrandingDto {
  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(500)
  publicLogoUrl?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(500)
  publicFaviconUrl?: string | null;

  @ApiPropertyOptional({ example: '#123c67' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  publicAccentPrimary?: string;

  @ApiPropertyOptional({ example: '#c80a48' })
  @IsOptional()
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  publicAccentSecondary?: string;

  @ApiPropertyOptional({ enum: ['light', 'dark', 'system'], example: 'system' })
  @IsOptional()
  @IsString()
  @IsIn(['light', 'dark', 'system'])
  publicThemeMode?: 'light' | 'dark' | 'system';

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @MaxLength(160)
  publicTagline?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 160 })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @MaxLength(160)
  publicOrganizationDisplayName?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 60 })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @MaxLength(60)
  publicContactPhone?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 120 })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @MaxLength(120)
  publicContactEmail?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 240 })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @MaxLength(240)
  publicContactAddress?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 120 })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @MaxLength(120)
  publicContactHours?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 120 })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @MaxLength(120)
  publicSeoTitle?: string | null;

  @ApiPropertyOptional({ nullable: true, maxLength: 300 })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @MaxLength(300)
  publicSeoDescription?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsString()
  @IsUrl({ require_protocol: true, protocols: ['http', 'https'] })
  @MaxLength(500)
  publicOgImageUrl?: string | null;

  @ApiPropertyOptional({ enum: ['about', 'tournaments', 'participants', 'media'], example: 'tournaments' })
  @IsOptional()
  @IsString()
  @IsIn(['about', 'tournaments', 'participants', 'media'])
  publicDefaultLanding?: 'about' | 'tournaments' | 'participants' | 'media';

  @ApiPropertyOptional({
    example: 'table,chessboard,progress,playoff',
    description: 'Порядок вкладок турнира через запятую.',
  })
  @IsOptional()
  @IsString()
  @Matches(/^(table|chessboard|progress|playoff)(,(table|chessboard|progress|playoff)){3}$/)
  publicTournamentTabsOrder?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  publicShowLeaderInFacts?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  publicShowTopStats?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  publicShowNewsInSidebar?: boolean;
}
