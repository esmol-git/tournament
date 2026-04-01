<script setup lang="ts">
import { computed, ref } from 'vue'
import useVuelidate from '@vuelidate/core'
import { minLength, required } from '@vuelidate/validators'
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { getApiErrorMessage } from '~/utils/apiError'

definePageMeta({
  layout: 'auth',
})

const router = useRouter()
const { apiUrl } = useApiUrl()
const { setSession } = useAuth()
const { t } = useI18n()

const username = ref('platform_admin')
const password = ref('123456')
const loading = ref(false)
const error = ref<string | null>(null)
const submitAttempted = ref(false)
const rules = computed(() => ({
  username: { required, minLength: minLength(3) },
  password: { required, minLength: minLength(3) },
}))
const v$ = useVuelidate(rules, { username, password }, { $autoDirty: true })
const formErrors = computed(() => ({
  username: username.value.trim().length >= 3 ? '' : t('admin.validation.min_chars', { min: 3 }),
  password: password.value.length >= 3 ? '' : t('admin.validation.min_chars', { min: 3 }),
}))
const canSubmit = computed(
  () =>
    !loading.value &&
    !v$.value.$invalid &&
    !formErrors.value.username &&
    !formErrors.value.password,
)
const showUsernameError = computed(
  () => (submitAttempted.value || v$.value.username.$dirty) && !!formErrors.value.username,
)
const showPasswordError = computed(
  () => (submitAttempted.value || v$.value.password.$dirty) && !!formErrors.value.password,
)

async function submit() {
  submitAttempted.value = true
  v$.value.$touch()
  if (!canSubmit.value) return
  loading.value = true
  error.value = null
  try {
    const res = await $fetch<{ accessToken: string; refreshToken: string; user: unknown }>(
      apiUrl('/auth/platform/login'),
      {
        method: 'POST',
        body: {
          username: username.value.trim(),
          password: password.value,
        },
      },
    )
    setSession(res.accessToken, res.refreshToken, res.user)
    await router.push('/platform/tenants')
  } catch (e: unknown) {
    error.value = getApiErrorMessage(e, 'Platform auth failed')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <section class="mx-auto flex w-full max-w-md flex-col gap-6">
    <header class="space-y-2">
      <h2 class="text-2xl font-semibold text-surface-900">
        Platform Login
      </h2>
      <p class="text-sm text-muted-color">
        Вход для глобального администратора платформы.
      </p>
    </header>

    <div class="flex flex-col gap-4">
      <FloatLabel variant="on">
        <InputText id="platformUsername" v-model="username" class="w-full" :invalid="showUsernameError" />
        <label for="platformUsername">Логин</label>
      </FloatLabel>
      <p v-if="showUsernameError" class="-mt-2 text-[11px] leading-3 text-red-500">{{ formErrors.username }}</p>

      <FloatLabel variant="on" class="block w-full">
        <Password
          inputId="platformPassword"
          v-model="password"
          :invalid="showPasswordError"
          toggleMask
          :feedback="false"
          class="block w-full"
          inputClass="w-full"
        />
        <label for="platformPassword">Пароль</label>
      </FloatLabel>
      <p v-if="showPasswordError" class="-mt-2 text-[11px] leading-3 text-red-500">{{ formErrors.password }}</p>

      <p v-if="error" class="text-sm text-danger-500">
        {{ error }}
      </p>

      <Button
        label="Войти"
        icon="pi pi-check"
        :loading="loading"
        :disabled="loading || (submitAttempted && !canSubmit)"
        class="w-full justify-center"
        @click="submit"
      />
    </div>
  </section>
</template>
