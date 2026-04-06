<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import useVuelidate from '@vuelidate/core'
import { helpers, minLength, required } from '@vuelidate/validators'
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { USER_ROLE_LABELS_RU, userRoleLabelRu } from '~/constants/userRoles'
import { useMetaStore } from '~/stores/meta'
import type { UserRow } from '~/types/admin/user'
import { getApiErrorMessage } from '~/utils/apiError'
import { MIN_SKELETON_DISPLAY_MS } from '~/utils/minimumLoadingDelay'
import { useAdminAsyncListState } from '~/composables/admin/useAdminAsyncListState'
import AdminDataState from '~/app/components/admin/AdminDataState.vue'
import { readTenantStaffRole } from '~/utils/tenantStaffRole'

definePageMeta({
  layout: 'admin',
  adminOrgModeratorReadOnly: false,
})

const route = useRoute()
const router = useRouter()
const { token, user, syncWithStorage, loggedIn, authFetch, fetchMe } = useAuth()
const { apiUrl } = useApiUrl()
const toast = useToast()
const { t } = useI18n()
const metaStore = useMetaStore()

/** Удаление в API разрешено только TENANT_ADMIN и только если в организации включён флаг. */
const canDeleteUsers = computed(() => {
  const r = readTenantStaffRole(user.value)?.toUpperCase()
  if (r !== 'TENANT_ADMIN') return false
  const ts = (user.value as { tenantSubscription?: { allowUserDeletion?: boolean } | null } | null)
    ?.tenantSubscription
  return ts?.allowUserDeletion === true
})

/** Роли, которые может назначать только платформа / не через админку тенанта. */
const ELEVATED_ROLES = new Set(['SUPER_ADMIN', 'TENANT_ADMIN'])

const roleOptionsRu = computed(() =>
  metaStore.roles.map((r) => ({
    value: r.value,
    label: USER_ROLE_LABELS_RU[r.value] ?? r.label ?? r.value,
  })),
)

/** Для админа тенанта — без супер-админа и «Администратора»; текущую роль при редактировании оставляем в списке. */
const formRoleOptionsRu = computed(() => {
  const me = readTenantStaffRole(user.value)
  if (me !== 'TENANT_ADMIN') return roleOptionsRu.value
  const editingRole = editingUser.value?.role
  return roleOptionsRu.value.filter((o) => {
    if (!ELEVATED_ROLES.has(o.value)) return true
    return isEdit.value && editingRole === o.value
  })
})

/** Фильтр по роли над таблицей: для админа тенанта без SUPER_ADMIN. */
const filterRoleOptionsRu = computed(() => {
  const me = readTenantStaffRole(user.value)
  const base = [{ label: 'Все роли', value: '' }, ...roleOptionsRu.value]
  if (me !== 'TENANT_ADMIN') return base
  return base.filter((o) => o.value !== 'SUPER_ADMIN')
})

const SKELETON_ROW_COUNT = 8
const skeletonRows = Array.from({ length: SKELETON_ROW_COUNT }, (_, i) => ({ id: `u-sk-${i}` }))

const USERS_LIST_QUERY_KEYS = ['search', 'role', 'page', 'rows'] as const
const DEFAULT_PAGE_SIZE = 20
const PAGE_SIZE_OPTIONS = [10, 20, 50, 100] as const

/** До ответа API — показываем скелетон таблицы. */
const {
  items: users,
  loading,
  error,
  run,
  retry,
} = useAdminAsyncListState<UserRow>({
  initialLoading: true,
  clearItemsOnError: true,
  minLoadingMs: MIN_SKELETON_DISPLAY_MS,
})
const total = ref(0)
const page = ref(1)
const pageSize = ref(DEFAULT_PAGE_SIZE)
/** Значение в поле поиска; в запрос уходит с debounce через `search`. */
const searchInput = ref('')
const search = ref('')
const role = ref<string | ''>('')

let searchDebounce: ReturnType<typeof setTimeout> | null = null
let usersQuerySyncFromRoute = false

function firstQueryString(val: unknown): string {
  if (val == null || val === '') return ''
  if (Array.isArray(val)) return val.length ? String(val[0]) : ''
  return String(val)
}

function normalizeQueryComparable(q: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of Object.keys(q).sort()) {
    const val = q[key]
    if (val == null || val === '') continue
    const s = Array.isArray(val) ? val.map(String).join(',') : String(val)
    if (s !== '') out[key] = s
  }
  return out
}

