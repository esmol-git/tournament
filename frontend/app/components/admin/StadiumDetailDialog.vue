<script setup lang="ts">
import { computed } from 'vue'
import type { StadiumRow } from '~/types/admin/stadium'
import { stadiumSurfaceTypeLabel } from '~/utils/stadiumSurfaceType'
import ImageCarousel from '~/app/components/admin/ImageCarousel.vue'

const props = defineProps<{
  stadium: StadiumRow | null
}>()

const visible = defineModel<boolean>('visible', { default: false })

const { t } = useI18n()

const images = computed(() => props.stadium?.galleryImages ?? [])
const hasImages = computed(() => images.value.length > 0)
const surfaceLabel = computed(() =>
  props.stadium
    ? stadiumSurfaceTypeLabel(props.stadium.surfaceType, props.stadium.surface, t)
    : '—',
)
</script>

<template>
  <Dialog
    v-model:visible="visible"
    modal
    :header="stadium?.name || t('admin.stadiums.detail_title')"
    :style="{ width: '42rem', maxWidth: '95vw' }"
  >
    <div v-if="stadium" class="flex flex-col gap-4">
      <ImageCarousel v-if="hasImages" :images="images" />

      <dl class="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt class="text-muted-color">{{ t('admin.stadiums.field_city') }}</dt>
          <dd class="font-medium text-surface-900 dark:text-surface-0">{{ stadium.city || '—' }}</dd>
        </div>
        <div>
          <dt class="text-muted-color">{{ t('admin.stadiums.field_address') }}</dt>
          <dd class="font-medium text-surface-900 dark:text-surface-0">{{ stadium.address || '—' }}</dd>
        </div>
        <div>
          <dt class="text-muted-color">{{ t('admin.stadiums.field_surface') }}</dt>
          <dd class="font-medium text-surface-900 dark:text-surface-0">{{ surfaceLabel }}</dd>
        </div>
        <div>
          <dt class="text-muted-color">{{ t('admin.stadiums.field_pitch_count') }}</dt>
          <dd class="font-medium text-surface-900 dark:text-surface-0">{{ stadium.pitchCount ?? '—' }}</dd>
        </div>
        <div>
          <dt class="text-muted-color">{{ t('admin.stadiums.field_capacity') }}</dt>
          <dd class="font-medium text-surface-900 dark:text-surface-0">{{ stadium.capacity ?? '—' }}</dd>
        </div>
        <div v-if="stadium.region?.name" class="sm:col-span-2">
          <dt class="text-muted-color">{{ t('admin.stadiums.field_region') }}</dt>
          <dd class="font-medium text-surface-900 dark:text-surface-0">{{ stadium.region.name }}</dd>
        </div>
        <div v-if="stadium.note" class="sm:col-span-2">
          <dt class="text-muted-color">{{ t('admin.stadiums.field_note') }}</dt>
          <dd class="whitespace-pre-wrap text-surface-800 dark:text-surface-100">{{ stadium.note }}</dd>
        </div>
      </dl>
    </div>
  </Dialog>
</template>
