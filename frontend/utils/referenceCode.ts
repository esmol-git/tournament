import { slugifyFromTitle } from '~/utils/slugify'

/**
 * `code` для справочников: человеко-читаемый "machine key".
 * Не обязателен и пока не уникален в БД, поэтому генерим просто и предсказуемо.
 */
export function referenceCodeFromName(name: string): string {
  const base = slugifyFromTitle(name, '')
  if (!base) return ''
  return base.toUpperCase()
}

