<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import useVuelidate from '@vuelidate/core'
import { helpers, minLength, required } from '@vuelidate/validators'
import { applyAdminLocale, syncThemeAndAccentFromStore } from '~/composables/useAdminAppearance'
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { useAdminSettingsStore } from '~/stores/adminSettings'
import { useTenantStore } from '~/stores/tenant'
import type { AdminSettingsPersisted } from '~/constants/adminSettings'
import { TENANT_PLAN_LIMITS_BY_PLAN } from '~/constants/tenantPlanLimits'
import { getApiErrorMessage } from '~/utils/apiError'
import { normalizeSubscriptionPlanCode } from '~/utils/subscriptionFeatures'

definePageMeta({
  layout: 'auth',
})

const router = useRouter()
const tenantStore = useTenantStore()
const adminSettingsStore = useAdminSettingsStore()
const { apiUrl } = useApiUrl()
const { clearSession, setSession } = useAuth()
const { t } = useI18n()

/** Slug из публичного /[tenant]/… или NUXT_PUBLIC_DEFAULT_TENANT_SLUG */
function tenantSlugFromHostname(): string | null {
  if (!process.client) return null
  const host = window.location.hostname.toLowerCase()
  if (host === 'localhost' || host === '127.0.0.1') return null

  // Dev: tenant.localhost -> tenant
  if (host.endsWith('.localhost')) {
    const parts = host.split('.')
    return parts.length === 2 ? parts[0]! : null
  }

  const parts = host.split('.')
  if (parts.length < 3) return null
  const sub = parts[0]!
  if (!sub || sub === 'www') return null
  return sub
}

const mode = ref<'login' | 'register'>('login')
const loading = ref(false)
const username = ref('admin')
const email = ref('test@test.dd')
const password = ref('123456')
const firstName = ref('')
const lastName = ref('')
const tenantName = ref('')
const tenantSlugManual = ref('')
const error = ref<string | null>(null)

const tenantResolveReady = ref(false)
const resolvedTenantFromUrl = ref<{ tenantSlug: string | null; blocked: boolean } | null>(null)
const submitAttempted = ref(false)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const toggleMode = () => {
  error.value = null
  submitAttempted.value = false
  mode.value = mode.value === 'login' ? 'register' : 'login'
  v$.value.$reset()
}

const tenantSlugDetected = computed(() => {
  // Пока не получили ответ от бэкенда — можем показывать предварительную детекцию по hostname.
  if (!tenantResolveReady.value) return tenantSlugFromHostname() ?? tenantStore.slug ?? null

  // После ответа бэкенда считаем “истиной” только то, что вернул сервер:
  // если tenant не найден — поле должно появляться для ручного ввода.
  return resolvedTenantFromUrl.value?.tenantSlug ?? null
})

