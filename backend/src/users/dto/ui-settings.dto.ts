import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

const THEME_MODES = ['light', 'dark', 'system'] as const;
const LOCALES = ['ru', 'en'] as const;
const ACCENTS = ['emerald', 'blue', 'violet', 'rose', 'amber', 'cyan'] as const;

export type ThemeMode = (typeof THEME_MODES)[number];
export type UiLocale = (typeof LOCALES)[number];
export type UiAccent = (typeof ACCENTS)[number];

export class UiSettingsDto {
  @ApiPropertyOptional({ enum: THEME_MODES })
  @IsOptional()
  @IsIn([...THEME_MODES])
  themeMode?: ThemeMode;

  @ApiPropertyOptional({ enum: LOCALES })
  @IsOptional()
  @IsIn([...LOCALES])
  locale?: UiLocale;

  @ApiPropertyOptional({ enum: ACCENTS })
  @IsOptional()
  @IsIn([...ACCENTS])
  accent?: UiAccent;
}
