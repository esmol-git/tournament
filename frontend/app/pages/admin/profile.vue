<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import useVuelidate from '@vuelidate/core'
import { helpers, minLength, required } from '@vuelidate/validators'
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { userRoleLabelRu } from '~/constants/userRoles'
import type { UserRow } from '~/types/admin/user'
import { getApiErrorMessage } from '~/utils/apiError'

definePageMeta({
  layout: 'admin',
})

const { t } = useI18n()
const toast = useToast()
const router = useRouter()
const { token, loggedIn, syncWithStorage, authFetch, fetchMe } = useAuth()
const { apiUrl } = useApiUrl()

const loading = ref(true)
const saving = ref(false)

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
    form.email = u.email
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
})
</script>

<template>
  <section class="p-6 space-y-6 max-w-xl">
    <div>
      <h1 class="text-2xl font-semibold text-surface-900 dark:text-surface-0">
        {{ t('admin.profile.title') }}
      </h1>
      <p class="mt-1 text-sm text-muted-color">
        {{ t('admin.profile.intro') }}
      </p>
    </div>

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