function readUsersListQuery(query: typeof route.query) {
  const pageRaw = firstQueryString(query.page)
  const rowsRaw = firstQueryString(query.rows)
  let p = Number.parseInt(pageRaw, 10)
  if (!Number.isFinite(p) || p < 1) p = 1
  let rows = Number.parseInt(rowsRaw, 10)
  if (!PAGE_SIZE_OPTIONS.includes(rows as (typeof PAGE_SIZE_OPTIONS)[number])) {
    rows = DEFAULT_PAGE_SIZE
  }
  return {
    search: firstQueryString(query.search).trim(),
    role: firstQueryString(query.role).trim(),
    page: p,
    pageSize: rows,
  }
}

function roleAllowedForFilter(r: string): boolean {
  if (!r) return true
  if (filterRoleOptionsRu.value.some((o) => o.value === r)) return true
  // До `loadRoles()` список опций пуст — не сбрасываем роль из URL.
  if (!metaStore.roles.length) return /^[A-Z][A-Z0-9_]*$/.test(r)
  return false
}

function buildUsersListQuery(): Record<string, string | string[]> {
  const next: Record<string, string | string[]> = {}
  for (const [key, val] of Object.entries(route.query)) {
    if ((USERS_LIST_QUERY_KEYS as readonly string[]).includes(key)) continue
    if (val === null || val === undefined || val === '') continue
    next[key] = val as string | string[]
  }
  const st = search.value.trim()
  if (st) next.search = st
  if (role.value) next.role = role.value
  if (page.value > 1) next.page = String(page.value)
  if (pageSize.value !== DEFAULT_PAGE_SIZE) next.rows = String(pageSize.value)
  return next
}

function writeUsersListQuery() {
  if (usersQuerySyncFromRoute) return
  const desired = buildUsersListQuery()
  const a = normalizeQueryComparable(route.query as Record<string, unknown>)
  const b = normalizeQueryComparable(desired as Record<string, unknown>)
  if (JSON.stringify(a) === JSON.stringify(b)) return
  void router.replace({ path: route.path, query: desired })
}

function applyUsersListFromRoute() {
  const r = readUsersListQuery(route.query)
  usersQuerySyncFromRoute = true
  search.value = r.search
  searchInput.value = r.search
  role.value = r.role && roleAllowedForFilter(r.role) ? r.role : ''
  page.value = r.page
  pageSize.value = r.pageSize
  usersQuerySyncFromRoute = false
  void nextTick(() => writeUsersListQuery())
}

function listMatchesRouteQuery(): boolean {
  const r = readUsersListQuery(route.query)
  return (
    r.search === search.value.trim() &&
    r.role === (role.value || '') &&
    r.page === page.value &&
    r.pageSize === pageSize.value
  )
}

const hasActiveListFilters = computed(
  () => Boolean(search.value.trim()) || Boolean(role.value),
)

const usersListEmptyTitle = computed(() =>
  hasActiveListFilters.value ? 'Ничего не найдено' : 'Нет пользователей',
)
const usersListEmptyDescription = computed(() =>
  hasActiveListFilters.value
    ? 'По текущим фильтрам пользователей нет. Измените поиск или роль либо сбросьте фильтры.'
    : 'Измените фильтры или добавьте пользователя кнопкой «Создать».',
)

function scheduleSearchCommit() {
  if (searchDebounce) clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => {
    searchDebounce = null
    const next = searchInput.value.trim()
    if (next !== search.value) {
      search.value = next
      page.value = 1
    }
    writeUsersListQuery()
    void fetchUsers()
  }, 300)
}

function onRoleFilterChange(value: string | null) {
  const v = (value ?? '') as string | ''
  if (v === role.value) return
  role.value = v
  page.value = 1
  writeUsersListQuery()
  void fetchUsers()
}

function clearUsersListFilters() {
  if (searchDebounce) {
    clearTimeout(searchDebounce)
    searchDebounce = null
  }
  searchInput.value = ''
  search.value = ''
  role.value = ''
  page.value = 1
  writeUsersListQuery()
  void fetchUsers()
}

