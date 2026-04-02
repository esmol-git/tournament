<script setup lang="ts">
import { useAuth } from '~/composables/useAuth'

definePageMeta({
  layout: 'auth',
})

const { t } = useI18n()
const { clearSession } = useAuth()

async function logout() {
  clearSession()
  await navigateTo('/admin/login')
}
</script>

<template>
  <div class="mx-auto max-w-md space-y-4">
    <h1 class="text-center text-xl font-semibold text-surface-900 dark:text-surface-0">
      {{ t('admin.access_denied.title') }}
    </h1>
    <p class="text-center text-sm leading-relaxed text-muted-color">
      {{ t('admin.access_denied.lead') }}
    </p>
    <p class="text-center text-sm leading-relaxed text-muted-color">
      {{ t('admin.access_denied.hint') }}
    </p>
    <div class="flex flex-wrap justify-center gap-2 pt-2">
      <NuxtLink to="/">
        <Button :label="t('admin.access_denied.home')" outlined />
      </NuxtLink>
      <Button :label="t('admin.access_denied.logout')" @click="logout" />
    </div>
  </div>
</template>
