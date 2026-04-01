<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import Card from 'primevue/card'
import Message from 'primevue/message'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import Skeleton from 'primevue/skeleton'
import {
  adminAccentOptions,
  type AdminAccentId,
  type AdminLocaleCode,
  type AdminThemeMode,
} from '~/constants/adminSettings'
import { syncThemeAndAccentFromStore } from '~/composables/useAdminAppearance'
import { useAdminSettingsStore } from '~/stores/adminSettings'

definePageMeta({
  layout: 'admin',
})

const { t } = useI18n()
const toast = useToast()
const store = useAdminSettingsStore()
const saving = ref(false)

const themeOptions = computed(() => [
  { label: t('admin.settings.theme.light'), value: 'light' as const },
  { label: t('admin.settings.theme.dark'), value: 'dark' as const },
  { label: t('admin.settings.theme.system'), value: 'system' as const },
])

const localeOptions = computed(() => [
  { label: t('admin.settings.language.ru'), value: 'ru' as const },
  { label: t('admin.settings.language.en'), value: 'en' as const },
])

const themeModel = computed({
  get: () => store.themeMode,
  set: (v: AdminThemeMode) => {
    store.setThemeMode(v)
    void nextTick(() => syncThemeAndAccentFromStore())
  },
})

const localeModel = computed({
  get: () => store.locale,
  set: (v: AdminLocaleCode) => {
    store.setLocale(v)
  },
})

function pickAccent(id: AdminAccentId) {
  store.setAccent(id)
  void nextTick(() => syncThemeAndAccentFromStore())
}

async function saveToServer() {
  saving.value = true
  try {
    await store.syncToServer()
    toast.add({
      severity: 'success',
      summary: t('admin.settings.saved'),
      life: 3000,
    })
  } catch {
    toast.add({
      severity: 'error',
      summary: t('admin.settings.save_error'),
      life: 5000,
    })
  } finally {
    saving.value = false
  }
}

</script>

<template>
  <section class="p-6 space-y-6 max-w-3xl">
    <div>
      <h1 class="text-2xl font-semibold text-surface-900 dark:text-surface-0">
        {{ t('admin.settings.title') }}
      </h1>
      <p class="mt-1 text-sm text-muted-color">
        {{ t('admin.settings.intro') }}
      </p>
    </div>

    <div
      v-if="!store.uiSettingsReady"
      class="space-y-6"
      role="status"
      :aria-label="t('admin.settings.loading')"
    >
      <div
        v-for="i in 4"
        :key="i"
        class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 p-6 space-y-4"
      >
        <Skeleton height="1.25rem" width="28%" class="rounded-md" />
        <Skeleton height="0.875rem" width="85%" class="rounded-md" />
        <Skeleton height="2.75rem" width="100%" class="rounded-lg" />
      </div>
      <div
        class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 p-6"
      >
        <Skeleton height="3.5rem" width="100%" class="rounded-lg" />
      </div>
    </div>

    <template v-else>
    <Card class="!shadow-none border border-surface-200 dark:border-surface-700">
      <template #title>
        <span class="text-base font-semibold">{{ t('admin.settings.theme.title') }}</span>
      </template>
      <template #content>
        <p class="text-sm text-muted-color mb-4">
          {{ t('admin.settings.theme.hint') }}
        </p>
        <SelectButton
          v-model="themeModel"
          :options="themeOptions"
          option-label="label"
          option-value="value"
        />
      </template>
    </Card>

    <Card class="!shadow-none border border-surface-200 dark:border-surface-700">
      <template #title>
        <span class="text-base font-semibold">{{ t('admin.settings.language.title') }}</span>
      </template>
      <template #content>
        <p class="text-sm text-muted-color mb-4">
          {{ t('admin.settings.language.hint') }}
        </p>
        <Select
          v-model="localeModel"
          :options="localeOptions"
          option-label="label"
          option-value="value"
          class="w-full max-w-xs"
        />
      </template>
    </Card>

    <Card class="!shadow-none border border-surface-200 dark:border-surface-700">
      <template #title>
        <span class="text-base font-semibold">{{ t('admin.settings.accent.title') }}</span>
      </template>
      <template #content>
        <p class="text-sm text-muted-color mb-4">{{ t('admin.settings.accent.hint') }}</p>
        <div class="flex flex-wrap gap-3">
          <button
            v-for="a in adminAccentOptions"
            :key="a.id"
            type="button"
            class="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors"
            :class="
              store.accent === a.id
                ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
                : 'border-surface-200 dark:border-surface-600 hover:bg-surface-50 dark:hover:bg-surface-800'
            "
            @click="pickAccent(a.id)"
          >
            <span
              class="h-6 w-6 rounded-full border border-surface-200 dark:border-surface-600 shadow-sm"
              :style="{ backgroundColor: a.sample }"
              aria-hidden="true"
            />
            {{ t(`admin.accent.${a.id}`) }}
          </button>
        </div>
      </template>
    </Card>

    <Card class="!shadow-none border border-surface-200 dark:border-surface-700">
      <template #content>
        <div
          class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <p class="text-sm text-muted-color max-w-xl">
            {{ t('admin.settings.save_hint') }}
          </p>
          <Button
            :label="t('admin.settings.save')"
            icon="pi pi-save"
            :loading="saving"
            class="shrink-0"
            @click="saveToServer"
          />
        </div>
      </template>
    </Card>

    <Message severity="info" :closable="false" class="w-full">
      <div class="text-sm space-y-2">
        <p class="font-medium">{{ t('admin.settings.future.title') }}</p>
        <ul class="list-disc pl-4 space-y-1 text-muted-color">
          <li>{{ t('admin.settings.future.density') }}</li>
        </ul>
      </div>
    </Message>
    </template>
  </section>
</template>
