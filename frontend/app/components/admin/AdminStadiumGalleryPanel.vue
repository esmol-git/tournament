<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { useTenantId } from '~/composables/useTenantId'
import type { StadiumGalleryImageRow } from '~/types/admin/stadium-gallery'
import { getApiErrorMessage } from '~/utils/apiError'
import AdminDataState from '~/app/components/admin/AdminDataState.vue'
import { useAdminAsyncListState } from '~/composables/admin/useAdminAsyncListState'

const props = defineProps<{
  stadiumId: string
}>()

const { token, authFetch } = useAuth()
const { apiUrl } = useApiUrl()
const tenantId = useTenantId()
const toast = useToast()
const { t } = useI18n()

const uploading = ref(false)
const filesInputRef = ref<HTMLInputElement | null>(null)

const { items, loading, error, isEmpty, run, retry } =
  useAdminAsyncListState<StadiumGalleryImageRow>({
    initialLoading: true,
    clearItemsOnError: true,
  })

const galleryEmptyDescription = computed(
  () => `${t('admin.stadiums.gallery_empty_lead')} ${t('admin.stadiums.gallery_empty_hint')}`,
)

const MAX_BYTES = 15 * 1024 * 1024

const fetchItems = async () => {
  if (!token.value || !props.stadiumId) {
    loading.value = false
    items.value = []
    return
  }
  await run(async () => {
    items.value = await authFetch<StadiumGalleryImageRow[]>(
      apiUrl(`/tenants/${tenantId.value}/stadiums/${props.stadiumId}/gallery`),
      { headers: { Authorization: `Bearer ${token.value}` } },
    )
  })
}

watch(
  () => props.stadiumId,
  (id) => {
    if (!id) {
      items.value = []
      loading.value = false
      return
    }
    items.value = []
    void fetchItems()
  },
  { immediate: true },
)

function openFilePicker() {
  filesInputRef.value?.click()
}

async function onFilesSelected(e: Event) {
  const target = e.target as HTMLInputElement
  const files = target.files
  if (!files?.length || !token.value) {
    if (target) target.value = ''
    return
  }
  const list = Array.from(files)
  for (const file of list) {
    if (file.size > MAX_BYTES) {
      toast.add({
        severity: 'warn',
        summary: t('admin.gallery.file_too_large'),
        detail: t('admin.gallery.max_size'),
        life: 5000,
      })
      target.value = ''
      return
    }
  }
  uploading.value = true
  try {
    let ok = 0
    for (const file of list) {
      const body = new FormData()
      body.append('file', file)
      const res = await authFetch<{ url: string }>(apiUrl('/upload?folder=gallery'), {
        method: 'POST',
        body,
      })
      await authFetch(
        apiUrl(`/tenants/${tenantId.value}/stadiums/${props.stadiumId}/gallery`),
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token.value}` },
          body: { imageUrl: res.url },
        },
      )
      ok += 1
    }
    await fetchItems()
    toast.add({
      severity: 'success',
      summary: t('admin.gallery.uploaded_n', { n: ok }),
      life: 3500,
    })
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: t('admin.gallery.upload_error'),
      detail: getApiErrorMessage(e),
      life: 6000,
    })
  } finally {
    uploading.value = false
    target.value = ''
  }
}

async function reorder(imageIds: string[]) {
  if (!token.value) return
  await authFetch(
    apiUrl(`/tenants/${tenantId.value}/stadiums/${props.stadiumId}/gallery/reorder`),
    {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token.value}` },
      body: { imageIds },
    },
  )
  await fetchItems()
}

async function moveUp(id: string) {
  const idx = items.value.findIndex((x) => x.id === id)
  if (idx <= 0) return
  const ids = items.value.map((x) => x.id)
  ;[ids[idx - 1], ids[idx]] = [ids[idx]!, ids[idx - 1]!]
  await reorder(ids)
}

async function moveDown(id: string) {
  const idx = items.value.findIndex((x) => x.id === id)
  if (idx < 0 || idx >= items.value.length - 1) return
  const ids = items.value.map((x) => x.id)
  ;[ids[idx + 1], ids[idx]] = [ids[idx]!, ids[idx + 1]!]
  await reorder(ids)
}

async function saveCaption(row: StadiumGalleryImageRow) {
  if (!token.value) return
  try {
    await authFetch(
      apiUrl(`/tenants/${tenantId.value}/stadiums/${props.stadiumId}/gallery/${row.id}`),
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token.value}` },
        body: { caption: row.caption?.trim() || null },
      },
    )
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: t('admin.gallery.caption_error'),
      detail: getApiErrorMessage(e),
      life: 5000,
    })
  }
}

async function remove(row: StadiumGalleryImageRow) {
  if (!token.value) return
  if (!confirm(t('admin.gallery.delete_confirm'))) return
  try {
    await authFetch(
      apiUrl(`/tenants/${tenantId.value}/stadiums/${props.stadiumId}/gallery/${row.id}`),
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token.value}` },
      },
    )
    await fetchItems()
    toast.add({ severity: 'success', summary: t('admin.gallery.deleted'), life: 2500 })
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: t('admin.gallery.delete_error'),
      detail: getApiErrorMessage(e),
      life: 6000,
    })
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="admin-toolbar-responsive flex flex-wrap items-center gap-2">
      <input
        ref="filesInputRef"
        type="file"
        accept="image/*"
        multiple
        class="hidden"
        @change="onFilesSelected"
      />
      <Button
        :label="t('admin.gallery.add_photos')"
        icon="pi pi-images"
        :loading="uploading"
        :disabled="uploading || loading"
        @click="openFilePicker"
      />
    </div>

    <AdminDataState
      :loading="loading"
      :error="error"
      :empty="isEmpty"
      :empty-title="t('admin.stadiums.gallery_empty_title')"
      :empty-description="galleryEmptyDescription"
      empty-icon="pi pi-images"
      :error-title="t('admin.gallery.load_error')"
      :content-card="false"
      @retry="retry"
    >
      <div class="grid grid-cols-2 gap-4 md:grid-cols-3">
        <article
          v-for="data in items"
          :key="data.id"
          class="flex flex-col overflow-hidden rounded-xl border border-surface-200 bg-surface-0 shadow-sm dark:border-surface-700 dark:bg-surface-900"
        >
          <div class="aspect-square overflow-hidden bg-surface-100 dark:bg-surface-800">
            <RemoteImage :src="data.imageUrl" alt="" class="h-full w-full object-cover" />
          </div>
          <div class="flex flex-1 flex-col gap-2 p-3">
            <InputText
              class="w-full text-sm"
              :model-value="data.caption ?? ''"
              :placeholder="t('admin.gallery.caption_placeholder')"
              @update:model-value="(v) => { data.caption = v || null }"
              @blur="saveCaption(data)"
            />
            <div class="mt-auto flex items-center justify-between gap-2">
              <div class="flex gap-1">
                <Button icon="pi pi-arrow-up" text rounded size="small" @click="moveUp(data.id)" />
                <Button icon="pi pi-arrow-down" text rounded size="small" @click="moveDown(data.id)" />
              </div>
              <Button icon="pi pi-trash" text rounded severity="danger" size="small" @click="remove(data)" />
            </div>
          </div>
        </article>
      </div>
    </AdminDataState>
  </div>
</template>
