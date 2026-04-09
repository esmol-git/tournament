<script setup lang="ts">
import { useAuth } from '~/composables/useAuth'

const router = useRouter()
const { clearSession } = useAuth()

function logout() {
  clearSession()
  router.push('/platform/login')
}
</script>

<template>
  <div class="min-h-screen bg-surface-50 text-surface-900 dark:bg-surface-950 dark:text-surface-0">
    <Toast position="top-right" />
    <header
      class="border-b border-surface-200 bg-white dark:border-surface-700 dark:bg-surface-900"
    >
      <div class="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-3.5">
        <div class="flex min-w-0 items-center gap-5">
          <NuxtLink
            to="/platform/tenants"
            class="flex min-w-0 items-center gap-3 rounded-lg outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-primary"
          >
            <img
              src="/logo.png"
              alt=""
              width="36"
              height="36"
              class="h-9 w-9 shrink-0 object-contain"
            />
            <span class="truncate text-lg font-semibold text-surface-900 dark:text-surface-0">
              Platform Admin
            </span>
          </NuxtLink>
          <nav class="flex items-center gap-2">
            <NuxtLink to="/platform/tenants" class="platform-nav-link">Организации</NuxtLink>
            <NuxtLink to="/platform/leads" class="platform-nav-link">Лиды</NuxtLink>
          </nav>
        </div>
        <Button label="Выйти" icon="pi pi-sign-out" severity="secondary" text @click="logout" />
      </div>
    </header>
    <main class="mx-auto max-w-6xl px-6 py-6">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.platform-nav-link {
  border-radius: 0.5rem;
  padding: 0.4rem 0.65rem;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--p-text-muted-color);
}

.platform-nav-link.router-link-active {
  background: color-mix(in srgb, var(--p-primary-color) 14%, transparent);
  color: var(--p-primary-color);
}
</style>