const requiresTenantSlugInput = computed(
  () => mode.value === 'login' && tenantResolveReady.value && !tenantSlugDetected.value,
)
const authRules = computed(() => ({
  username: { required, minLength: minLength(3) },
  password: {
    required,
    minLength: minLength(mode.value === 'register' ? 6 : 3),
  },
  tenantSlugManual: {
    requiredWhenNeeded: helpers.withMessage(
      'tenant required',
      (v: unknown) => !requiresTenantSlugInput.value || String(v ?? '').trim().length > 0,
    ),
    minLengthWhenNeeded: helpers.withMessage(
      'tenant min',
      (v: unknown) => !requiresTenantSlugInput.value || String(v ?? '').trim().length >= 3,
    ),
  },
  email: {
    requiredWhenRegister: helpers.withMessage(
      'email required',
      (v: unknown) => mode.value !== 'register' || String(v ?? '').trim().length > 0,
    ),
    emailWhenRegister: helpers.withMessage(
      'email invalid',
      (v: unknown) => mode.value !== 'register' || EMAIL_RE.test(String(v ?? '').trim()),
    ),
  },
  firstName: {
    requiredWhenRegister: helpers.withMessage(
      'firstName required',
      (v: unknown) => mode.value !== 'register' || String(v ?? '').trim().length > 0,
    ),
  },
  lastName: {
    requiredWhenRegister: helpers.withMessage(
      'lastName required',
      (v: unknown) => mode.value !== 'register' || String(v ?? '').trim().length > 0,
    ),
  },
  tenantName: {
    requiredWhenRegister: helpers.withMessage(
      'tenantName required',
      (v: unknown) => mode.value !== 'register' || String(v ?? '').trim().length > 0,
    ),
  },
}))
const v$ = useVuelidate(
  authRules,
  { username, password, tenantSlugManual, email, firstName, lastName, tenantName },
  { $autoDirty: true },
)
const authErrors = computed(() => ({
  username: username.value.trim().length >= 3 ? '' : t('admin.validation.min_chars', { min: 3 }),
  password:
    password.value.length >= (mode.value === 'register' ? 6 : 3)
      ? ''
      : t('admin.validation.min_chars', { min: mode.value === 'register' ? 6 : 3 }),
  tenantSlugManual:
    !requiresTenantSlugInput.value
      ? ''
      : tenantSlugManual.value.trim().length >= 3
        ? ''
        : t('admin.validation.min_chars', { min: 3 }),
  email:
    mode.value !== 'register'
      ? ''
      : !email.value.trim()
        ? t('admin.validation.required')
        : EMAIL_RE.test(email.value.trim())
          ? ''
          : t('admin.validation.invalid_email'),
  firstName: mode.value !== 'register' || firstName.value.trim() ? '' : t('admin.validation.required_first_name'),
  lastName: mode.value !== 'register' || lastName.value.trim() ? '' : t('admin.validation.required_last_name'),
  tenantName:
    mode.value !== 'register' || tenantName.value.trim()
      ? ''
      : t('admin.validation.required_name'),
}))
const canSubmit = computed(
  () =>
    !loading.value &&
    (mode.value !== 'login' || tenantResolveReady.value) &&
    !v$.value.$invalid &&
    !authErrors.value.username &&
    !authErrors.value.password &&
    !authErrors.value.tenantSlugManual &&
    !authErrors.value.email &&
    !authErrors.value.firstName &&
    !authErrors.value.lastName &&
    !authErrors.value.tenantName,
)
const showUsernameError = computed(
  () => (submitAttempted.value || v$.value.username.$dirty) && !!authErrors.value.username,
)
const showPasswordError = computed(
  () => (submitAttempted.value || v$.value.password.$dirty) && !!authErrors.value.password,
)
const showTenantSlugError = computed(
  () =>
    requiresTenantSlugInput.value &&
    (submitAttempted.value || v$.value.tenantSlugManual.$dirty) &&
    !!authErrors.value.tenantSlugManual,
)
const showEmailError = computed(
  () => mode.value === 'register' && (submitAttempted.value || v$.value.email.$dirty) && !!authErrors.value.email,
)
const showFirstNameError = computed(
  () =>
    mode.value === 'register' &&
    (submitAttempted.value || v$.value.firstName.$dirty) &&
    !!authErrors.value.firstName,
)
const showLastNameError = computed(
  () =>
    mode.value === 'register' &&
    (submitAttempted.value || v$.value.lastName.$dirty) &&
    !!authErrors.value.lastName,
)
const showTenantNameError = computed(
  () =>
    mode.value === 'register' &&
    (submitAttempted.value || v$.value.tenantName.$dirty) &&
    !!authErrors.value.tenantName,
)

function buildTenantAdminUrl(tenantSlug: string): string | null {
  if (!process.client) return null
  const host = window.location.hostname.toLowerCase()
  const port = window.location.port ? `:${window.location.port}` : ''
  const protocol = window.location.protocol

  // Local dev fallback: localhost cannot route wildcard subdomains in all setups.
  if (host === 'localhost' || host === '127.0.0.1') {
    return null
  }

  const parts = host.split('.')
  if (parts.length < 2) return null

  // If already on subdomain, replace it. If on root domain, prepend new subdomain.
  // Special case: `tenant.localhost` should map to `tenantSlug.localhost` (baseDomain = `localhost`).
  let baseDomain = host
  if (host.endsWith('.localhost')) {
    baseDomain = 'localhost'
  } else if (parts.length >= 3) {
    baseDomain = parts.slice(1).join('.')
  }
  return `${protocol}//${tenantSlug}.${baseDomain}${port}/admin`
}

