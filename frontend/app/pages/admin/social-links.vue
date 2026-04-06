<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { getApiErrorMessage } from '~/utils/apiError'
import AdminDataState from '~/app/components/admin/AdminDataState.vue'

definePageMeta({
  layout: 'admin',
  adminOrgModeratorReadOnly: false,
})

const { token, authFetch } = useAuth()
const { apiUrl } = useApiUrl()
const toast = useToast()

const loading = ref(true)
const loadError = ref<string | null>(null)
const saving = ref(false)
const socialLinks = ref({
  websiteUrl: '',
  showWebsiteLink: true,
  socialYoutubeUrl: '',
  showSocialYoutubeLink: true,
  socialTelegramUrl: '',
  showSocialTelegramLink: true,
  socialInstagramUrl: '',
  showSocialInstagramLink: true,
  socialMaxUrl: '',
  showSocialMaxLink: true,
})

function withHttpProtocol(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ''
  if (/^https?:\/\//i.test(trimmed)) return trimmed
  if (/^[a-z]+:\/\//i.test(trimmed)) return trimmed
  return `https://${trimmed}`
}

function isHttpUrlOrNormalizable(value: string): boolean {
  try {
    const u = new URL(withHttpProtocol(value))
    return u.protocol === 'http:' || u.protocol === 'https:'
  } catch {
    return false
  }
}

const socialErrors = computed(() => {
  const mk = (v: string) => {
    const s = v.trim()
    if (!s) return ''
    return isHttpUrlOrNormalizable(s) ? '' : 'Укажите корректный URL'
  }
  return {
    websiteUrl: mk(socialLinks.value.websiteUrl),
    socialYoutubeUrl: mk(socialLinks.value.socialYoutubeUrl),
    socialTelegramUrl: mk(socialLinks.value.socialTelegramUrl),
    socialInstagramUrl: mk(socialLinks.value.socialInstagramUrl),
    socialMaxUrl: mk(socialLinks.value.socialMaxUrl),
  }
})

const hasErrors = computed(() => Object.values(socialErrors.value).some(Boolean))

async function loadTenantSocialLinks() {
  if (!token.value) {
    loading.value = false
    return
  }
  loadError.value = null
  loading.value = true
  try {
    const res = await authFetch<{
      websiteUrl?: string | null
      showWebsiteLink?: boolean
      socialYoutubeUrl?: string | null
      showSocialYoutubeLink?: boolean
      socialInstagramUrl?: string | null
      showSocialInstagramLink?: boolean
      socialTelegramUrl?: string | null
      showSocialTelegramLink?: boolean
      socialMaxUrl?: string | null
      showSocialMaxLink?: boolean
    }>(apiUrl('/users/me/tenant-social-links'))
    socialLinks.value = {
      websiteUrl: res.websiteUrl ?? '',
      showWebsiteLink: res.showWebsiteLink ?? true,
      socialYoutubeUrl: res.socialYoutubeUrl ?? '',
      showSocialYoutubeLink: res.showSocialYoutubeLink ?? true,
      socialTelegramUrl: res.socialTelegramUrl ?? '',
      showSocialTelegramLink: res.showSocialTelegramLink ?? true,
      socialInstagramUrl: res.socialInstagramUrl ?? '',
      showSocialInstagramLink: res.showSocialInstagramLink ?? true,
      socialMaxUrl: res.socialMaxUrl ?? '',
      showSocialMaxLink: res.showSocialMaxLink ?? true,
    }
  } catch (e: unknown) {
    loadError.value = getApiErrorMessage(e) || 'Не удалось загрузить ссылки'
  } finally {
    loading.value = false
  }
}

async function saveTenantSocialLinks() {
  if (!token.value || hasErrors.value) return
  saving.value = true
  try {
    await authFetch(apiUrl('/users/me/tenant-social-links'), {
      method: 'PATCH',
      body: {
        websiteUrl: withHttpProtocol(socialLinks.value.websiteUrl) || null,
        showWebsiteLink: socialLinks.value.showWebsiteLink,
        socialYoutubeUrl: withHttpProtocol(socialLinks.value.socialYoutubeUrl) || null,
        showSocialYoutubeLink: socialLinks.value.showSocialYoutubeLink,
        socialTelegramUrl: withHttpProtocol(socialLinks.value.socialTelegramUrl) || null,
        showSocialTelegramLink: socialLinks.value.showSocialTelegramLink,
        socialInstagramUrl: withHttpProtocol(socialLinks.value.socialInstagramUrl) || null,
        showSocialInstagramLink: socialLinks.value.showSocialInstagramLink,
        socialMaxUrl: withHttpProtocol(socialLinks.value.socialMaxUrl) || null,
        showSocialMaxLink: socialLinks.value.showSocialMaxLink,
      },
    })
    socialLinks.value.websiteUrl = withHttpProtocol(socialLinks.value.websiteUrl)
    socialLinks.value.socialYoutubeUrl = withHttpProtocol(socialLinks.value.socialYoutubeUrl)
    socialLinks.value.socialTelegramUrl = withHttpProtocol(socialLinks.value.socialTelegramUrl)
    socialLinks.value.socialInstagramUrl = withHttpProtocol(socialLinks.value.socialInstagramUrl)
    socialLinks.value.socialMaxUrl = withHttpProtocol(socialLinks.value.socialMaxUrl)
    toast.add({ severity: 'success', summary: 'Ссылки сохранены', life: 3000 })
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось сохранить ссылки',
      detail: getApiErrorMessage(e),
      life: 5000,
    })
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  void loadTenantSocialLinks()
})
</script>