/** Связка label / ошибок в диалоге создания и редактирования пользователя. */
const UF = 'admin_user_form' as const
const ufIds = {
  username: `${UF}_username`,
  email: `${UF}_email`,
  name: `${UF}_name`,
  lastName: `${UF}_lastName`,
  password: `${UF}_password`,
  role: `${UF}_role`,
  errUsername: `${UF}_err_username`,
  errEmail: `${UF}_err_email`,
  errName: `${UF}_err_name`,
  errPassword: `${UF}_err_password`,
} as const

const showForm = ref(false)
const saving = ref(false)
const editingUser = ref<UserRow | null>(null)

const form = reactive({
  username: '',
  email: '',
  name: '',
  lastName: '',
  password: '',
  role: 'USER',
})
const submitAttempted = ref(false)
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const userRules = computed(() => ({
  username: { required, minLength: minLength(3) },
  name: { required, minLength: minLength(3) },
  email: {
    formatWhenFilled: helpers.withMessage(
      'email invalid',
      (v: unknown) => {
        const s = String(v ?? '').trim()
        if (!s) return true
        return EMAIL_RE.test(s)
      },
    ),
  },
  password: {
    minLengthWhenRequired: helpers.withMessage(
      'password min',
      (v: unknown) => {
        const s = String(v ?? '')
        if (isEdit.value) return !s || s.length >= 6
        return s.length >= 6
      },
    ),
  },
}))
const v$ = useVuelidate(userRules, form, { $autoDirty: true })
const formErrors = computed(() => ({
  username: form.username.trim().length >= 3 ? '' : t('admin.validation.min_chars', { min: 3 }),
  name: form.name.trim().length >= 3 ? '' : t('admin.validation.min_chars', { min: 3 }),
  email: (() => {
    const s = form.email.trim()
    if (!s) return ''
    return EMAIL_RE.test(s) ? '' : t('admin.validation.invalid_email')
  })(),
  password:
    isEdit.value
      ? form.password && form.password.length < 6
        ? t('admin.validation.min_chars', { min: 6 })
        : ''
      : form.password.length >= 6
        ? ''
        : t('admin.validation.min_chars', { min: 6 }),
}))
const canSaveUser = computed(
  () =>
    !v$.value.$invalid &&
    !formErrors.value.username &&
    !formErrors.value.name &&
    !formErrors.value.email &&
    !formErrors.value.password,
)
const showUsernameError = computed(
  () => (submitAttempted.value || v$.value.username.$dirty) && !!formErrors.value.username,
)
const showNameError = computed(
  () => (submitAttempted.value || v$.value.name.$dirty) && !!formErrors.value.name,
)
const showEmailError = computed(
  () => !isEdit.value && (submitAttempted.value || v$.value.email.$dirty) && !!formErrors.value.email,
)
const showPasswordError = computed(
  () => (submitAttempted.value || v$.value.password.$dirty) && !!formErrors.value.password,
)

const isEdit = computed(() => !!editingUser.value)

const fetchUsers = async () => {
  if (!token.value) {
    loading.value = false
    return
  }
  await run(async () => {
    const res = await authFetch<{
      items: UserRow[]
      total: number
      page: number
      pageSize: number
    }>(apiUrl('/users'), {
      params: {
        page: page.value,
        pageSize: pageSize.value,
        search: search.value.trim() || undefined,
        role: role.value || undefined,
        excludeSelf: true,
      },
    })

    users.value = res.items
    total.value = res.total
  })
}

const openCreate = () => {
  submitAttempted.value = false
  editingUser.value = null
  form.email = ''
  form.username = ''
  form.name = ''
  form.lastName = ''
  form.password = ''
  form.role = 'USER'
  v$.value.$reset()
  showForm.value = true
}

const openEdit = (user: UserRow) => {
  submitAttempted.value = false
  editingUser.value = user
  form.email = user.email ?? ''
  form.username = user.username
  form.name = user.name
  form.lastName = user.lastName ?? ''
  form.password = ''
  form.role = user.role
  v$.value.$reset()
  showForm.value = true
}

const saveUser = async () => {
  if (!token.value) return
  submitAttempted.value = true
  v$.value.$touch()
  if (!canSaveUser.value) {
    return
  }
  const body: any = {
    username: form.username,
    name: form.name,
    lastName: form.lastName.trim(),
    role: form.role,
  }

  if (!isEdit.value) {
    const em = form.email.trim()
    if (em) body.email = em
    body.password = form.password
  } else if (form.password) {
    body.password = form.password
  }

  saving.value = true
  try {
    if (isEdit.value) {
      await authFetch(apiUrl(`/users/${editingUser.value!.id}`), {
        method: 'PATCH',
        body,
      })
    } else {
      await authFetch(apiUrl('/users'), {
        method: 'POST',
        body,
      })
    }

    showForm.value = false
    await fetchUsers()
  } finally {
    saving.value = false
  }
}

