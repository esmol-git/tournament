<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import useVuelidate from '@vuelidate/core'
import { helpers, minLength, required } from '@vuelidate/validators'
import Card from 'primevue/card'
import Message from 'primevue/message'
import Select from 'primevue/select'
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { userRoleLabelRu } from '~/constants/userRoles'
import type { UserRow } from '~/types/admin/user'
import { getApiErrorMessage } from '~/utils/apiError'
import { formatSubscriptionPlanLabel } from '~/utils/subscriptionPlanLabels'
import { SUBSCRIPTION_PLANS } from '~/utils/subscriptionFeatures'
import { useSubscriptionFeatureMatrix } from '~/composables/useSubscriptionFeatures'

definePageMeta({
  layout: 'admin',
})

const { t } = useI18n()
const toast = useToast()
const router = useRouter()
const { token, loggedIn, syncWithStorage, authFetch, fetchMe, user } = useAuth()
const { apiUrl } = useApiUrl()

const loading = ref(true)
const saving = ref(false)

const subscriptionPlanDraft = ref<string>('FREE')
const subscriptionSaving = ref(false)
const subscriptionLoadError = ref('')

const canManageSubscription = computed(() => {
  const r = String((user.value as { role?: string } | null)?.role ?? '')
  return r === 'TENANT_ADMIN' || r === 'SUPER_ADMIN'
})

const subscriptionPlanOptions = computed(() =>
  SUBSCRIPTION_PLANS.map((p) => ({
    label: formatSubscriptionPlanLabel(p),
    value: p,
  })),
)

const { featureMatrix } = useSubscriptionFeatureMatrix(subscriptionPlanDraft)

function syncSubscriptionDraftFromUser() {
  const p = (user.value as { tenantSubscription?: { plan?: string | null } | null } | null)
    ?.tenantSubscription?.plan
  subscriptionPlanDraft.value = typeof p === 'string' && p ? p : 'FREE'
}

async function loadSubscriptionContext() {
  subscriptionLoadError.value = ''
  if (!token.value || !canManageSubscription.value) {
    syncSubscriptionDraftFromUser()
    return
  }
  try {
    await fetchMe()
    syncSubscriptionDraftFromUser()
  } catch (e: unknown) {
    subscriptionLoadError.value = getApiErrorMessage(e)
  }
}

async function saveSubscriptionPlan() {
  if (!token.value || !canManageSubscription.value) return
  subscriptionSaving.value = true
  try {
    await authFetch(apiUrl('/users/me/tenant-subscription-plan'), {
      method: 'PATCH',
      body: { subscriptionPlan: subscriptionPlanDraft.value },
    })
    await fetchMe()
    syncSubscriptionDraftFromUser()
    toast.add({
      severity: 'success',
      summary: t('admin.settings.subscription.saved'),
      life: 3000,
    })
  } catch (e: unknown) {
    const status = Number(
      (e as { statusCode?: number; status?: number })?.statusCode ??
        (e as { status?: number })?.status ??
        0,
    )
    if (status === 403) {
      toast.add({
        severity: 'warn',
        summary: t('admin.settings.subscription.forbidden'),
        life: 5000,
      })
      return
    }
    toast.add({
      severity: 'error',
      summary: t('admin.settings.subscription.save_error'),
      detail: getApiErrorMessage(e),
      life: 5000,
    })
  } finally {
    subscriptionSaving.value = false
  }
}

watch(
  () => (user.value as { tenantSubscription?: { plan?: string } } | null)?.tenantSubscription?.plan,
  () => syncSubscriptionDraftFromUser(),
)

const form = reactive({
  username: '',
  email: '',
  name: '',
  lastName: '',
  currentPassword: '',
  password: '',
  role: '',
})
const submitAttempted = ref(false)
const rules = computed(() => ({
  username: { required, minLength: minLength(3) },
  name: { required, minLength: minLength(3) },
  password: {
    minLengthWhenFilled: helpers.withMessage(
      'password min',
      (v: unknown) => !String(v ?? '') || String(v ?? '').trim().length >= 6,
    ),
  },
  currentPassword: {
    requiredWhenPassword: helpers.withMessage(
      'current password required',
      (v: unknown) => !form.password.trim() || String(v ?? '').trim().length > 0,
    ),
  },
}))
const v$ = useVuelidate(rules, form, { $autoDirty: true })
const formErrors = computed(() => ({
  username: form.username.trim().length >= 3 ? '' : t('admin.validation.min_chars', { min: 3 }),
  name: form.name.trim().length >= 3 ? '' : t('admin.validation.min_chars', { min: 3 }),
  currentPassword:
    !form.password.trim() || form.currentPassword.trim()
      ? ''
      : t('admin.profile.current_password_required'),
  password:
    !form.password.trim() || form.password.trim().length >= 6
      ? ''
      : t('admin.validation.min_chars', { min: 6 }),
}))
const canSave = computed(
  () =>
    !v$.value.$invalid &&
    !formErrors.value.username &&
    !formErrors.value.name &&
    !formErrors.value.currentPassword &&
    !formErrors.value.password,
)
const showUsernameError = computed(
  () => (submitAttempted.value || v$.value.username.$dirty) && !!formErrors.value.username,
)
const showNameError = computed(
  () => (submitAttempted.value || v$.value.name.$dirty) && !!formErrors.value.name,
)
const showCurrentPasswordError = computed(
  () =>
    (submitAttempted.value || v$.value.currentPassword.$dirty) &&
    !!formErrors.value.currentPassword,
)
const showPasswordError = computed(
  () => (submitAttempted.value || v$.value.password.$dirty) && !!formErrors.value.password,
)

