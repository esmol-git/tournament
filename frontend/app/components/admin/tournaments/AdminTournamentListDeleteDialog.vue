<script setup lang="ts">
import { computed, useId } from 'vue'
import type { TournamentRow } from '~/types/admin/tournaments-index'

const visible = defineModel<boolean>('visible', { required: true })

defineProps<{
  deleteSaving: boolean
  deleteTarget: TournamentRow | null
}>()

const emit = defineEmits<{
  hide: []
  archive: []
  'confirm-delete': []
}>()

const { t } = useI18n()

const deleteDialogBodyId = useId()
const deleteDialogPt = computed(() => ({
  root: { 'aria-describedby': deleteDialogBodyId },
}))
</script>

<template>
  <Dialog
    :visible="visible"
    @update:visible="(v) => (visible = v)"
    modal
    block-scroll
    :pt="deleteDialogPt"
    :header="t('admin.tournaments_list.delete_dialog_title')"
    :style="{ width: '24rem' }"
    :closable="!deleteSaving"
    @hide="emit('hide')"
  >
    <div :id="deleteDialogBodyId">
      <p v-if="deleteTarget" class="text-sm text-surface-700 dark:text-surface-200">
        {{
          t('admin.tournaments_list.delete_dialog_detail', {
            name: deleteTarget.name,
          })
        }}
      </p>
      <p class="mt-2 text-sm text-surface-600 dark:text-surface-300">
        {{ t('admin.tournaments_list.delete_dialog_archive_hint') }}
      </p>
    </div>
    <template #footer>
      <div class="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          :label="t('admin.tournaments_list.delete_dialog_cancel')"
          text
          :disabled="deleteSaving"
          @click="visible = false"
        />
        <Button
          type="button"
          :label="t('admin.tournaments_list.delete_dialog_archive')"
          icon="pi pi-box"
          severity="secondary"
          :disabled="deleteSaving || deleteTarget?.status === 'ARCHIVED'"
          :loading="deleteSaving"
          @click="emit('archive')"
        />
        <Button
          type="button"
          :label="t('admin.tournaments_list.delete_dialog_delete')"
          icon="pi pi-trash"
          severity="danger"
          :loading="deleteSaving"
          @click="emit('confirm-delete')"
        />
      </div>
    </template>
  </Dialog>
</template>
