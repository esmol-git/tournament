function firstQueryValue(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] ?? '').trim()
  if (typeof value === 'string') return value.trim()
  return ''
}

export default defineNuxtRouteMiddleware((to) => {
  const tenant = Array.isArray(to.params.tenant)
    ? String(to.params.tenant[0] ?? '').trim()
    : String(to.params.tenant ?? '').trim()
  if (!tenant) return

  const base = `/${tenant}/tournaments`
  if (!to.path.startsWith(base)) return

  const rest = to.path.slice(base.length)
  if (!rest || rest === '/') return

  const isInnerTournamentRoute = /^\/(table|calendar|scorers|documents|participants|media|news|photo|video|broadcasts|match-[^/]+)(\/|$)/.test(
    rest,
  )
  if (!isInnerTournamentRoute) return

  const tid = firstQueryValue(to.query.tid)
  if (tid) return

  return navigateTo({ path: base })
})

