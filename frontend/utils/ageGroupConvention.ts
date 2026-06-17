/**
 * Единое соглашение имён возрастных групп:
 * Y#### — дети, ровно один год рождения
 * A##   — взрослые, минимальный возраст (35 → A35)
 * OPEN  — без ограничения по году рождения
 */

export type AgeGroupConventionKind = 'youth' | 'adult' | 'open' | 'custom'

export type AgeGroupConventionFields = {
  code: string
  name: string
  shortLabel: string
  minBirthYear: number | null
  maxBirthYear: number | null
  sortOrder: number
  note?: string
}

const YOUTH_CODE = /^Y(19|20)\d{2}$/
const ADULT_CODE = /^A(\d{1,2})$/
const OPEN_CODE = /^OPEN$/i

export function maxBirthYearForMinAge(
  minAge: number,
  referenceYear = new Date().getFullYear(),
): number {
  return referenceYear - minAge
}

export function buildYouthAgeGroupFields(birthYear: number): AgeGroupConventionFields {
  return {
    code: `Y${birthYear}`,
    name: `${birthYear} г.р.`,
    shortLabel: String(birthYear),
    minBirthYear: birthYear,
    maxBirthYear: birthYear,
    sortOrder: birthYear,
  }
}

export function buildAdultAgeGroupFields(
  minAge: number,
  referenceYear = new Date().getFullYear(),
): AgeGroupConventionFields {
  const maxBirth = maxBirthYearForMinAge(minAge, referenceYear)
  return {
    code: `A${minAge}`,
    name: `Взрослые ${minAge}+`,
    shortLabel: `${minAge}+`,
    minBirthYear: null,
    maxBirthYear: maxBirth,
    sortOrder: 10_000 + minAge,
    note: `Макс. год рождения ${maxBirth} — возраст ${minAge}+ на 1 января ${referenceYear} г. Обновляйте макс. год при смене сезона.`,
  }
}

export function buildOpenAgeGroupFields(): AgeGroupConventionFields {
  return {
    code: 'OPEN',
    name: 'Открытая категория',
    shortLabel: 'Открытый',
    minBirthYear: null,
    maxBirthYear: null,
    sortOrder: 99_999,
  }
}

export function buildYouthAgeGroupRange(
  fromBirthYear: number,
  toBirthYear: number,
): AgeGroupConventionFields[] {
  const from = Math.min(fromBirthYear, toBirthYear)
  const to = Math.max(fromBirthYear, toBirthYear)
  const rows: AgeGroupConventionFields[] = []
  for (let year = from; year <= to; year += 1) {
    rows.push(buildYouthAgeGroupFields(year))
  }
  return rows
}

export function detectAgeGroupConventionKind(code: string | null | undefined): AgeGroupConventionKind {
  const c = (code ?? '').trim()
  if (!c) return 'custom'
  if (OPEN_CODE.test(c)) return 'open'
  if (YOUTH_CODE.test(c)) return 'youth'
  if (ADULT_CODE.test(c)) return 'adult'
  return 'custom'
}

export function parseYouthBirthYearFromCode(code: string): number | null {
  const m = code.trim().match(/^Y((?:19|20)\d{2})$/)
  if (!m) return null
  return Number(m[1])
}

export function parseAdultMinAgeFromCode(code: string): number | null {
  const m = code.trim().match(/^A(\d{1,2})$/)
  if (!m) return null
  return Number(m[1])
}

export function isStandardAgeGroupCode(code: string | null | undefined): boolean {
  return detectAgeGroupConventionKind(code) !== 'custom'
}
