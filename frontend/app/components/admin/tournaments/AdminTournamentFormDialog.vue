<script setup lang="ts">
const props = defineProps<{
  visible: boolean
  isEdit: boolean
  saving: boolean
  submitAttempted: boolean
  canSave: boolean
}>()

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void
  (e: 'save'): void
  (e: 'cancel'): void
}>()
</script>

<template>
  <Dialog
    :visible="props.visible"
    @update:visible="(v) => emit('update:visible', v)"
    modal
    :header="props.isEdit ? 'Редактировать турнир' : 'Создать турнир'"
    :style="{ width: '46rem', maxWidth: 'min(46rem, calc(100vw - 2rem))' }"
    :contentStyle="{ paddingTop: '1.75rem' }"
  >
    <slot />
    <template #footer>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="ml-auto flex items-center gap-2">
          <Button label="Отмена" text @click="emit('cancel')" />
          <Button
            :label="props.isEdit ? 'Сохранить' : 'Создать'"
            icon="pi pi-check"
            :loading="props.saving"
            :disabled="props.saving || (props.submitAttempted && !props.canSave)"
            @click="emit('save')"
          />
        </div>
      </div>
    </template>
  </Dialog>
</template>
