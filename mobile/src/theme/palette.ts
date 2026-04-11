export type ColorScheme = 'light' | 'dark'

export type AccentPresetId = 'berry' | 'teal' | 'forest' | 'sunset' | 'royal'

export type ThemeColors = {
  primary: string
  accent: string
  muted: string
  border: string
  surface: string
  background: string
  text: string
  error: string
  /** Текст на заливке accent (кнопки). */
  onAccent: string
}

export const ACCENT_PRESETS: Record<
  AccentPresetId,
  { label: string; hex: string }
> = {
  berry: { label: 'Малина', hex: '#c80a48' },
  teal: { label: 'Бирюза', hex: '#0d9488' },
  forest: { label: 'Зелёный', hex: '#15803d' },
  sunset: { label: 'Закат', hex: '#ea580c' },
  royal: { label: 'Синий', hex: '#2563eb' },
}

export const ACCENT_PRESET_IDS = Object.keys(ACCENT_PRESETS) as AccentPresetId[]

export function buildThemeColors(
  scheme: ColorScheme,
  accentId: AccentPresetId,
): ThemeColors {
  const accent = ACCENT_PRESETS[accentId]?.hex ?? ACCENT_PRESETS.berry.hex
  const onAccent = '#ffffff'

  if (scheme === 'light') {
    return {
      primary: '#123c67',
      accent,
      muted: '#4f6b8c',
      border: '#d6e0ee',
      surface: '#f7f9fc',
      background: '#ffffff',
      text: '#0f172a',
      error: '#b91c1c',
      onAccent,
    }
  }

  return {
    primary: '#93c5fd',
    accent,
    muted: '#94a3b8',
    border: '#334155',
    surface: '#1e293b',
    background: '#0f172a',
    text: '#f1f5f9',
    error: '#f87171',
    onAccent,
  }
}
