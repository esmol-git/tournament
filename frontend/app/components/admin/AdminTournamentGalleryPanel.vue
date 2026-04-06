<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import type { TournamentGalleryImageRow } from '~/types/admin/tournament-gallery'
import { getApiErrorMessage } from '~/utils/apiError'
import AdminDataState from '~/app/components/admin/AdminDataState.vue'
import { useAdminAsyncListState } from '~/composables/admin/useAdminAsyncListState'

const props = defineProps<{
  tournamentId: string
}>()

const { token, authFetch } = useAuth()
const { apiUrl } = useApiUrl()
const toast = useToast()
const { t } = useI18n()

const uploading = ref(false)
const filesInputRef = ref<HTMLInputElement | null>(null)

const { items, loading, error, isEmpty, run, retry, clearError } =
  useAdminAsyncListState<TournamentGalleryImageRow>({
    initialLoading: true,
    clearItemsOnError: true,
  })

const galleryEmptyDescription = computed(
  () => `${t('admin.gallery.empty_lead')} ${t('admin.gallery.empty_hint')}`,
)

const MAX_BYTES = 15 * 1024 * 1024

const fetchItems = async () => {
  if (!token.value || !props.tournamentId) {
    loading.value = false
    items.value = []
    clearError()
    return
  }
  await run(async () => {
    items.value = await authFetch<TournamentGalleryImageRow[]>(
      apiUrl(`/tournaments/${props.tournamentId}/gallery`),
      { headers: { Authorization: `Bearer ${token.value}` } },
    )
  })
}

watch(
  () => props.tournamentId,
  (id) => {
    if (!id) {
      items.value = []
      loading.value = false
      clearError()
      return
    }
    items.value = []
    void fetchItems()
  },
  { immediate: true },
)

const skeletonTileIds = Array.from({ length: 6 }, (_, i) => `sk-g-${i}`)

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
      await authFetch(apiUrl(`/tournaments/${props.tournamentId}/gallery`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token.value}` },
        body: { imageUrl: res.url },
      })
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
  await authFetch(apiUrl(`/tournaments/${props.tournamentId}/gallery/reorder`), {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token.value}` },
    body: { imageIds },
  })
  await fetchItems()
}

async function moveUp(id: string) {
  const idx = items.value.findIndex((x) => x.id === id)
  if (idx <= 0) return
  const ids = items.value.map((x) => x.id)
  const prev = ids[idx - 1]!
  const cur = ids[idx]!
  ids[idx - 1] = cur
  ids[idx] = prev
  await reorder(ids)
}

async function moveDown(id: string) {
  const idx = items.value.findIndex((x) => x.id === id)
  if (idx < 0 || idx >= items.value.length - 1) return
  const ids = items.value.map((x) => x.id)
  const next = ids[idx + 1]!
  const cur = ids[idx]!
  ids[idx + 1] = cur
  ids[idx] = next
  await reorder(ids)
}

async function saveCaption(row: TournamentGalleryImageRow) {
  if (!token.value) return
  try {
    await authFetch(
      apiUrl(`/tournaments/${props.tournamentId}/gallery/${row.id}`),
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

const remove = async (row: TournamentGalleryImageRow) => {
  if (!token.value) return
  if (!confirm(t('admin.gallery.delete_confirm'))) return
  try {
    await authFetch(apiUrl(`/tournaments/${props.tournamentId}/gallery/${row.id}`), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token.value}` },
    })
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
      :empty-title="t('admin.gallery.empty_title')"
      :empty-description="galleryEmptyDescription"
      empty-icon="pi pi-images"
      :error-title="t('admin.gallery.load_error')"
      :content-card="false"
      @retry="retry"
    >
      <template #loading>
        <div
          class="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4"
          aria-busy="true"
        >
          <div
            v-for="(skId, skIdx) in skeletonTileIds"
            :key="skId"
            class="gallery-skel-tile overflow-hidden rounded-2xl border border-surface-200/90 bg-surface-0 shadow-sm dark:border-surface-700 dark:bg-surface-900"
            :style="{ animationDelay: `${skIdx * 70}ms` }"
          >
            <div
              class="gallery-skel-shimmer relative aspect-square w-full overflow-hidden bg-surface-100 dark:bg-surface-800"
            >
              <Skeleton width="100%" height="100%" border-radius="0" animation="wave" />
            </div>
            <div class="space-y-2.5 p-3">
              <Skeleton height="2.25rem" width="100%" border-radius="0.5rem" animation="wave" />
              <div class="flex justify-between gap-2 pt-0.5">
                <Skeleton width="5rem" height="2rem" border-radius="0.5rem" animation="wave" />
                <Skeleton shape="circle" width="2rem" height="2rem" animation="wave" />
              </div>
            </div>
          </div>
        </div>
      </template>
      <div class="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        <article
          v-for="data in items"
          :key="data.id"
          class="flex flex-col overflow-hidden rounded-xl border border-surface-200 bg-surface-0 shadow-sm dark:border-surface-700 dark:bg-surface-900"
        >
          <div class="aspect-square overflow-hidden bg-surface-100 dark:bg-surface-800">
            <RemoteImage :src="data.imageUrl" alt="" class="h-full w-full" />
          </div>
          <div class="flex flex-1 flex-col gap-2 p-3">
            <label class="text-[11px] font-medium text-muted-color">{{
              t('admin.gallery.col_caption')
            }}</label>
            <InputText
              class="w-full text-sm"
              :model-value="data.caption ?? ''"
              :placeholder="t('admin.gallery.caption_placeholder')"
              @update:model-value="(v) => { data.caption = v || null }"
              @blur="saveCaption(data)"
            />
            <div
              class="mt-auto flex items-center justify-between gap-2 border-t border-surface-100 pt-2 dark:border-surface-800"
            >
              <div class="flex gap-0">
                <Button
                  v-tooltip.top="t('admin.gallery.move_up')"
                  icon="pi pi-arrow-up"
                  text
                  rounded
                  size="small"
                  :disabled="items[0]?.id === data.id"
                  @click="moveUp(data.id)"
                />
                <Button
                  v-tooltip.top="t('admin.gallery.move_down')"
                  icon="pi pi-arrow-down"
                  text
                  rounded
                  size="small"
                  :disabled="items[items.length - 1]?.id === data.id"
                  @click="moveDown(data.id)"
                />
              </div>
              <Button
                v-tooltip.top="t('admin.gallery.delete_photo')"
                icon="pi pi-trash"
                text
                rounded
                severity="danger"
                size="small"
                @click="remove(data)"
              />
            </div>
          </div>
        </article>
      </div>
    </AdminDataState>
  </div>
</template>

<style scoped>
.gallery-skel-tile {
  animation: gallery-skel-rise 0.55s cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes gallery-skel-rise {
  from {
    opacity: 0;
    transform: translateY(12px) scale(0.985);
  }
  to {
    opacity: 1;
    transform: none;
  }
}

/* Чуть мягче и длиннее волна PrimeVue внутри плиток */
.gallery-skel-shimmer :deep(.p-skeleton::after) {
  animation-duration: 1.35s;
}
</style>
