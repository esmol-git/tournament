/**
 * Роль staff-пользователя в организации из объекта пользователя (`/me`, Pinia).
 * Пустая или пробельная строка → `null` (как в middleware админки).
 */
export function readTenantStaffRole(user: unknown): string | null {
  if (!user || typeof user !== 'object') return null
  const role = (user as { role?: unknown }).role
  if (typeof role !== 'string') return null
  const t = role.trim()
  return t.length ? t : null
}
