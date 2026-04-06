<script setup lang="ts">
/**
 * Подтверждение действий вместо window.confirm (PrimeVue Dialog).
 */
import { computed, useId } from 'vue'

const visible = defineModel<boolean>({ default: false })

withDefaults(
  defineProps<{
    title: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
    /** danger — удаление; warn — открепление и др. */
    confirmSeverity?: 'danger' | 'warn' | 'secondary'
  }>(),
  {
    confirmLabel: 'Удалить',
    cancelLabel: 'Отмена',
    confirmSeverity: 'danger',
  },
)

const emit = defineEmits<{ confirm: [] }>()

const confirmMessageId = useId()
const confirmDialogPt = computed(() => ({
  root: { 'aria-describedby': confirmMessageId },
}))

function onConfirm() {
  visible.value = false
  emit('confirm')
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    block-scroll
    :header="title"
    :style="{ width: '26rem' }"
    :draggable="false"
    :pt="confirmDialogPt"
    @update:visible="(v) => (visible = v)"
  >
    <p :id="confirmMessageId" class="mb-4 text-sm text-muted-color whitespace-pre-wrap">
      {{ message }}
    </p>
    <div class="flex justify-end gap-2">
      <Button type="button" :label="cancelLabel" text class="px-3 py-2" @click="visible = false" />
      <Button
        type="button"
        :label="confirmLabel"
        :severity="confirmSeverity"
        class="px-3 py-2"
        @click="onConfirm"
      />
    </div>
  </Dialog>
</template>