const submit = async () => {
  if (mode.value === 'login' && !tenantResolveReady.value) return
  submitAttempted.value = true
  v$.value.$touch()
  if (!canSubmit.value) return

  loading.value = true
  error.value = null
  try {
    const endpoint = mode.value === 'login' ? '/auth/login' : '/auth/register'

    const body: any = {
      username: username.value.trim(),
      password: password.value,
    }

    if (mode.value === 'register') {
      body.email = email.value.trim()
      body.firstName = firstName.value.trim()
      body.lastName = lastName.value.trim()
      body.tenantName = tenantName.value.trim()
    } else {
      // login: вариант A — всегда отправляем `tenantSlug` в body.
      // Поле может быть скрыто, но бэкенду всегда нужна однозначность.
      const detected = tenantSlugDetected.value
      const manual = tenantSlugManual.value.trim()

      if (!detected) {
        if (!manual) {
          error.value = t('admin.validation.required')
          return
        }
        body.tenantSlug = manual
      } else {
        body.tenantSlug = detected
      }
    }

    const res = await $fetch<{
      accessToken: string
      refreshToken: string
      user: Record<string, unknown>
      tenant?: {
        subscriptionPlan?: string
        subscriptionStatus?: string
        subscriptionEndsAt?: string | null
      }
    }>(apiUrl(endpoint), {
      method: 'POST',
      body,
      credentials: 'include',
      headers: { 'x-original-host': window.location.host },
    })

    const userForSession = { ...res.user }
    if (
      !userForSession.tenantSubscription &&
      res.tenant &&
      typeof res.tenant === 'object'
    ) {
      const endsRaw = res.tenant.subscriptionEndsAt
      const endsAt = endsRaw ? new Date(endsRaw) : null
      const active =
        !endsAt || Number.isNaN(endsAt.getTime()) ? true : endsAt.getTime() > Date.now()
      const planRaw = res.tenant.subscriptionPlan
      const planCode =
        typeof planRaw === 'string' && planRaw.trim()
          ? planRaw.trim().toUpperCase()
          : 'FREE'
      userForSession.tenantSubscription = {
        plan: res.tenant.subscriptionPlan,
        status: res.tenant.subscriptionStatus,
        endsAt: endsRaw ?? null,
        active,
        limits: TENANT_PLAN_LIMITS_BY_PLAN[normalizeSubscriptionPlanCode(planCode)],
      }
    }

    setSession(res.accessToken, null, userForSession)
    if (mode.value === 'register') {
      const tenantSlug = (res as any)?.tenant?.slug
      if (typeof tenantSlug === 'string' && tenantSlug.trim()) {
        tenantStore.setTenant(tenantSlug)
        const targetUrl = buildTenantAdminUrl(tenantSlug)
        if (targetUrl && process.client) {
          window.location.assign(targetUrl)
          return
        }
      }
    }

    if (mode.value === 'login') {
      const finalTenantSlug = String(body.tenantSlug ?? '').trim()
      if (finalTenantSlug) {
        tenantStore.setTenant(finalTenantSlug)
        const targetUrl = buildTenantAdminUrl(finalTenantSlug)
        if (targetUrl && process.client) {
          window.location.assign(targetUrl)
          return
        }
      }
    }
    await router.push('/admin')
  } catch (e: unknown) {
    error.value = getApiErrorMessage(e, 'Auth failed')
    // Чтобы не показывать данные предыдущего tenant при ошибке входа.
    clearSession()
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  tenantResolveReady.value = false
  try {
    // Бэкенд определяет tenant из Host/subdomain и проверяет, что tenant реально существует.
    const r = await $fetch<{
      tenantSlug: string | null
      blocked: boolean
      uiSettings?: Partial<AdminSettingsPersisted>
    }>(apiUrl('/auth/tenant/resolve'), {
      headers: { 'x-original-host': window.location.host },
    })
    resolvedTenantFromUrl.value = r
    if (r.tenantSlug) {
      tenantStore.setTenant(r.tenantSlug)
    }
    if (r.uiSettings) {
      adminSettingsStore.applyFromTenantResolvePayload(r.uiSettings)
      syncThemeAndAccentFromStore()
      const nuxtApp = useNuxtApp()
      const { locale, setLocale } = useI18n()
      const code = adminSettingsStore.locale
      if (locale.value !== code) {
        setLocale(code)
      }
      applyAdminLocale(code, nuxtApp)
    }
  } catch {
    // Если запрос не прошёл (например, недоступен API), оставляем fallback на detection по hostname/tenant store.
  } finally {
    tenantResolveReady.value = true
  }
})
</script>

