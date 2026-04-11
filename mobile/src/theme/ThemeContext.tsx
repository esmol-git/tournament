import AsyncStorage from '@react-native-async-storage/async-storage'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useColorScheme as useRNColorScheme } from 'react-native'
import {
  type AccentPresetId,
  type ColorScheme,
  ACCENT_PRESET_IDS,
  buildThemeColors,
  type ThemeColors,
} from './palette'

const KEY_SCHEME = '@tp/app/colorScheme'
const KEY_ACCENT = '@tp/app/accentPreset'

/** Сохранённое предпочтение: светлая / тёмная / как в ОС. */
export type ThemePreference = 'light' | 'dark' | 'system'

type ThemeContextValue = {
  colors: ThemeColors
  /** Эффективная схема для отрисовки (с учётом system). */
  colorScheme: ColorScheme
  themePreference: ThemePreference
  accentPreset: AccentPresetId
  isDark: boolean
  /** Явно светлая или тёмная (сбрасывает «системную» тему). */
  setColorScheme: (s: ColorScheme) => void
  setThemePreference: (p: ThemePreference) => void
  setAccentPreset: (id: AccentPresetId) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

function parsePreference(raw: string | null): ThemePreference {
  if (raw === 'dark' || raw === 'light' || raw === 'system') {
    return raw
  }
  return 'light'
}

function parseAccent(raw: string | null): AccentPresetId {
  if (raw && ACCENT_PRESET_IDS.includes(raw as AccentPresetId)) {
    return raw as AccentPresetId
  }
  return 'berry'
}

function resolveScheme(preference: ThemePreference, system: ColorScheme | null | undefined): ColorScheme {
  if (preference === 'system') {
    return system === 'dark' ? 'dark' : 'light'
  }
  return preference
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useRNColorScheme()
  const [themePreference, setThemePreferenceState] = useState<ThemePreference>('light')
  const [accentPreset, setAccentPresetState] = useState<AccentPresetId>('berry')

  useEffect(() => {
    void (async () => {
      try {
        const [s, a] = await AsyncStorage.multiGet([KEY_SCHEME, KEY_ACCENT])
        setThemePreferenceState(parsePreference(s[1]))
        setAccentPresetState(parseAccent(a[1]))
      } catch {
        /* defaults */
      }
    })()
  }, [])

  const setThemePreference = useCallback((p: ThemePreference) => {
    setThemePreferenceState(p)
    void AsyncStorage.setItem(KEY_SCHEME, p)
  }, [])

  const setColorScheme = useCallback(
    (s: ColorScheme) => {
      setThemePreference(s)
    },
    [setThemePreference],
  )

  const setAccentPreset = useCallback((id: AccentPresetId) => {
    setAccentPresetState(id)
    void AsyncStorage.setItem(KEY_ACCENT, id)
  }, [])

  const colorScheme = useMemo(
    () => resolveScheme(themePreference, systemScheme),
    [themePreference, systemScheme],
  )

  const value = useMemo<ThemeContextValue>(() => {
    const colors = buildThemeColors(colorScheme, accentPreset)
    return {
      colors,
      colorScheme,
      themePreference,
      accentPreset,
      isDark: colorScheme === 'dark',
      setColorScheme,
      setThemePreference,
      setAccentPreset,
    }
  }, [
    colorScheme,
    themePreference,
    accentPreset,
    setColorScheme,
    setThemePreference,
    setAccentPreset,
  ])

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) {
    throw new Error('useTheme must be used within ThemeProvider')
  }
  return ctx
}
