<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

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

const { t } = useI18n()

/** Синхронно с мобильными стилями диалога (max-width: 639px в tailwind.css). */
const isNarrowScreen = ref(false)
let narrowMql: MediaQueryList | null = null

function syncNarrowScreen() {
  isNarrowScreen.value = narrowMql?.matches ?? false
}

onMounted(() => {
  if (!import.meta.client) return
  narrowMql = window.matchMedia('(max-width: 639px)')
  syncNarrowScreen()
  narrowMql.addEventListener('change', syncNarrowScreen)
})

onBeforeUnmount(() => {
  narrowMql?.removeEventListener('change', syncNarrowScreen)
})

const primarySaveLabel = computed(() => {
  if (isNarrowScreen.value) return t('admin.tournament_form.dialog_btn_save')
  return props.isEdit
    ? t('admin.tournament_form.dialog_btn_save')
    : t('admin.tournament_form.dialog_btn_create')
})

const primarySaveIcon = computed(() => (isNarrowScreen.value ? undefined : 'pi pi-check'))

/** Первый осмысленный контрол в форме (шаблон при создании, название при редактировании). */
function focusFirstFormField() {
  if (!import.meta.client) return
  nextTick(() => {
    const byId = (id: string) => document.getElementById(id) as HTMLElement | null
    const el = props.isEdit ? byId('t_name') : byId('t_template')
    el?.focus()
  })
}
</script>

<template>
  <Dialog
    :visible="props.visible"
    @update:visible="(v) => emit('update:visible', v)"
    @show="focusFirstFormField"
    modal
    block-scroll
    :header="
      props.isEdit
        ? t('admin.tournament_form.dialog_title_edit')
        : t('admin.tournament_form.dialog_title_create')
    "
    :style="{ width: '46rem', maxWidth: 'min(46rem, calc(100vw - 2rem))' }"
    :contentStyle="{ paddingTop: '1.75rem' }"
  >
    <slot />
    <template #footer>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div class="ml-auto flex items-center gap-2">
          <Button
            type="button"
            :label="t('admin.tournament_form.dialog_btn_cancel')"
            text
            @click="emit('cancel')"
          />
          <Button
            type="button"
            :label="primarySaveLabel"
            :icon="primarySaveIcon"
            :loading="props.saving"
            :disabled="props.saving || (props.submitAttempted && !props.canSave)"
            @click="emit('save')"
          />
        </div>
      </div>
    </template>
  </Dialog>
</template>
