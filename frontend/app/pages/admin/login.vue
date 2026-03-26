<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { useTenantStore } from '~/stores/tenant'
import { getApiErrorMessage } from '~/utils/apiError'

definePageMeta({
  layout: 'auth',
})

const router = useRouter()
const tenantStore = useTenantStore()
const { apiUrl } = useApiUrl()
const { clearSession, setSession } = useAuth()

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

const toggleMode = () => {
  error.value = null
  mode.value = mode.value === 'login' ? 'register' : 'login'
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
          error.value = 'Укажите slug организации для входа (например: acme).'
          return
        }
        body.tenantSlug = manual
      } else {
        body.tenantSlug = detected
      }
    }

    const res = await $fetch<{ accessToken: string; refreshToken: string; user: any }>(apiUrl(endpoint), {
      method: 'POST',
      body,
      headers: { 'x-original-host': window.location.host },
    })

    setSession(res.accessToken, res.refreshToken, res.user)
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
    const r = await $fetch<{ tenantSlug: string | null; blocked: boolean }>(apiUrl('/auth/tenant/resolve'), {
      headers: { 'x-original-host': window.location.host },
    })
    resolvedTenantFromUrl.value = r
    if (r.tenantSlug) {
      tenantStore.setTenant(r.tenantSlug)
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
      <h2 class="text-2xl font-semibold text-surface-900">
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
        <FloatLabel variant="on">
          <InputText id="firstName" v-model="firstName" class="w-full" />
          <label for="firstName">Имя</label>
        </FloatLabel>
        <FloatLabel variant="on">
          <InputText id="lastName" v-model="lastName" class="w-full" />
          <label for="lastName">Фамилия</label>
        </FloatLabel>
      </div>

      <div v-if="mode === 'register'">
        <FloatLabel variant="on">
          <InputText id="tenantName" v-model="tenantName" class="w-full" />
          <label for="tenantName">Название организации</label>
        </FloatLabel>
      </div>

      <div>
        <FloatLabel variant="on">
          <InputText id="username" v-model="username" class="w-full" />
          <label for="username">Логин</label>
        </FloatLabel>
      </div>

      <div v-if="requiresTenantSlugInput">
        <FloatLabel variant="on">
          <InputText id="tenantSlug" v-model="tenantSlugManual" class="w-full" />
          <label for="tenantSlug">Slug организации (например: acme)</label>
        </FloatLabel>
      </div>

      <div v-if="mode === 'register'">
        <FloatLabel variant="on">
          <InputText id="email" v-model="email" type="email" class="w-full" />
          <label for="email">Email</label>
        </FloatLabel>
      </div>

      <div class="w-full">
        <FloatLabel variant="on" class="block w-full">
          <Password
            inputId="password"
            v-model="password"
            toggleMask
            :feedback="false"
            class="block w-full"
            inputClass="w-full"
          />
          <label for="password">Пароль</label>
        </FloatLabel>
      </div>

      <p v-if="mode === 'register'" class="text-xs text-muted-color">
        Обычных пользователей внутри организации создает администратор после входа.
      </p>

      <p v-if="error" class="text-sm text-danger-500">
        {{ error }}
      </p>

      <div class="mt-2 flex flex-col gap-2">
        <Button
          :label="mode === 'login' ? 'Войти' : 'Создать организацию'"
          icon="pi pi-check"
          :loading="loading"
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
