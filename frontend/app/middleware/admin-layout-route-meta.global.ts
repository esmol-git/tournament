/**
 * Глобальный pageTransition в nuxt.config не должен затрагивать админку и платформенные экраны.
 * @see https://github.com/nuxt/nuxt/issues/28725 — отключение через meta поддерживается надёжнее включения.
 */
export default defineNuxtRouteMiddleware((to) => {
  const p = to.path
  if (p.startsWith('/admin') || p.startsWith('/platform')) {
    to.meta.pageTransition = false
  }
})
