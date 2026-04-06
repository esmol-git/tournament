import 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    /**
     * Глобальный MODERATOR организации: на странице только просмотр (кнопки создания/редактирования скрыты).
     * - `true` — принудительно read-only даже вне реестра путей.
     * - `false` — не применять org read-only (например, кастомная страница под `/admin/teams/...`).
     * - не задано — см. `isAdminOrgModeratorReadOnlyPath` в `adminModeratorOrgPolicy` (на админ-страницах обычно задаётся в `definePageMeta`).
     */
    adminOrgModeratorReadOnly?: boolean
  }
}

export {}