<template>
  <section class="flex flex-col gap-6">
    <header class="space-y-2">
      <h2 class="text-2xl font-semibold text-surface-900 dark:text-surface-0">
        {{ mode === 'login' ? 'Вход' : 'Создать организацию' }}
      </h2>
      <p class="text-sm text-muted-color">
        {{ mode === 'login'
          ? 'Войдите в существующую организацию по логину и паролю.'
          : 'Создайте новую организацию и учетную запись администратора.' }}
      </p>
    </header>

    <div class="flex flex-col gap-4">
      <div v-if="mode === 'register'" class="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div class="flex min-w-0 flex-col gap-1">
          <FloatLabel variant="on">
            <InputText id="firstName" v-model="firstName" class="w-full" :invalid="showFirstNameError" />
            <label for="firstName">Имя</label>
          </FloatLabel>
          <p v-if="showFirstNameError" class="text-[11px] leading-3 text-red-500">{{ authErrors.firstName }}</p>
        </div>
        <div class="flex min-w-0 flex-col gap-1">
          <FloatLabel variant="on">
            <InputText id="lastName" v-model="lastName" class="w-full" :invalid="showLastNameError" />
            <label for="lastName">Фамилия</label>
          </FloatLabel>
          <p v-if="showLastNameError" class="text-[11px] leading-3 text-red-500">{{ authErrors.lastName }}</p>
        </div>
      </div>

      <div v-if="mode === 'register'">
        <FloatLabel variant="on">
          <InputText id="tenantName" v-model="tenantName" class="w-full" :invalid="showTenantNameError" />
          <label for="tenantName">Название организации</label>
        </FloatLabel>
        <p v-if="showTenantNameError" class="mt-0 text-[11px] leading-3 text-red-500">{{ authErrors.tenantName }}</p>
      </div>

      <div>
        <FloatLabel variant="on">
          <InputText id="username" v-model="username" class="w-full" :invalid="showUsernameError" />
          <label for="username">Логин</label>
        </FloatLabel>
        <p v-if="showUsernameError" class="mt-0 text-[11px] leading-3 text-red-500">{{ authErrors.username }}</p>
      </div>

      <div v-if="requiresTenantSlugInput">
        <FloatLabel variant="on">
          <InputText id="tenantSlug" v-model="tenantSlugManual" class="w-full" :invalid="showTenantSlugError" />
          <label for="tenantSlug">Slug организации (например: acme)</label>
        </FloatLabel>
        <p v-if="showTenantSlugError" class="mt-0 text-[11px] leading-3 text-red-500">{{ authErrors.tenantSlugManual }}</p>
      </div>

      <div v-if="mode === 'register'">
        <FloatLabel variant="on">
          <InputText id="email" v-model="email" type="email" class="w-full" :invalid="showEmailError" />
          <label for="email">Email</label>
        </FloatLabel>
        <p v-if="showEmailError" class="mt-0 text-[11px] leading-3 text-red-500">{{ authErrors.email }}</p>
      </div>

      <div class="w-full">
        <FloatLabel variant="on" class="block w-full">
          <Password
            inputId="password"
            v-model="password"
            :invalid="showPasswordError"
            toggleMask
            :feedback="false"
            class="block w-full"
            inputClass="w-full"
          />
          <label for="password">Пароль</label>
        </FloatLabel>
        <p v-if="showPasswordError" class="mt-0 text-[11px] leading-3 text-red-500">{{ authErrors.password }}</p>
      </div>

      <p v-if="mode === 'register'" class="text-xs text-muted-color">
        Обычных пользователей внутри организации создает администратор после входа.
      </p>

      <p
        v-if="error"
        role="alert"
        class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-200"
      >
        {{ error }}
      </p>

      <div class="mt-2 flex flex-col gap-2">
        <Button
          :label="mode === 'login' ? 'Войти' : 'Создать организацию'"
          icon="pi pi-check"
          :loading="loading"
          :disabled="loading || (submitAttempted && !canSubmit)"
          class="w-full justify-center"
          @click="submit"
        />

        <div class="text-center">
          <Button
            link
            :label="mode === 'login' ? 'Нет организации? Создать' : 'Уже есть организация? Войти'"
            class="text-primary"
            @click="toggleMode"
          />
        </div>
      </div>
    </div>
  </section>
</template>
