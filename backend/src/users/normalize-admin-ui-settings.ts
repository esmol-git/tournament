import type { Prisma } from '@prisma/client';
import type { ThemeMode, UiAccent, UiLocale } from './dto/ui-settings.dto';

const DEFAULT_UI: {
  themeMode: ThemeMode;
  locale: UiLocale;
  accent: UiAccent;
} = {
  themeMode: 'system',
  locale: 'ru',
  accent: 'emerald',
};

const THEME_SET = new Set<string>(['light', 'dark', 'system']);
const LOCALE_SET = new Set<string>(['ru', 'en']);
const ACCENT_SET = new Set<string>([
  'emerald',
  'blue',
  'violet',
  'rose',
  'amber',
  'cyan',
]);

export type NormalizedAdminUiSettings = {
  themeMode: ThemeMode;
  locale: UiLocale;
  accent: UiAccent;
};

export function normalizeAdminUiSettings(
  raw: Prisma.JsonValue | null,
): NormalizedAdminUiSettings {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_UI };
  }
  const o = raw as Record<string, unknown>;
  const themeRaw = o.themeMode;
  const localeRaw = o.locale;
  const accentRaw = o.accent;
  const themeMode =
    typeof themeRaw === 'string' && THEME_SET.has(themeRaw.toLowerCase())
      ? (themeRaw.toLowerCase() as ThemeMode)
      : DEFAULT_UI.themeMode;
  const locale =
    typeof localeRaw === 'string' && LOCALE_SET.has(localeRaw.toLowerCase())
      ? (localeRaw.toLowerCase() as UiLocale)
      : DEFAULT_UI.locale;
  const accent =
    typeof accentRaw === 'string' && ACCENT_SET.has(accentRaw.toLowerCase())
      ? (accentRaw.toLowerCase() as UiAccent)
      : DEFAULT_UI.accent;
  return { themeMode, locale, accent };
}