function userRowDisplayLabel(u: UserRow): string {
  const last = (u.lastName ?? '').trim()
  const name = [u.name, last].filter(Boolean).join(' ').trim()
  if (name) return `${name} (${u.username})`
  return u.email ?? u.username
}

const blockUserConfirmOpen = ref(false)
const blockUserPending = ref<UserRow | null>(null)

const blockActionIsBlock = computed(() => !blockUserPending.value?.blocked)

const blockConfirmTitle = computed(() =>
  blockActionIsBlock.value
    ? t('admin.users_page.block_confirm_title')
    : t('admin.users_page.unblock_confirm_title'),
)

const blockConfirmMessage = computed(() => {
  const u = blockUserPending.value
  if (!u) return ''
  return blockActionIsBlock.value
    ? t('admin.users_page.block_confirm_message', { name: userRowDisplayLabel(u) })
    : t('admin.users_page.unblock_confirm_message', { name: userRowDisplayLabel(u) })
})

const blockConfirmButtonLabel = computed(() =>
  blockActionIsBlock.value
    ? t('admin.users_page.block_confirm_action')
    : t('admin.users_page.unblock_confirm_action'),
)

const blockConfirmSeverity = computed(() => (blockActionIsBlock.value ? 'warn' : 'secondary'))

function requestToggleBlock(u: UserRow) {
  blockUserPending.value = u
  blockUserConfirmOpen.value = true
}

async function confirmToggleBlock() {
  const u = blockUserPending.value
  if (!token.value || !u) return
  try {
    await authFetch(apiUrl(`/users/${u.id}/block`), {
      method: 'POST',
      body: { blocked: !u.blocked },
    })
    await fetchUsers()
    toast.add({
      severity: 'success',
      summary: u.blocked ? t('admin.users_page.unblocked_toast') : t('admin.users_page.blocked_toast'),
      life: 2500,
    })
  } catch (err: unknown) {
    toast.add({
      severity: 'error',
      summary: t('admin.users_page.block_error'),
      detail: getApiErrorMessage(err),
      life: 6000,
    })
  } finally {
    blockUserPending.value = null
  }
}

const deleteUserConfirmOpen = ref(false)
const deleteUserPending = ref<UserRow | null>(null)

const deleteUserMessage = computed(() => {
  const u = deleteUserPending.value
  if (!u) return ''
  return `Удалить пользователя ${u.email ?? u.username}? Действие необратимо.`
})

function requestDeleteUser(user: UserRow) {
  deleteUserPending.value = user
  deleteUserConfirmOpen.value = true
}

async function confirmDeleteUser() {
  const u = deleteUserPending.value
  if (!token.value || !u) return
  try {
    await authFetch(apiUrl(`/users/${u.id}`), {
      method: 'DELETE',
    })
    await fetchUsers()
    toast.add({ severity: 'success', summary: 'Пользователь удалён', life: 2500 })
  } catch (err: unknown) {
    toast.add({
      severity: 'error',
      summary: 'Не удалось удалить',
      detail: getApiErrorMessage(err),
      life: 6000,
    })
  } finally {
    deleteUserPending.value = null
  }
}

watch(filterRoleOptionsRu, (opts) => {
  if (!metaStore.roles.length) return
  const allowed = new Set(opts.map((o) => o.value))
  if (role.value && !allowed.has(role.value)) {
    role.value = ''
    page.value = 1
    writeUsersListQuery()
    void fetchUsers()
  }
})

/** Если фильтр уменьшил total, не оставаться на несуществующей странице */
watch([total, pageSize], ([t, ps]) => {
  if (t <= 0) return
  const maxPage = Math.max(1, Math.ceil(t / ps))
  if (page.value > maxPage) {
    page.value = maxPage
    writeUsersListQuery()
    void fetchUsers()
  }
})

watch(
  () => route.query,
  () => {
    if (usersQuerySyncFromRoute) return
    if (listMatchesRouteQuery()) return
    applyUsersListFromRoute()
    void fetchUsers()
  },
  { deep: true },
)

const usersTableFirst = computed(() => (page.value - 1) * pageSize.value)

