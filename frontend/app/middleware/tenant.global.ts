import { useTenantStore } from '~/stores/tenant'

function tenantFromHost(hostHeader?: string): string | null {
  const host = hostHeader?.split(':')[0]?.toLowerCase()
  if (!host || host === 'localhost' || host === '127.0.0.1') {
    return null
  }

  // Dev: tenant.localhost -> tenant
  // (у нас `.localhost` даёт всего 2 части, а текущая логика требует >= 3)
  if (host.endsWith('.localhost')) {
    const parts = host.split('.')
    return parts.length === 2 ? parts[0]! : null
  }

  // tenant.example.com / tenant.lvh.me -> tenant
  const parts = host.split('.')
  if (parts.length < 3) return null
  const sub = parts[0]
  if (!sub || sub === 'www') return null
  return sub
}

function currentHost(): string | undefined {
  if (import.meta.client) {
    return window.location.host
  }
  return useRequestHeaders(['host']).host
}

function isLocalHost(hostHeader?: string): boolean {
  const host = hostHeader?.split(':')[0]?.toLowerCase()
  return host === 'localhost' || host === '127.0.0.1'
}

export default defineNuxtRouteMiddleware((to) => {
  const tenantStore = useTenantStore()
  const hostHeader = currentHost()
  const tenantFromSubdomain = tenantFromHost(hostHeader)
  const isAdminRoute = to.path.startsWith('/admin')

  // Прод-домены: админка доступна только с tenant-поддомена.
  // На root-домене (tournament-platform.ru/admin/...) не тянем tenant-данные.
  if (
    isAdminRoute &&
    !to.path.startsWith('/admin/login') &&
    !tenantFromSubdomain &&
    !isLocalHost(hostHeader)
  ) {
    return navigateTo('/')
  }

  // Для админки на localhost оставляем явный tenantSlug/дефолт.
  // Для поддоменов (acme.lvh.me/admin) сохраняем tenant из host.
  if (isAdminRoute && !to.path.startsWith('/admin/login')) {
    tenantStore.setTenant(tenantFromSubdomain)
    return
  }

  const tenantFromParam = to.params.tenant as string | undefined
  if (tenantFromParam) {
    tenantStore.setTenant(tenantFromParam)
    return
  }

  tenantStore.setTenant(tenantFromSubdomain)
})
