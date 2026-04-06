<script setup lang="ts">
/* eslint-disable vue/no-mutating-props -- form и ref logoFileInput — общие с родителем (useAdminTournamentFormLogo) */
import type { TournamentFormModel } from '~/composables/admin/useTournamentForm'
import { adminTooltip } from '~/utils/adminTooltip'
import type { Ref } from 'vue'

type TemplateOption = { label: string; value: string }

const props = defineProps<{
  form: TournamentFormModel
  isEdit: boolean
  templateSelectOptions: TemplateOption[]
  tournamentTemplatesLoading: boolean
  /** ref на скрытый input файла — тот же, что в `useAdminTournamentFormLogo` */
  logoFileInput: Ref<HTMLInputElement | null>
  logoUploading: boolean
  logoRemoving: boolean
  tournamentSlugGenerated: string
  showNameError: boolean
  nameErrorMessage: string
}>()

const createTemplateId = defineModel<string>('createTemplateId', { required: true })

const emit = defineEmits<{
  templatePick: [value: string | null | undefined]
  logoPick: []
  removeLogo: [event?: MouseEvent]
  logoFileChange: [event: Event]
}>()

const { t } = useI18n()

function setLogoInputEl(el: unknown) {
  props.logoFileInput.value = (el as HTMLInputElement | null) ?? null
}

function onTemplateSelect(v: string | null | undefined) {
  createTemplateId.value = v ?? ''
  emit('templatePick', v)
}
</script>

<template>
  <section
    class="rounded-xl border border-surface-200 bg-surface-0 p-4 shadow-sm dark:border-surface-700 dark:bg-surface-900 md:p-5"
  >
    <h3 class="mb-4 text-xs font-semibold uppercase tracking-wide text-muted-color">
      {{ t('admin.tournament_templates.section_main') }}
    </h3>
    <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
      <div v-if="!isEdit" class="space-y-1 md:col-span-2">
        <div class="flex items-center gap-1.5">
          <label
            for="t_template"
            class="text-sm font-medium text-surface-900 dark:text-surface-0"
          >
            {{ t('admin.tournament_templates.label') }}
          </label>
          <button
            type="button"
            class="inline-flex shrink-0 rounded-full p-0.5 text-muted-color hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/35"
            :aria-label="t('admin.tournament_templates.hint')"
            v-tooltip.top="adminTooltip(t('admin.tournament_templates.hint'))"
            @click.prevent
          >
            <i class="pi pi-info-circle text-sm" aria-hidden="true" />
          </button>
        </div>
        <Select
          input-id="t_template"
          :model-value="createTemplateId"
          :options="templateSelectOptions"
          option-label="label"
          option-value="value"
          :loading="tournamentTemplatesLoading"
          :show-clear="true"
          class="w-full md:max-w-xl"
          :placeholder="t('admin.tournament_templates.none')"
          :pt="
            !isEdit
              ? {
                  label: {
                    autofocus: true,
                  },
                }
              : undefined
          "
          @update:model-value="onTemplateSelect"
        />
      </div>

      <div class="space-y-3 md:col-span-1">
        <div
          class="relative overflow-hidden rounded-xl border border-surface-200 bg-surface-100 dark:border-surface-600 dark:bg-surface-800"
        >
          <button
            type="button"
            class="relative block aspect-[4/3] w-full"
            :class="logoUploading || logoRemoving ? 'cursor-wait opacity-80' : 'cursor-pointer'"
            :disabled="logoUploading || logoRemoving"
            :aria-label="t('admin.tournament_form.logo_aria_upload')"
            @click="emit('logoPick')"
          >
            <RemoteImage
              v-if="form.logoUrl && !logoUploading && !logoRemoving"
              :src="form.logoUrl"
              :alt="t('admin.tournament_form.logo_alt')"
              placeholder-icon="image"
              :lazy="false"
              class="absolute inset-0 z-0 h-full w-full rounded-xl"
            />
            <div
              v-else-if="!logoUploading && !logoRemoving"
              class="absolute inset-0 flex flex-col items-center justify-center gap-2 px-3 text-center text-muted-color"
            >
              <i class="pi pi-image text-3xl opacity-60" aria-hidden="true" />
              <span class="text-xs">{{ t('admin.tournament_form.logo_hint_click') }}</span>
            </div>
            <div
              v-if="logoUploading || logoRemoving"
              class="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-surface-0/90 text-sm text-surface-700 dark:bg-surface-900/90 dark:text-surface-200"
            >
              <i class="pi pi-spin pi-spinner text-2xl" aria-hidden="true" />
              <span>{{
                logoRemoving
                  ? t('admin.tournament_form.logo_state_removing')
                  : t('admin.tournament_form.logo_state_uploading')
              }}</span>
            </div>
          </button>
        </div>

        <div v-if="form.logoUrl && !logoUploading && !logoRemoving" class="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            icon="pi pi-trash"
            :label="t('admin.tournament_form.logo_remove_label')"
            text
            severity="danger"
            @click="emit('removeLogo', $event)"
          />
        </div>

        <input
          type="file"
          accept="image/*"
          class="hidden"
          :ref="setLogoInputEl"
          @change="emit('logoFileChange', $event)"
        />
      </div>

      <div class="space-y-4 md:col-span-1">
        <div class="space-y-0.5">
          <FloatLabel variant="on" class="block">
            <InputText
              id="t_name"
              v-model="form.name"
              class="w-full"
              :invalid="showNameError"
              :pt="
                isEdit
                  ? {
                      root: {
                        autofocus: true,
                      },
                    }
                  : undefined
              "
            />
            <label for="t_name">{{ t('admin.tournament_form.field_name') }}</label>
          </FloatLabel>
          <p v-if="showNameError" class="text-[11px] leading-3 text-red-500">
            {{ nameErrorMessage }}
          </p>
        </div>

        <FloatLabel variant="on" class="block">
          <InputText
            id="t_slug"
            :model-value="tournamentSlugGenerated"
            readonly
            tabindex="-1"
            class="w-full cursor-default bg-surface-50 font-mono text-sm dark:bg-surface-900"
          />
          <label for="t_slug">{{ t('admin.tournament_form.field_slug_auto') }}</label>
        </FloatLabel>

        <FloatLabel variant="on" class="block">
          <DatePicker
            inputId="t_startsAt"
            v-model="form.startsAt"
            class="w-full"
            dateFormat="yy-mm-dd"
            showIcon
          />
          <label for="t_startsAt">{{ t('admin.tournament_form.field_starts_at') }}</label>
        </FloatLabel>

        <FloatLabel variant="on" class="block">
          <DatePicker
            inputId="t_endsAt"
            v-model="form.endsAt"
            class="w-full"
            dateFormat="yy-mm-dd"
            showIcon
          />
          <label for="t_endsAt">{{ t('admin.tournament_form.field_ends_at') }}</label>
        </FloatLabel>
      </div>
    </div>
  </section>
</template>
