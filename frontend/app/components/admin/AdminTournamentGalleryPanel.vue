<script setup lang="ts">
import { ref, watch } from 'vue'
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import type { TournamentGalleryImageRow } from '~/types/admin/tournament-gallery'
import { getApiErrorMessage } from '~/utils/apiError'

const props = defineProps<{
  tournamentId: string
}>()

const { token, authFetch } = useAuth()
const { apiUrl } = useApiUrl()
const toast = useToast()
const { t } = useI18n()

const loading = ref(true)
const uploading = ref(false)
const items = ref<TournamentGalleryImageRow[]>([])
const filesInputRef = ref<HTMLInputElement | null>(null)

const MAX_BYTES = 15 * 1024 * 1024

const fetchItems = async () => {
  if (!token.value || !props.tournamentId) return
  loading.value = true
  try {
    items.value = await authFetch<TournamentGalleryImageRow[]>(
      apiUrl(`/tournaments/${props.tournamentId}/gallery`),
      { headers: { Authorization: `Bearer ${token.value}` } },
    )
  } catch (e: unknown) {
    toast.add({
      severity: 'error',
      summary: t('admin.gallery.load_error'),
      detail: getApiErrorMessage(e),
      life: 6000,
    })
    items.value = []
  } finally {
    loading.value = false
  }
}

watch(
  () => props.tournamentId,
  (id) => {
    if (!id) {
      items.value = []
      loading.value = false
      return
    }
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
    <div class="flex flex-wrap items-center gap-2">
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
        :disabled="uploading"
        @click="openFilePicker"
      />
    </div>

    <DataTable :value="items" data-key="id" :loading="loading" striped-rows>
      <Column :header="t('admin.gallery.col_preview')" style="width: 5rem">
        <template #body="{ data }">
          <div
            class="h-14 w-14 overflow-hidden rounded border border-surface-200 bg-surface-100 dark:border-surface-600"
          >
            <img :src="data.imageUrl" alt="" class="h-full w-full object-cover" />
          </div>
        </template>
      </Column>
      <Column :header="t('admin.gallery.col_caption')">
        <template #body="{ data }">
          <InputText
            class="w-full max-w-md"
            :model-value="data.caption ?? ''"
            :placeholder="t('admin.gallery.caption_placeholder')"
            @update:model-value="(v) => { data.caption = v || null }"
            @blur="saveCaption(data)"
          />
        </template>
      </Column>
      <Column :header="t('admin.gallery.col_order')" style="width: 8rem">
        <template #body="{ data }">
          <div class="flex gap-1">
            <Button
              icon="pi pi-arrow-up"
              text
              rounded
              size="small"
              :disabled="items[0]?.id === data.id"
              @click="moveUp(data.id)"
            />
            <Button
              icon="pi pi-arrow-down"
              text
              rounded
              size="small"
              :disabled="items[items.length - 1]?.id === data.id"
              @click="moveDown(data.id)"
            />
          </div>
        </template>
      </Column>
      <Column header="" style="width: 4rem" body-class="!text-end">
        <template #body="{ data }">
          <Button
            icon="pi pi-trash"
            text
            rounded
            severity="danger"
            @click="remove(data)"
          />
        </template>
      </Column>
      <template #empty>
        <div class="py-10 text-center text-muted-color">{{ t('admin.gallery.empty') }}</div>
      </template>
    </DataTable>
  </div>
</template>
