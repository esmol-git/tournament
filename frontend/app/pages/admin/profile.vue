<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import useVuelidate from '@vuelidate/core'
import { helpers, minLength, required } from '@vuelidate/validators'
import Card from 'primevue/card'
import Select from 'primevue/select'
import InputSwitch from 'primevue/inputswitch'
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { userRoleLabelRu } from '~/constants/userRoles'
import type { UserRow } from '~/types/admin/user'
import { getApiErrorMessage } from '~/utils/apiError'
import AdminDataState from '~/app/components/admin/AdminDataState.vue'
import { formatSubscriptionPlanLabel } from '~/utils/subscriptionPlanLabels'
import { SUBSCRIPTION_PLANS } from '~/utils/subscriptionFeatures'
import { useSubscriptionFeatureMatrix } from '~/composables/useSubscriptionFeatures'
import { readTenantStaffRole } from '~/utils/tenantStaffRole'

definePageMeta({
  layout: 'admin',
  adminOrgModeratorReadOnly: false,
})

const { t } = useI18n()
const toast = useToast()
const router = useRouter()
const { token, loggedIn, syncWithStorage, authFetch, fetchMe, user } = useAuth()
const { apiUrl } = useApiUrl()

const loading = ref(true)
const profileLoadError = ref<string | null>(null)
const saving = ref(false)

/** В БД уже сохранён email — смена запрещена (как на бэкенде). */
const emailLocked = ref(false)

/** Логин в профиле меняют только админ тенанта и супер-админ; остальные — через раздел «Пользователи». */
const usernameLocked = computed(() => {
  const r = String(form.role || '').trim().toUpperCase()
  return r !== 'TENANT_ADMIN' && r !== 'SUPER_ADMIN'
})

/** Смена пароля в профиле — только у админа организации и суперадмина; остальным пароль задаёт админ. */
const passwordLocked = computed(() => {
  const r = String(form.role || '').trim().toUpperCase()
  return r !== 'TENANT_ADMIN' && r !== 'SUPER_ADMIN'
})

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const subscriptionPlanDraft = ref<string>('FREE')
const subscriptionSaving = ref(false)
const subscriptionLoading = ref(false)
const subscriptionLoadError = ref<string | null>(null)

const canManageSubscription = computed(() => {
  const r = readTenantStaffRole(user.value)
  return r === 'TENANT_ADMIN' || r === 'SUPER_ADMIN'
})

const subscriptionPlanOptions = computed(() =>
  SUBSCRIPTION_PLANS.map((p) => ({
    label: formatSubscriptionPlanLabel(p),
    value: p,
  })),
)

const { featureMatrix } = useSubscriptionFeatureMatrix(subscriptionPlanDraft)

const allowUserDeletionDraft = ref(false)
const allowUserDeletionSaving = ref(false)

function syncSubscriptionDraftFromUser() {
  const p = (user.value as { tenantSubscription?: { plan?: string | null } | null } | null)
    ?.tenantSubscription?.plan
  subscriptionPlanDraft.value = typeof p === 'string' && p ? p : 'FREE'
}

function syncAllowDeletionFromUser() {
  const v = (user.value as { tenantSubscription?: { allowUserDeletion?: boolean } | null } | null)
    ?.tenantSubscription?.allowUserDeletion
  allowUserDeletionDraft.value = v === true
}

async function onAllowUserDeletionChange(next: boolean) {
  if (!token.value || !canManageSubscription.value) return
  const prev = allowUserDeletionDraft.value
  allowUserDeletionSaving.value = true
  allowUserDeletionDraft.value = next
  try {
    await authFetch(apiUrl('/users/me/tenant-allow-user-deletion'), {
      method: 'PATCH',
      body: { allowUserDeletion: next },
    })
    await fetchMe()
    syncAllowDeletionFromUser()
    toast.add({
      severity: 'success',
      summary: t('admin.profile.user_deletion_saved'),
      life: 3000,
    })
  } catch (e: unknown) {
    allowUserDeletionDraft.value = prev
    toast.add({
      severity: 'error',
      summary: getApiErrorMessage(e, t('admin.profile.save_error')),
      life: 5000,
    })
  } finally {
    allowUserDeletionSaving.value = false
  }
}