<template>
  <section class="admin-page mx-auto max-w-3xl space-y-4 sm:space-y-6">
    <div class="min-w-0">
      <h1 class="text-lg font-semibold text-surface-900 dark:text-surface-0 sm:text-2xl">Соцсети</h1>
      <p class="mt-1 text-xs text-muted-color sm:text-sm">
        Для каждой ссылки можно отдельно включить/выключить показ на публичных страницах.
      </p>
    </div>

    <Card class="!shadow-none border border-surface-200 dark:border-surface-700">
      <template #content>
        <AdminDataState
          :loading="loading"
          :error="loadError"
          :empty="false"
          :content-card="false"
          @retry="loadTenantSocialLinks"
        >
          <template #loading>
            <div class="space-y-3">
              <Skeleton v-for="i in 4" :key="`social-sk-${i}`" height="2.5rem" width="100%" />
            </div>
          </template>
        <div class="space-y-4">
          <div>
            <div class="mb-1 flex items-center justify-between gap-3">
              <label class="block text-sm">Сайт</label>
              <label class="flex items-center gap-2 text-xs text-muted-color">
                <span>Показывать</span>
                <ToggleSwitch v-model="socialLinks.showWebsiteLink" />
              </label>
            </div>
            <InputText
              v-model="socialLinks.websiteUrl"
              class="w-full"
              :invalid="!!socialErrors.websiteUrl"
              placeholder="https://example.com"
            />
            <p class="mt-1 text-xs text-muted-color">Можно без https:// — добавим автоматически.</p>
            <p v-if="socialErrors.websiteUrl" class="mt-1 text-xs text-red-500">{{ socialErrors.websiteUrl }}</p>
          </div>
          <div>
            <div class="mb-1 flex items-center justify-between gap-3">
              <label class="block text-sm">YouTube</label>
              <label class="flex items-center gap-2 text-xs text-muted-color">
                <span>Показывать</span>
                <ToggleSwitch v-model="socialLinks.showSocialYoutubeLink" />
              </label>
            </div>
            <InputText
              v-model="socialLinks.socialYoutubeUrl"
              class="w-full"
              :invalid="!!socialErrors.socialYoutubeUrl"
              placeholder="youtube.com/@channel"
            />
            <p class="mt-1 text-xs text-muted-color">Можно без https:// — добавим автоматически.</p>
            <p v-if="socialErrors.socialYoutubeUrl" class="mt-1 text-xs text-red-500">{{ socialErrors.socialYoutubeUrl }}</p>
          </div>
          <div>
            <div class="mb-1 flex items-center justify-between gap-3">
              <label class="block text-sm">Telegram</label>
              <label class="flex items-center gap-2 text-xs text-muted-color">
                <span>Показывать</span>
                <ToggleSwitch v-model="socialLinks.showSocialTelegramLink" />
              </label>
            </div>
            <InputText
              v-model="socialLinks.socialTelegramUrl"
              class="w-full"
              :invalid="!!socialErrors.socialTelegramUrl"
              placeholder="t.me/..."
            />
            <p class="mt-1 text-xs text-muted-color">Можно без https:// — добавим автоматически.</p>
            <p v-if="socialErrors.socialTelegramUrl" class="mt-1 text-xs text-red-500">{{ socialErrors.socialTelegramUrl }}</p>
          </div>
          <div>
            <div class="mb-1 flex items-center justify-between gap-3">
              <label class="block text-sm">Instagram</label>
              <label class="flex items-center gap-2 text-xs text-muted-color">
                <span>Показывать</span>
                <ToggleSwitch v-model="socialLinks.showSocialInstagramLink" />
              </label>
            </div>
            <InputText
              v-model="socialLinks.socialInstagramUrl"
              class="w-full"
              :invalid="!!socialErrors.socialInstagramUrl"
              placeholder="instagram.com/..."
            />
            <p class="mt-1 text-xs text-muted-color">Можно без https:// — добавим автоматически.</p>
            <p v-if="socialErrors.socialInstagramUrl" class="mt-1 text-xs text-red-500">{{ socialErrors.socialInstagramUrl }}</p>
          </div>
          <div>
            <div class="mb-1 flex items-center justify-between gap-3">
              <label class="block text-sm">MAX</label>
              <label class="flex items-center gap-2 text-xs text-muted-color">
                <span>Показывать</span>
                <ToggleSwitch v-model="socialLinks.showSocialMaxLink" />
              </label>
            </div>
            <InputText
              v-model="socialLinks.socialMaxUrl"
              class="w-full"
              :invalid="!!socialErrors.socialMaxUrl"
              placeholder="max.ru/..."
            />
            <p class="mt-1 text-xs text-muted-color">Можно без https:// — добавим автоматически.</p>
            <p v-if="socialErrors.socialMaxUrl" class="mt-1 text-xs text-red-500">{{ socialErrors.socialMaxUrl }}</p>
          </div>
          <div class="admin-toolbar-responsive flex justify-end">
            <Button
              label="Сохранить"
              icon="pi pi-save"
              :loading="saving"
              :disabled="saving || hasErrors"
              @click="saveTenantSocialLinks"
            />
          </div>
        </div>
        </AdminDataState>
      </template>
    </Card>
  </section>
</template>