async function loadProfile() {
  if (!token.value) return
  loading.value = true
  try {
    const u = await authFetch<UserRow>(apiUrl('/users/me'))
    form.username = u.username
    form.email = u.email ?? ''
    form.name = u.name
    form.lastName = (u.lastName ?? '').trim()
    form.role = u.role
    form.currentPassword = ''
    form.password = ''
    submitAttempted.value = false
    v$.value.$reset()
  } catch {
    toast.add({
      severity: 'error',
      summary: t('admin.profile.load_error'),
      life: 5000,
    })
  } finally {
    loading.value = false
  }
}

async function save() {
  if (!token.value) return
  submitAttempted.value = true
  v$.value.$touch()
  if (!canSave.value) {
    return
  }
  const newPw = form.password.trim()
  saving.value = true
  try {
    const body: Record<string, string> = {
      username: form.username.trim(),
      name: form.name.trim(),
      lastName: form.lastName.trim(),
    }
    if (newPw) {
      body.password = newPw
      body.currentPassword = form.currentPassword.trim()
    }
    await authFetch(apiUrl('/users/me'), {
      method: 'PATCH',
      body,
    })
    form.currentPassword = ''
    form.password = ''
    await fetchMe()
    toast.add({
      severity: 'success',
      summary: t('admin.profile.saved'),
      life: 3000,
    })
  } catch (e: unknown) {
    const msg = getApiErrorMessage(e, t('admin.profile.save_error'))
    const wrongPw =
      /неверн/i.test(msg) || /incorrect|wrong.*password/i.test(msg.toLowerCase())
    toast.add({
      severity: 'error',
      summary: wrongPw ? t('admin.profile.wrong_password') : t('admin.profile.save_error'),
      detail: wrongPw ? undefined : msg !== t('admin.profile.save_error') ? msg : undefined,
      life: 6000,
    })
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  if (process.client) {
    syncWithStorage()
    if (!loggedIn.value) {
      router.push('/admin/login')
      return
    }
  }
  void loadProfile()
  void loadSubscriptionContext()
})
</script>

