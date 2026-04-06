/**
 * Полное имя пользователя из сессии: API отдаёт `name` + `lastName`,
 * в других местах может быть `firstName`.
 */
export function formatUserFullNameFromParts(user: unknown): string {
  const u = (user ?? {}) as {
    name?: string | null
    firstName?: string | null
    lastName?: string | null
  }
  const first = (u.name ?? u.firstName)?.trim() ?? ''
  const last = (u.lastName ?? '').trim()
  return [first, last].filter(Boolean).join(' ')
}

/**
 * Подпись в списках и селектах: сначала имя и фамилия (фамилия может быть пустой),
 * если ФИО нет — почта, затем логин.
 */
export function formatUserListLabel(user: unknown): string {
  const u = (user ?? {}) as {
    name?: string | null
    firstName?: string | null
    lastName?: string | null
    email?: string | null
    username?: string | null
  }
  const full = formatUserFullNameFromParts(u)
  if (full) return full
  const email = u.email?.trim()
  if (email) return email
  const username = u.username?.trim()
  if (username) return username
  return '—'
}