watch(
  () => user.value,
  () => {
    syncAllowDeletionFromUser()
  },
  { deep: true },
)

async function loadSubscriptionContext() {
  subscriptionLoadError.value = null
  if (!token.value || !canManageSubscription.value) {
    syncSubscriptionDraftFromUser()
    syncAllowDeletionFromUser()
    return
  }
  subscriptionLoading.value = true
  try {
    await fetchMe()
    syncSubscriptionDraftFromUser()
    syncAllowDeletionFromUser()
  } catch (e: unknown) {
    subscriptionLoadError.value =
      getApiErrorMessage(e) || t('admin.settings.subscription.load_error_title')
  } finally {
    subscriptionLoading.value = false
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
    syncAllowDeletionFromUser()
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
  username: usernameLocked.value
    ? {}
    : { required, minLength: minLength(3) },
  name: { required, minLength: minLength(3) },
  password: passwordLocked.value
    ? {}
    : {
        minLengthWhenFilled: helpers.withMessage(
          'password min',
          (v: unknown) => !String(v ?? '') || String(v ?? '').trim().length >= 6,
        ),
      },
  currentPassword: passwordLocked.value
    ? {}
    : {
        requiredWhenPassword: helpers.withMessage(
          'current password required',
          (v: unknown) => !form.password.trim() || String(v ?? '').trim().length > 0,
        ),
      },
}))
const v$ = useVuelidate(rules, form, { $autoDirty: true })
const formErrors = computed(() => ({
  username:
    usernameLocked.value || form.username.trim().length >= 3
      ? ''
      : t('admin.validation.min_chars', { min: 3 }),
  name: form.name.trim().length >= 3 ? '' : t('admin.validation.min_chars', { min: 3 }),
  email:
    emailLocked.value || !form.email.trim()
      ? ''
      : EMAIL_RE.test(form.email.trim())
        ? ''
        : t('admin.validation.invalid_email'),
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
    !formErrors.value.email &&
    !formErrors.value.currentPassword &&
    !formErrors.value.password,
)
const showUsernameError = computed(
  () =>
    !usernameLocked.value &&
    (submitAttempted.value || v$.value.username.$dirty) &&
    !!formErrors.value.username,
)
const showNameError = computed(
  () => (submitAttempted.value || v$.value.name.$dirty) && !!formErrors.value.name,
)
const showCurrentPasswordError = computed(
  () =>
    !passwordLocked.value &&
    (submitAttempted.value || v$.value.currentPassword.$dirty) &&
    !!formErrors.value.currentPassword,
)
const showPasswordError = computed(
  () =>
    !passwordLocked.value &&
    (submitAttempted.value || v$.value.password.$dirty) &&
    !!formErrors.value.password,
)
const showEmailError = computed(
  () => !emailLocked.value && (submitAttempted.value || !!form.email.trim()) && !!formErrors.value.email,
)

async function loadProfile(opts?: { quiet?: boolean }) {
  if (!token.value) return
  if (!opts?.quiet) {
    loading.value = true
    profileLoadError.value = null
  }
  try {
    const u = await authFetch<UserRow>(apiUrl('/users/me'))
    form.username = u.username
    form.email = u.email ?? ''
    emailLocked.value = !!(u.email && String(u.email).trim())
    form.name = u.name
    form.lastName = (u.lastName ?? '').trim()
    form.role = u.role
    form.currentPassword = ''
    form.password = ''
    submitAttempted.value = false
    syncAllowDeletionFromUser()
    v$.value.$reset()
  } catch (e: unknown) {
    if (!opts?.quiet) {
      profileLoadError.value = getApiErrorMessage(e, t('admin.profile.load_error'))
    }
  } finally {
    if (!opts?.quiet) {
      loading.value = false
    }
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
      name: form.name.trim(),
      lastName: form.lastName.trim(),
    }
    if (!usernameLocked.value) {
      body.username = form.username.trim()
    }
    if (!emailLocked.value) {
      const em = form.email.trim()
      if (em) {
        body.email = em
      }
    }
    if (!passwordLocked.value && newPw) {
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
    await loadProfile({ quiet: true })
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
  <section class="admin-page mx-auto max-w-3xl space-y-4 sm:space-y-6">
    <div class="min-w-0">
      <h1 class="text-lg font-semibold text-surface-900 dark:text-surface-0 sm:text-2xl">
        {{ t('admin.profile.title') }}
      </h1>
      <p class="mt-1 text-xs text-muted-color sm:text-sm">
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
        <AdminDataState
          :loading="subscriptionLoading"
          :error="subscriptionLoadError"
          :empty="false"
          :content-card="false"
          :error-title="t('admin.settings.subscription.load_error_title')"
          @retry="loadSubscriptionContext"
        >
          <template #loading>
            <div class="mb-4 space-y-3">
              <Skeleton height="2.5rem" class="max-w-md rounded-lg" />
              <Skeleton height="5rem" class="rounded-lg" />
              <Skeleton height="8rem" class="rounded-lg" />
            </div>
          </template>
        <div class="admin-toolbar-responsive flex flex-col gap-4 sm:flex-row sm:items-end">
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
        <div
          class="mt-6 border-t border-surface-200 pt-4 dark:border-surface-700"
        >
          <p class="mb-1 text-sm font-medium text-surface-900 dark:text-surface-0">
            {{ t('admin.profile.user_deletion_policy_title') }}
          </p>
          <p class="mb-3 text-sm text-muted-color">
            {{ t('admin.profile.user_deletion_policy_hint') }}
          </p>
          <div class="flex flex-wrap items-center gap-3">
            <InputSwitch
              :model-value="allowUserDeletionDraft"
              :disabled="allowUserDeletionSaving"
              :aria-label="t('admin.profile.user_deletion_policy_title')"
              @update:model-value="onAllowUserDeletionChange"
            />
            <span class="text-sm text-surface-800 dark:text-surface-100">
              {{
                allowUserDeletionDraft
                  ? t('admin.profile.user_deletion_on')
                  : t('admin.profile.user_deletion_off')
              }}
            </span>
          </div>
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
        </AdminDataState>
      </template>
    </Card>

    <AdminDataState
      :loading="loading"
      :error="profileLoadError"
      :empty="false"
      :content-card="false"
      :error-title="t('admin.profile.load_error')"
      @retry="loadProfile"
    >
      <template #loading>
        <div
          class="rounded-xl border border-surface-200 bg-surface-0 p-6 dark:border-surface-700 dark:bg-surface-900"
          role="status"
          :aria-label="t('admin.profile.loading')"
        >
          <div class="flex items-center gap-3 text-muted-color">
            <i class="pi pi-spin pi-spinner text-xl" aria-hidden="true" />
            <span>{{ t('admin.profile.loading') }}</span>
          </div>
        </div>
      </template>
    <div
      class="rounded-xl border border-surface-200 bg-surface-0 p-6 shadow-sm dark:border-surface-700 dark:bg-surface-900 space-y-4"
    >
      <div>
        <label class="text-sm block mb-1 text-surface-700 dark:text-surface-200">Email</label>
        <InputText
          v-model="form.email"
          class="w-full"
          type="email"
          autocomplete="email"
          :disabled="emailLocked"
          :invalid="showEmailError"
        />
        <p class="mt-1 text-xs text-muted-color">
          {{
            emailLocked
              ? t('admin.profile.email_readonly')
              : t('admin.profile.email_optional_hint')
          }}
        </p>
        <p v-if="showEmailError" class="mt-0 text-[11px] leading-3 text-red-500">{{ formErrors.email }}</p>
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
        <InputText
          v-model="form.username"
          class="w-full"
          autocomplete="username"
          :disabled="usernameLocked"
        />
        <p class="mt-1 text-xs text-muted-color">
          {{
            usernameLocked
              ? t('admin.profile.username_readonly')
              : t('admin.profile.username_editable_hint')
          }}
        </p>
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

      <template v-if="passwordLocked">
        <p class="text-sm text-muted-color -mt-1">
          {{ t('admin.profile.password_readonly') }}
        </p>
      </template>
      <template v-else>
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
      </template>

      <div class="admin-toolbar-responsive flex justify-end pt-2">
        <Button
          :label="t('admin.profile.save')"
          icon="pi pi-check"
          :loading="saving"
          :disabled="saving || (submitAttempted && !canSave)"
          @click="save"
        />
      </div>
    </div>
    </AdminDataState>
  </section>
</template>
