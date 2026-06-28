/** Год рождения из названия команды («Импульс 2018», «ДЮСШ Спартак 2012»). */
export function inferBirthYearFromTeamName(name: string): number | null {
  const matches = name.match(/\b(19\d{2}|20\d{2})\b/g)
  if (!matches?.length) return null
  const year = Number(matches[matches.length - 1])
  const max = new Date().getFullYear()
  if (!Number.isInteger(year) || year < 1950 || year > max) return null
  return year
}

export function birthYearToDateRange(year: number): {
  birthDateFrom: string
  birthDateTo: string
} {
  return {
    birthDateFrom: `${year}-01-01`,
    birthDateTo: `${year}-12-31`,
  }
}