const onUsersPage = (event: { first?: number; rows?: number }) => {
  const rows = Number(event.rows ?? pageSize.value) || pageSize.value
  const first = Number(event.first ?? 0)
  pageSize.value = rows > 0 ? rows : pageSize.value
  page.value = Math.floor(first / pageSize.value) + 1
  writeUsersListQuery()
  void fetchUsers()
}

/** Пагинация только если записей больше 10 */
const showUsersPaginator = computed(() => total.value > 10)

onMounted(() => {
  if (process.client) {
    syncWithStorage()
    if (!loggedIn.value) {
      loading.value = false
      router.push('/admin/login')
      return
    }
    applyUsersListFromRoute()
    // Попробуем обновить access токен и только потом грузим справочник ролей.
    // Если refresh не сработал — отдадим роли без обновления (пользователь всё равно будет на странице).
    fetchMe()
      .catch(() => null)
      .finally(() => {
        void metaStore.loadRoles()
      })
  } else {
    applyUsersListFromRoute()
  }
  void fetchUsers()
})

onBeforeUnmount(() => {
  if (searchDebounce) clearTimeout(searchDebounce)
})
</script>

<template>
  <section class="admin-page">
    <header class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-3">
      <div class="min-w-0">
        <h1 class="text-lg font-semibold text-surface-900 dark:text-surface-0 sm:text-xl">
          Пользователи
        </h1>
        <p class="mt-1 max-w-2xl text-xs leading-relaxed text-muted-color sm:text-sm">
          Список пользователей текущего тенанта.
        </p>
      </div>
      <div class="admin-toolbar-responsive flex flex-wrap items-center gap-2">
        <Button
          label="Обновить"
          icon="pi pi-refresh"
          text
          severity="secondary"
          :loading="loading"
          @click="fetchUsers()"
        />
        <Button label="Создать" icon="pi pi-plus" @click="openCreate" />
      </div>
    </header>

    <div class="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <IconField class="w-full min-w-0 sm:min-w-[16rem] sm:max-w-md">
        <InputIcon class="pi pi-search" />
        <InputText
          :model-value="searchInput"
          placeholder="Поиск по логину, email, имени или фамилии"
          class="w-full"
          @update:model-value="(v) => { searchInput = v ?? ''; scheduleSearchCommit() }"
        />
      </IconField>

      <Select
        :model-value="role"
        :options="filterRoleOptionsRu"
        option-label="label"
        option-value="value"
        class="w-52"
        placeholder="Роль"
        @update:model-value="onRoleFilterChange"
      />
    </div>

    <AdminDataState
      :loading="loading"
      :error="error"
      :empty="!users.length"
      empty-icon="pi pi-users"
      :empty-title="usersListEmptyTitle"
      :empty-description="usersListEmptyDescription"
      @retry="retry"
    >
      <template #loading>
        <div
          class="rounded-xl border border-surface-200 bg-surface-0 shadow-sm dark:border-surface-700 dark:bg-surface-900 overflow-hidden min-h-[20rem]"
          aria-busy="true"
        >
          <div
            class="grid grid-cols-1 sm:grid-cols-[minmax(0,2.5rem)_minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,6.5rem)_minmax(0,5rem)_auto] gap-3 px-4 py-3 border-b border-surface-200 dark:border-surface-700 bg-surface-50/80 dark:bg-surface-800/50"
          >
            <Skeleton height="0.75rem" width="1.25rem" class="rounded-md mx-auto" />
            <Skeleton height="0.75rem" width="4rem" class="rounded-md" />
            <Skeleton height="0.75rem" width="3.5rem" class="rounded-md" />
            <Skeleton height="0.75rem" width="3.25rem" class="rounded-md" />
            <Skeleton height="0.75rem" width="3rem" class="rounded-md" />
            <Skeleton height="0.75rem" width="4rem" class="rounded-md" />
            <div class="hidden sm:flex justify-end gap-1">
              <Skeleton shape="circle" width="2rem" height="2rem" />
              <Skeleton shape="circle" width="2rem" height="2rem" />
              <Skeleton shape="circle" width="2rem" height="2rem" />
            </div>
          </div>
          <div
            v-for="row in skeletonRows"
            :key="row.id"
            class="grid grid-cols-1 sm:grid-cols-[minmax(0,2.5rem)_minmax(0,1.15fr)_minmax(0,1fr)_minmax(0,0.9fr)_minmax(0,6.5rem)_minmax(0,5rem)_auto] gap-3 items-center px-4 py-3.5 border-b border-surface-100 dark:border-surface-800 last:border-0"
          >
            <Skeleton width="1.5rem" height="0.875rem" class="rounded-md mx-auto" />
            <Skeleton width="72%" height="1rem" class="rounded-md max-w-xs" />
            <Skeleton width="85%" height="0.875rem" class="rounded-md" />
            <Skeleton width="65%" height="0.875rem" class="rounded-md" />
            <Skeleton width="55%" height="0.875rem" class="rounded-md" />
            <Skeleton width="70%" height="0.875rem" class="rounded-md" />
            <div class="flex justify-end gap-1 sm:col-start-7">
              <Skeleton shape="circle" width="2rem" height="2rem" />
              <Skeleton shape="circle" width="2rem" height="2rem" />
              <Skeleton shape="circle" width="2rem" height="2rem" />
            </div>
          </div>
        </div>
      </template>

      <template #empty-actions>
        <Button
          v-if="hasActiveListFilters"
          label="Сбросить фильтры"
          icon="pi pi-filter-slash"
          severity="secondary"
          @click="clearUsersListFilters"
        />
        <Button
          v-else
          label="Создать пользователя"
          icon="pi pi-plus"
          @click="openCreate"
        />
      </template>

      <DataTable
        :value="users"
        data-key="id"
        striped-rows
        :paginator="showUsersPaginator"
        lazy
        :total-records="total"
        :rows="pageSize"
        :rows-per-page-options="[10, 20, 50, 100]"
        :first="usersTableFirst"
        paginator-template="FirstPageLink PrevPageLink PageLinks NextPageLink LastPageLink RowsPerPageDropdown"
        current-page-report-template="{first}–{last} из {totalRecords}"
        @page="onUsersPage"
      >
      <template #empty>
        <span class="sr-only">Пусто</span>
      </template>
      <Column
        header="№"
        style="width: 3.25rem"
        header-class="!text-center"
        body-class="text-center text-muted-color tabular-nums"
      >
        <template #body="{ index }">
          {{ usersTableFirst + index + 1 }}
        </template>
      </Column>
      <Column header="Игрок" style="min-width: 12rem">
        <template #body="{ data }">
          <span class="font-medium text-surface-900 truncate min-w-0 block">
            {{ data.name }}
            <template v-if="(data.lastName ?? '').trim()">
              {{ ' ' }}{{ data.lastName }}
            </template>
          </span>
        </template>
      </Column>
      <Column header="Email" style="min-width: 11rem">
        <template #body="{ data }">
          <span :class="data.email ? 'text-surface-900' : 'text-muted-color'">
            {{ data.email ?? '—' }}
          </span>
        </template>
      </Column>
      <Column field="username" header="Логин" />
      <Column header="Роль" style="min-width: 10rem">
        <template #body="{ data }">
          {{ userRoleLabelRu(data.role) }}
        </template>
      </Column>
      <Column field="createdAt" header="Создан">
        <template #body="{ data }">
          {{ new Date(data.createdAt).toLocaleDateString() }}
        </template>
      </Column>
      <Column
        header="Действия"
        style="width: 6.75rem; min-width: 6.75rem"
        header-class="!text-end"
        body-class="!text-end"
      >
        <template #body="{ data }">
          <div class="inline-flex flex-nowrap items-center justify-end gap-0 shrink-0">
            <Button
              icon="pi pi-pencil"
              text
              rounded
              severity="secondary"
              class="!shrink-0 !p-1"
              size="small"
              aria-label="Редактировать"
              @click="openEdit(data)"
            />
            <Button
              :icon="data.blocked ? 'pi pi-lock-open' : 'pi pi-lock'"
              text
              rounded
              :severity="data.blocked ? 'warn' : 'secondary'"
              class="!shrink-0 !p-1"
              size="small"
              :aria-label="data.blocked ? 'Разблокировать' : 'Заблокировать'"
              @click="requestToggleBlock(data)"
            />
            <Button
              v-if="canDeleteUsers"
              icon="pi pi-trash"
              text
              rounded
              severity="danger"
              class="!shrink-0 !p-1"
              size="small"
              aria-label="Удалить"
              @click="requestDeleteUser(data)"
            />
          </div>
        </template>
      </Column>
    </DataTable>
    </AdminDataState>

    <AdminConfirmDialog
      v-model="deleteUserConfirmOpen"
      title="Удалить пользователя?"
      :message="deleteUserMessage"
      @confirm="confirmDeleteUser"
    />

    <AdminConfirmDialog
      v-model="blockUserConfirmOpen"
      :title="blockConfirmTitle"
      :message="blockConfirmMessage"
      :confirm-label="blockConfirmButtonLabel"
      :cancel-label="t('admin.users_page.cancel')"
      :confirm-severity="blockConfirmSeverity"
      @confirm="confirmToggleBlock"
    />

    <Dialog
      v-model:visible="showForm"
      modal
      block-scroll
      :header="isEdit ? 'Редактировать пользователя' : 'Создать пользователя'"
      :style="{ width: '28rem' }"
    >
      <div class="flex flex-col gap-3">
        <div>
          <label class="text-sm block mb-1" :for="ufIds.username">Логин</label>
          <InputText
            :id="ufIds.username"
            v-model="form.username"
            class="w-full"
            :invalid="showUsernameError"
            :pt="
              showUsernameError
                ? { root: { 'aria-describedby': ufIds.errUsername } }
                : undefined
            "
          />
          <p
            v-if="showUsernameError"
            :id="ufIds.errUsername"
            role="alert"
            class="mt-0 text-[11px] leading-3 text-red-500"
          >
            {{ formErrors.username }}
          </p>
        </div>
        <div>
          <label class="text-sm block mb-1" :for="ufIds.email">Email</label>
          <InputText
            :id="ufIds.email"
            v-model="form.email"
            class="w-full"
            :disabled="isEdit"
            :invalid="showEmailError"
            :placeholder="isEdit ? undefined : 'Необязательно'"
            :pt="
              showEmailError ? { root: { 'aria-describedby': ufIds.errEmail } } : undefined
            "
          />
          <p
            v-if="showEmailError"
            :id="ufIds.errEmail"
            role="alert"
            class="mt-0 text-[11px] leading-3 text-red-500"
          >
            {{ formErrors.email }}
          </p>
        </div>
        <div>
          <label class="text-sm block mb-1" :for="ufIds.name">Имя</label>
          <InputText
            :id="ufIds.name"
            v-model="form.name"
            class="w-full"
            :invalid="showNameError"
            :pt="showNameError ? { root: { 'aria-describedby': ufIds.errName } } : undefined"
          />
          <p
            v-if="showNameError"
            :id="ufIds.errName"
            role="alert"
            class="mt-0 text-[11px] leading-3 text-red-500"
          >
            {{ formErrors.name }}
          </p>
        </div>
        <div>
          <label class="text-sm block mb-1" :for="ufIds.lastName">Фамилия</label>
          <InputText
            :id="ufIds.lastName"
            v-model="form.lastName"
            class="w-full"
            placeholder="Необязательно"
          />
        </div>
        <div>
          <label class="text-sm block mb-1" :for="ufIds.password">
            {{ isEdit ? 'Новый пароль (опционально)' : 'Пароль' }}
          </label>
          <Password
            :input-id="ufIds.password"
            v-model="form.password"
            class="block w-full"
            :invalid="showPasswordError"
            input-class="w-full"
            toggleMask
            :feedback="false"
            :pt="
              showPasswordError
                ? { pcInputText: { root: { 'aria-describedby': ufIds.errPassword } } }
                : undefined
            "
          />
          <p
            v-if="showPasswordError"
            :id="ufIds.errPassword"
            role="alert"
            class="mt-0 text-[11px] leading-3 text-red-500"
          >
            {{ formErrors.password }}
          </p>
        </div>
        <div>
          <label class="text-sm block mb-1" :for="ufIds.role">Роль</label>
          <Select
            :input-id="ufIds.role"
            v-model="form.role"
            :options="formRoleOptionsRu"
            option-label="label"
            option-value="value"
            class="w-full"
          />
        </div>
        <div class="flex justify-end gap-2 mt-2">
          <Button type="button" label="Отмена" text @click="showForm = false" />
          <Button
            type="button"
            :label="isEdit ? 'Сохранить' : 'Создать'"
            icon="pi pi-check"
            :disabled="saving || (submitAttempted && !canSaveUser)"
            @click="saveUser"
          />
        </div>
      </div>
    </Dialog>
  </section>
</template>