<template>
  <section class="p-6 space-y-6 max-w-3xl">
    <div>
      <h1 class="text-2xl font-semibold text-surface-900 dark:text-surface-0">
        {{ t('admin.profile.title') }}
      </h1>
      <p class="mt-1 text-sm text-muted-color">
        {{ t('admin.profile.intro') }}
      </p>
    </div>

    <Card
      v-if="canManageSubscription"
      class="!shadow-none border border-surface-200 dark:border-surface-700"
    >
      <template #title>
        <span class="text-base font-semibold">{{ t('admin.settings.subscription.title') }}</span>
      </template>
      <template #content>
        <p class="text-sm text-muted-color mb-4">
          {{ t('admin.settings.subscription.hint') }}
        </p>
        <Message v-if="subscriptionLoadError" severity="error" :closable="false" class="mb-4 w-full">
          {{ subscriptionLoadError }}
        </Message>
        <div class="flex flex-col gap-4 sm:flex-row sm:items-end">
          <div class="flex-1 min-w-0">
            <label class="mb-1 block text-sm font-medium text-surface-700 dark:text-surface-200">
              {{ t('admin.settings.subscription.select_label') }}
            </label>
            <Select
              v-model="subscriptionPlanDraft"
              :options="subscriptionPlanOptions"
              option-label="label"
              option-value="value"
              class="w-full max-w-md"
            />
          </div>
          <Button
            type="button"
            :label="t('admin.settings.subscription.save')"
            icon="pi pi-bolt"
            :loading="subscriptionSaving"
            class="shrink-0"
            @click="saveSubscriptionPlan"
          />
        </div>
        <div class="mt-6 border-t border-surface-200 pt-4 dark:border-surface-700">
          <p class="text-sm font-medium text-surface-900 dark:text-surface-0 mb-3">
            {{ t('admin.settings.subscription.features_title') }}
          </p>
          <ul class="space-y-2 text-sm">
            <li
              v-for="row in featureMatrix"
              :key="row.key"
              class="flex items-start gap-2"
            >
              <i
                class="pi mt-0.5 text-xs"
                :class="row.enabled ? 'pi-check-circle text-green-600' : 'pi-times-circle text-surface-400'"
                aria-hidden="true"
              />
              <span :class="row.enabled ? 'text-surface-800 dark:text-surface-100' : 'text-muted-color'">
                {{ t(`admin.settings.subscription.features.${row.key}`) }}
              </span>
            </li>
          </ul>
        </div>
      </template>
    </Card>

    <div
      v-if="loading"
      class="rounded-xl border border-surface-200 bg-surface-0 p-6 dark:border-surface-700 dark:bg-surface-900"
      role="status"
      :aria-label="t('admin.profile.loading')"
    >
      <div class="flex items-center gap-3 text-muted-color">
        <i class="pi pi-spin pi-spinner text-xl" aria-hidden="true" />
        <span>{{ t('admin.profile.loading') }}</span>
      </div>
    </div>

    <div
      v-else
      class="rounded-xl border border-surface-200 bg-surface-0 p-6 shadow-sm dark:border-surface-700 dark:bg-surface-900 space-y-4"
    >
      <div>
        <label class="text-sm block mb-1 text-surface-700 dark:text-surface-200">Email</label>
        <InputText :model-value="form.email" class="w-full" disabled />
        <p class="mt-1 text-xs text-muted-color">
          {{ t('admin.profile.email_readonly') }}
        </p>
      </div>

      <div>
        <label class="text-sm block mb-1 text-surface-700 dark:text-surface-200">
          {{ t('admin.profile.role') }}
        </label>
        <InputText
          :model-value="userRoleLabelRu(form.role)"
          class="w-full"
          disabled
        />
        <p class="mt-1 text-xs text-muted-color">
          {{ t('admin.profile.role_readonly') }}
        </p>
      </div>

      <div>
        <label class="text-sm block mb-1 text-surface-700 dark:text-surface-200">
          {{ t('admin.profile.username') }}
        </label>
        <InputText v-model="form.username" class="w-full" autocomplete="username" />
        <p v-if="showUsernameError" class="mt-0 text-[11px] leading-3 text-red-500">{{ formErrors.username }}</p>
      </div>

      <div>
        <label class="text-sm block mb-1 text-surface-700 dark:text-surface-200">
          {{ t('admin.profile.name') }}
        </label>
        <InputText v-model="form.name" class="w-full" autocomplete="given-name" />
        <p v-if="showNameError" class="mt-0 text-[11px] leading-3 text-red-500">{{ formErrors.name }}</p>
      </div>

      <div>
        <label class="text-sm block mb-1 text-surface-700 dark:text-surface-200">
          {{ t('admin.profile.last_name') }}
        </label>
        <InputText v-model="form.lastName" class="w-full" autocomplete="family-name" />
      </div>

      <div>
        <label class="text-sm block mb-1 text-surface-700 dark:text-surface-200">
          {{ t('admin.profile.current_password') }}
        </label>
        <Password
          v-model="form.currentPassword"
          :invalid="showCurrentPasswordError"
          class="block w-full"
          input-class="w-full"
          toggle-mask
          :feedback="false"
          :placeholder="t('admin.profile.current_password_placeholder')"
          autocomplete="current-password"
        />
        <p class="mt-1 text-xs text-muted-color">
          {{ t('admin.profile.current_password_hint') }}
        </p>
        <p v-if="showCurrentPasswordError" class="mt-0 text-[11px] leading-3 text-red-500">{{ formErrors.currentPassword }}</p>
      </div>

      <div>
        <label class="text-sm block mb-1 text-surface-700 dark:text-surface-200">
          {{ t('admin.profile.new_password') }}
        </label>
        <Password
          v-model="form.password"
          :invalid="showPasswordError"
          class="block w-full"
          input-class="w-full"
          toggle-mask
          :feedback="false"
          :placeholder="t('admin.profile.password_placeholder')"
          autocomplete="new-password"
        />
        <p v-if="showPasswordError" class="mt-0 text-[11px] leading-3 text-red-500">{{ formErrors.password }}</p>
      </div>

      <div class="flex justify-end pt-2">
        <Button
          :label="t('admin.profile.save')"
          icon="pi pi-check"
          :loading="saving"
          :disabled="saving || (submitAttempted && !canSave)"
          @click="save"
        />
      </div>
    </div>
  </section>
</template>
