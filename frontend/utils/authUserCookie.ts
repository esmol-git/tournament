/**
 * Между поддоменами шарим только компактный снимок пользователя (роль, тариф),
 * чтобы не раздувать Cookie header полным JSON из `/auth/me`.
 * Полный объект остаётся в localStorage на текущем origin.
 */
export function serializeAuthUserForCookie(user: unknown): string {
  if (!user || typeof user !== 'object') return ''
  const o = user as Record<string, unknown>
  const ts = o.tenantSubscription
  let tenantSubscription: { plan: string } | undefined
  if (ts && typeof ts === 'object') {
    const plan = (ts as { plan?: unknown }).plan
    if (typeof plan === 'string' && plan.trim()) {
      tenantSubscription = { plan: plan.trim() }
    }
  }
  const id = o.id
  const tenantId = o.tenantId
  const role = o.role
  if (typeof id !== 'string' || typeof tenantId !== 'string' || typeof role !== 'string') {
    return ''
  }
  return JSON.stringify({
    id,
    tenantId,
    role,
    ...(tenantSubscription ? { tenantSubscription } : {}),
  })
}
