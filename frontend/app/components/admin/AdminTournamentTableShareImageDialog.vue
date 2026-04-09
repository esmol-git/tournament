<script setup lang="ts">
/**
 * Экспорт турнирной таблицы в PNG для соцсетей: фон (пресет или своё фото) + таблица.
 */
import { toBlob } from 'html-to-image'
import type { TableRow } from '~/types/tournament-admin'
import {
  computed,
  nextTick,
  onBeforeUnmount,
  ref,
  watch,
} from 'vue'
import { useAuth } from '~/composables/useAuth'
import { useApiUrl } from '~/composables/useApiUrl'
import { adminTooltip } from '~/utils/adminTooltip'
import { canCopyImageToClipboard, copyPngBlobToClipboard } from '~/utils/shareImageClipboard'

const props = withDefaults(
  defineProps<{
    visible: boolean
    tournamentName: string
    /** Slug для имени файла */
    fileSlug?: string
    /** Плоская таблица (одна группа / общая) */
    flatRows?: TableRow[]
    /** Несколько групп: выбор группы в диалоге */
    groupedTables?: Array<{ groupId: string; groupName: string; rows: TableRow[] }>
    /** Групповой турнир — подсветка зоны выхода в плей-офф; иначе топ-3 с пьедестала */
    isGroupedStandings?: boolean
    /** Число мест из группы в плей-офф (как в таблице на странице турнира) */
    playoffQualifiersPerGroup?: number
  }>(),
  {
    fileSlug: '',
    flatRows: () => [],
    groupedTables: undefined,
    isGroupedStandings: false,
    playoffQualifiersPerGroup: 0,
  },
)

const emit = defineEmits<{
  'update:visible': [value: boolean]
}>()

const { t } = useI18n()
const toast = useToast()
const { authFetch, token } = useAuth()
const { apiUrl } = useApiUrl()

/** Диапазон для «Свой размер» (px) */
const EXPORT_MIN = 360
const EXPORT_MAX = 3840

type ShareAspect = '1:1' | '4:5' | '9:16' | '16:9' | 'custom'

const aspect = ref<ShareAspect>('1:1')
const customExportW = ref(1080)
const customExportH = ref(1080)

watch(aspect, (v, prev) => {
  if (v !== 'custom' || prev === 'custom') return
  if (prev === '16:9') {
    customExportW.value = 1920
    customExportH.value = 1080
    return
  }
  customExportW.value = 1080
  switch (prev) {
    case '1:1':
      customExportH.value = 1080
      break
    case '4:5':
      customExportH.value = 1350
      break
    case '9:16':
      customExportH.value = 1920
      break
    default:
      customExportH.value = 1080
  }
})
const presetId = ref<string>('slate')
const customImageUrl = ref<string | null>(null)
const customFileInput = ref<HTMLInputElement | null>(null)
const captureRef = ref<HTMLElement | null>(null)
const generating = ref(false)
const selectedGroupId = ref('')
/** Основной цвет текста на экспорте (#rrggbb) */
const textColorHex = ref('#ffffff')
/** URL своего логотипа с сервера; null → логотип платформы */
const tenantShareLogoUrl = ref<string | null>(null)
/** Показывать логотип в углу (стартовое значение — из настроек организации) */
const showLogo = ref(true)
/** Акценты из «Публичный сайт» — для пресета фона «цвета бренда» */
const tenantAccentPrimary = ref('#123c67')
const tenantAccentSecondary = ref('#c80a48')

const defaultPlatformLogoSrc = computed(() => {
  if (typeof window === 'undefined') return '/logo.png'
  return new URL('/logo.png', window.location.origin).href
})

const effectiveLogoSrc = computed(() =>
  tenantShareLogoUrl.value ? tenantShareLogoUrl.value : defaultPlatformLogoSrc.value,
)

function clampFontScale(v: unknown): number {
  const n = typeof v === 'number' ? v : Number(v)
  if (!Number.isFinite(n)) return 1
  return Math.min(1.25, Math.max(0.55, n))
}

/** Масштаб шрифта (настройки организации; можно подкрутить перед выгрузкой) */
const exportFontScale = ref(1)

async function loadTenantShareImageSettings() {
  if (!token.value) return
  try {
    const res = await authFetch<{
      shareTableImageLogoUrl?: string | null
      shareTableImageShowLogo?: boolean
      shareTableImageFontScale?: number | null
      publicAccentPrimary?: string | null
      publicAccentSecondary?: string | null
    }>(apiUrl('/users/me/tenant-share-table-image-settings'))
    tenantShareLogoUrl.value = res.shareTableImageLogoUrl?.trim()
      ? res.shareTableImageLogoUrl.trim()
      : null
    showLogo.value = res.shareTableImageShowLogo !== false
    exportFontScale.value = clampFontScale(res.shareTableImageFontScale ?? 1)
    tenantAccentPrimary.value = normalizeHex(
      res.publicAccentPrimary?.trim() || '#123c67',
    )
    tenantAccentSecondary.value = normalizeHex(
      res.publicAccentSecondary?.trim() || '#c80a48',
    )
  } catch {
    tenantShareLogoUrl.value = null
    showLogo.value = true
    exportFontScale.value = 1
    tenantAccentPrimary.value = '#123c67'
    tenantAccentSecondary.value = '#c80a48'
  }
}

const isGrouped = computed(
  () => !!props.groupedTables?.length,
)

const rowsForExport = computed<TableRow[]>(() => {
  if (isGrouped.value && props.groupedTables?.length) {
    const g =
      props.groupedTables.find((x) => x.groupId === selectedGroupId.value) ??
      props.groupedTables[0]
    return g?.rows ?? []
  }
  return props.flatRows ?? []
})

const subtitle = computed(() => {
  if (!isGrouped.value || !props.groupedTables?.length) return ''
  const g = props.groupedTables.find((x) => x.groupId === selectedGroupId.value)
  return g?.groupName ?? ''
})

const groupSelectOptions = computed(() =>
  (props.groupedTables ?? []).map((g) => ({
    label: g.groupName,
    value: g.groupId,
  })),
)

watch(
  () => props.visible,
  (v) => {
    if (v) void loadTenantShareImageSettings()
    if (v && isGrouped.value && props.groupedTables?.length) {
      const first = props.groupedTables[0]
      if (first && !selectedGroupId.value) {
        selectedGroupId.value = first.groupId
      }
    }
  },
)

watch(
  () => props.groupedTables,
  (list) => {
    if (list?.length) {
      const ok = list.some((g) => g.groupId === selectedGroupId.value)
      const first = list[0]
      if (!ok && first) selectedGroupId.value = first.groupId
    }
  },
  { deep: true },
)

const presets = computed(() => {
  const brandA = normalizeHex(tenantAccentPrimary.value)
  const brandB = normalizeHex(tenantAccentSecondary.value)
  return [
  {
    id: 'tenant_brand',
    label: t('admin.tournament_page.table_share_bg_tenant_brand'),
    css: `linear-gradient(145deg, ${brandA} 0%, ${brandB} 52%, ${brandA} 100%)`,
  },
  {
    id: 'slate',
    label: t('admin.tournament_page.table_share_bg_slate'),
    css: 'linear-gradient(145deg, #0f172a 0%, #1e3a5f 45%, #0f172a 100%)',
  },
  {
    id: 'emerald',
    label: t('admin.tournament_page.table_share_bg_emerald'),
    css: 'linear-gradient(145deg, #064e3b 0%, #14532d 50%, #052e16 100%)',
  },
  {
    id: 'violet',
    label: t('admin.tournament_page.table_share_bg_violet'),
    css: 'linear-gradient(145deg, #4c1d95 0%, #5b21b6 45%, #1e1b4b 100%)',
  },
  {
    id: 'sunset',
    label: t('admin.tournament_page.table_share_bg_sunset'),
    css: 'linear-gradient(145deg, #9a3412 0%, #b45309 40%, #7f1d1d 100%)',
  },
  {
    id: 'ice',
    label: t('admin.tournament_page.table_share_bg_ice'),
    css: 'linear-gradient(145deg, #164e63 0%, #0e7490 50%, #155e75 100%)',
  },
  {
    id: 'crimson',
    label: t('admin.tournament_page.table_share_bg_crimson'),
    css: 'linear-gradient(145deg, #450a0a 0%, #7f1d1d 42%, #1c1917 100%)',
  },
  {
    id: 'rose',
    label: t('admin.tournament_page.table_share_bg_rose'),
    css: 'linear-gradient(145deg, #831843 0%, #9d174d 40%, #4c0519 100%)',
  },
  {
    id: 'graphite',
    label: t('admin.tournament_page.table_share_bg_graphite'),
    css: 'linear-gradient(145deg, #1c1917 0%, #292524 50%, #0c0a09 100%)',
  },
  {
    id: 'gold',
    label: t('admin.tournament_page.table_share_bg_gold'),
    css: 'linear-gradient(145deg, #422006 0%, #713f12 45%, #1c1917 100%)',
  },
  {
    id: 'ocean',
    label: t('admin.tournament_page.table_share_bg_ocean'),
    css: 'linear-gradient(145deg, #082f49 0%, #0369a1 48%, #0c4a6e 100%)',
  },
  {
    id: 'forest',
    label: t('admin.tournament_page.table_share_bg_forest'),
    css: 'linear-gradient(145deg, #14532d 0%, #166534 50%, #052e16 100%)',
  },
  ]
})

function clampExportDim(n: unknown): number {
  const x = typeof n === 'number' ? n : Number(n)
  if (!Number.isFinite(x)) return EXPORT_MIN
  return Math.min(EXPORT_MAX, Math.max(EXPORT_MIN, Math.round(x)))
}

const exportWidth = computed(() => {
  if (aspect.value === 'custom') return clampExportDim(customExportW.value)
  if (aspect.value === '16:9') return 1920
  return 1080
})

const exportHeight = computed(() => {
  if (aspect.value === 'custom') return clampExportDim(customExportH.value)
  switch (aspect.value) {
    case '1:1':
      return 1080
    case '4:5':
      return 1350
    case '9:16':
      return 1920
    case '16:9':
      return 1080
    default:
      return 1080
  }
})

const backgroundLayers = computed(() => {
  if (customImageUrl.value) {
    return {
      base: 'transparent',
      image: customImageUrl.value,
    }
  }
  const p = presets.value.find((x) => x.id === presetId.value) ?? presets.value[0]
  return {
    base: p?.css ?? '#0f172a',
    image: null as string | null,
  }
})

/** Базовый размер до масштаба (чем больше команд — тем меньше база) */
const tableFontTierPx = computed(() => {
  const n = rowsForExport.value.length
  if (n > 20) return 17
  if (n > 14) return 20
  if (n > 10) return 24
  return 28
})

const tableFontPx = computed(() =>
  Math.max(10, Math.round(tableFontTierPx.value * exportFontScale.value)),
)

const headerFontPx = computed(() =>
  Math.round((tableFontTierPx.value + 4) * exportFontScale.value),
)

/** Заголовок турнира — крупнее относительно таблицы */
const titleFontPx = computed(() =>
  Math.round((tableFontTierPx.value + 4 + 16) * exportFontScale.value),
)

/** Вертикальные отступы ячеек в такт шрифту */
const tableCellPadY = computed(() =>
  Math.max(6, Math.round(tableFontTierPx.value * 0.4 * exportFontScale.value)),
)
const tableHeadPadB = computed(() =>
  Math.max(8, Math.round(tableFontTierPx.value * 0.45 * exportFontScale.value)),
)

const footerFontPx = computed(() =>
  Math.max(14, Math.round(tableFontTierPx.value * 0.78 * exportFontScale.value)),
)

function normalizeHex(input: string): string {
  let h = input.trim()
  if (!h.startsWith('#')) h = `#${h}`
  if (/^#([0-9a-f]{3})$/i.test(h)) {
    const s = h.slice(1)
    h = `#${s[0]}${s[0]}${s[1]}${s[1]}${s[2]}${s[2]}`
  }
  if (/^#([0-9a-f]{6})$/i.test(h)) return h.toLowerCase()
  return '#ffffff'
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = normalizeHex(hex)
  const n = Number.parseInt(h.slice(1), 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

function rgbaFromHex(hex: string, a: number): string {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${a})`
}

const textColorNormalized = computed(() => normalizeHex(textColorHex.value))

const sharePalette = computed(() => {
  const c = textColorNormalized.value
  return {
    main: c,
    subtitle: rgbaFromHex(c, 0.9),
    footer: rgbaFromHex(c, 0.72),
    borderHeader: rgbaFromHex(c, 0.35),
    borderRow: rgbaFromHex(c, 0.12),
  }
})

function rowPosition(row: TableRow): number | null {
  const p = row.position as unknown
  if (typeof p === 'number' && Number.isFinite(p)) return p
  if (typeof p === 'string') {
    const n = Number.parseInt(p, 10)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/** Нижняя граница строки: у k-й в группе — линия зоны выхода (html-to-image не всегда рисует фон tr) */
function tableRowBottomBorder(row: TableRow): string {
  const pos = rowPosition(row)
  if (props.isGroupedStandings && pos != null) {
    const k = props.playoffQualifiersPerGroup
    if (typeof k === 'number' && k > 0 && pos === k) {
      return '3px solid rgba(34, 197, 94, 1)'
    }
  }
  return `1px solid ${sharePalette.value.borderRow}`
}

/**
 * Подсветка на каждой ячейке (не на tr): иначе в PNG предпросмотр/экспорт часто без фона.
 * Общая таблица — пьедестал 1–3; группы — зона k мест + полоска слева у выходящих.
 */
function shareLeaderCellStyle(row: TableRow, cellIndex: number): Record<string, string> {
  const pos = rowPosition(row)
  if (pos == null || pos < 1) return {}

  const stripe = (color: string): Record<string, string> =>
    cellIndex === 0 ? { borderLeft: `4px solid ${color}` } : {}

  if (props.isGroupedStandings) {
    const k = props.playoffQualifiersPerGroup
    if (typeof k !== 'number' || !Number.isFinite(k) || k <= 0) return {}
    if (pos < k) {
      return {
        backgroundColor: 'rgba(34, 197, 94, 0.32)',
        ...stripe('rgba(34, 197, 94, 0.95)'),
      }
    }
    if (pos === k) {
      return {
        backgroundColor: 'rgba(34, 197, 94, 0.38)',
        ...stripe('rgba(22, 163, 74, 1)'),
      }
    }
    return {}
  }

  if (pos === 1) {
    return {
      backgroundColor: 'rgba(250, 204, 21, 0.42)',
      ...stripe('rgba(234, 179, 8, 0.95)'),
    }
  }
  if (pos === 2) {
    return {
      backgroundColor: 'rgba(226, 232, 240, 0.32)',
      ...stripe('rgba(148, 163, 184, 0.95)'),
    }
  }
  if (pos === 3) {
    return {
      backgroundColor: 'rgba(251, 146, 60, 0.38)',
      ...stripe('rgba(234, 88, 12, 0.95)'),
    }
  }
  return {}
}

const previewContainerRef = ref<HTMLElement | null>(null)
const previewScale = ref(0.28)
let previewResizeObserver: ResizeObserver | null = null

function updatePreviewScale() {
  const el = previewContainerRef.value
  if (!el) return
  const w = el.clientWidth
  const h = el.clientHeight
  if (w < 8 || h < 8) return
  previewScale.value = Math.min(
    w / exportWidth.value,
    h / exportHeight.value,
  )
}

watch(
  [() => props.visible, () => previewContainerRef.value, exportWidth, exportHeight],
  async () => {
    await nextTick()
    previewResizeObserver?.disconnect()
    previewResizeObserver = null
    const el = previewContainerRef.value
    if (!el || !props.visible) return
    previewResizeObserver = new ResizeObserver(() => updatePreviewScale())
    previewResizeObserver.observe(el)
    updatePreviewScale()
  },
  { flush: 'post' },
)

const captureBoxStyle = computed(() => ({
  width: `${exportWidth.value}px`,
  height: `${exportHeight.value}px`,
  fontFamily:
    'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
}))

function close() {
  emit('update:visible', false)
}

function onPickCustomImage() {
  customFileInput.value?.click()
}

function onCustomFileChange(ev: Event) {
  const input = ev.target as HTMLInputElement
  const file = input.files?.[0]
  if (customImageUrl.value) {
    URL.revokeObjectURL(customImageUrl.value)
    customImageUrl.value = null
  }
  if (!file || !file.type.startsWith('image/')) {
    input.value = ''
    return
  }
  customImageUrl.value = URL.createObjectURL(file)
  input.value = ''
}

function clearCustomImage() {
  if (customImageUrl.value) {
    URL.revokeObjectURL(customImageUrl.value)
    customImageUrl.value = null
  }
}

onBeforeUnmount(() => {
  previewResizeObserver?.disconnect()
  clearCustomImage()
})

function safeFileName() {
  const raw = (props.fileSlug || 'tournament').replace(/[^a-zA-Z0-9-_]+/g, '-')
  const d = new Date()
  const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  return `table-${raw}-${stamp}.png`
}

/** html-to-image плохо рисует узлы вне вьюпорта и с отрицательным z-index — на время снимка переносим кадр на экран. */
function applyCaptureExportLayout(el: HTMLElement) {
  const prev = el.style.cssText
  const w = exportWidth.value
  const h = exportHeight.value
  el.style.cssText = [
    prev,
    'position:fixed',
    'left:0',
    'top:0',
    `width:${w}px`,
    `height:${h}px`,
    'z-index:2147483646',
    /** 0.02 оставлял заметный «слой» после restore; в растр клону задаётся opacity в опциях toBlob */
    'opacity:0',
    'pointer-events:none',
    'overflow:hidden',
  ].join(';')
  return () => {
    el.style.cssText = prev
  }
}

const toPngOptions = {
  /** Иначе чтение cssRules с fonts.googleapis.com даёт SecurityError */
  skipFonts: true,
  /**
   * cacheBust добавляет query к любым URL — для blob: (своё фото) это ломает загрузку (ERR_FILE_NOT_FOUND).
   */
  cacheBust: false,
  pixelRatio: 2,
  backgroundColor: '#0f172a',
  style: {
    opacity: '1',
  },
} as const

async function captureExportBlob(): Promise<Blob | null> {
  if (!captureRef.value || rowsForExport.value.length === 0) return null
  await nextTick()
  const el = captureRef.value
  const restore = applyCaptureExportLayout(el)
  try {
    await new Promise<void>((resolve) => {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    })
    return await toBlob(el, toPngOptions)
  } finally {
    restore()
    await nextTick()
  }
}

function setShareAspect(a: ShareAspect) {
  aspect.value = a
}

async function copyImageToClipboard() {
  if (!canCopyImageToClipboard()) {
    toast.add({
      severity: 'warn',
      summary: t('admin.tournament_page.table_share_copy_unsupported'),
      life: 6000,
    })
    return
  }
  if (!captureRef.value || rowsForExport.value.length === 0) return
  generating.value = true
  try {
    const blob = await captureExportBlob()
    if (!blob) throw new Error('toBlob returned null')
    await copyPngBlobToClipboard(blob)
    toast.add({
      severity: 'success',
      summary: t('admin.tournament_page.table_share_copy_success'),
      life: 3500,
    })
  } catch {
    toast.add({
      severity: 'error',
      summary: t('admin.tournament_page.table_share_copy_error'),
      life: 5000,
    })
  } finally {
    generating.value = false
  }
}

async function downloadPng() {
  if (!captureRef.value || rowsForExport.value.length === 0) return
  generating.value = true
  let objectUrl: string | null = null
  try {
    const blob = await captureExportBlob()
    if (!blob) throw new Error('toBlob returned null')
    objectUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objectUrl
    a.download = safeFileName()
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  } catch {
    toast.add({
      severity: 'error',
      summary: t('admin.tournament_page.table_share_error'),
      life: 5000,
    })
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    generating.value = false
  }
}

const aspectOptions = computed(() => [
  { label: t('admin.tournament_page.table_share_aspect_1_1'), value: '1:1' as const },
  { label: t('admin.tournament_page.table_share_aspect_4_5'), value: '4:5' as const },
  { label: t('admin.tournament_page.table_share_aspect_9_16'), value: '9:16' as const },
  { label: t('admin.tournament_page.table_share_aspect_16_9'), value: '16:9' as const },
  { label: t('admin.tournament_page.table_share_aspect_custom'), value: 'custom' as const },
])
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    class="w-[min(100vw-2rem,40rem)]"
    :header="t('admin.tournament_page.table_share_dialog_title')"
    @update:visible="(v: boolean) => emit('update:visible', v)"
  >
    <div class="flex flex-col gap-4 text-sm">
      <p class="text-xs leading-relaxed text-muted-color">
        {{ t('admin.tournament_page.table_share_lead') }}
      </p>

      <div v-if="isGrouped && groupSelectOptions.length" class="space-y-1">
        <label class="text-xs font-medium text-surface-700 dark:text-surface-200">
          {{ t('admin.tournament_page.table_share_group') }}
        </label>
        <Select
          v-model="selectedGroupId"
          :options="groupSelectOptions"
          option-label="label"
          option-value="value"
          class="w-full"
        />
      </div>

      <div class="grid gap-3 sm:grid-cols-2">
        <div class="space-y-1">
          <label class="text-xs font-medium text-surface-700 dark:text-surface-200">
            {{ t('admin.tournament_page.table_share_aspect') }}
          </label>
          <Select
            v-model="aspect"
            :options="aspectOptions"
            option-label="label"
            option-value="value"
            class="w-full"
          />
        </div>
        <div class="space-y-1">
          <label class="text-xs font-medium text-surface-700 dark:text-surface-200">
            {{ t('admin.tournament_page.table_share_background') }}
          </label>
          <Select
            v-model="presetId"
            :options="presets"
            option-label="label"
            option-value="id"
            class="w-full"
            :disabled="!!customImageUrl"
          />
        </div>
      </div>

      <div class="space-y-1">
        <span class="text-xs font-medium text-surface-700 dark:text-surface-200">
          {{ t('admin.tournament_page.table_share_quick_formats') }}
        </span>
        <div class="flex flex-wrap gap-2">
          <Button
            type="button"
            size="small"
            outlined
            severity="secondary"
            :label="t('admin.tournament_page.table_share_quick_square')"
            @click="setShareAspect('1:1')"
          />
          <Button
            type="button"
            size="small"
            outlined
            severity="secondary"
            :label="t('admin.tournament_page.table_share_quick_feed')"
            @click="setShareAspect('4:5')"
          />
          <Button
            type="button"
            size="small"
            outlined
            severity="secondary"
            :label="t('admin.tournament_page.table_share_quick_stories')"
            @click="setShareAspect('9:16')"
          />
          <Button
            type="button"
            size="small"
            outlined
            severity="secondary"
            :label="t('admin.tournament_page.table_share_quick_wide')"
            @click="setShareAspect('16:9')"
          />
        </div>
      </div>

      <div
        v-if="aspect === 'custom'"
        class="grid grid-cols-1 gap-3 sm:grid-cols-2"
      >
        <div class="space-y-1">
          <label
            for="table-share-custom-w"
            class="text-xs font-medium text-surface-700 dark:text-surface-200"
          >
            {{ t('admin.tournament_page.table_share_custom_width') }}
          </label>
          <InputNumber
            id="table-share-custom-w"
            v-model="customExportW"
            class="w-full max-w-full"
            :min="EXPORT_MIN"
            :max="EXPORT_MAX"
            :step="1"
            show-buttons
            button-layout="horizontal"
            @blur="customExportW = clampExportDim(customExportW)"
          />
        </div>
        <div class="space-y-1">
          <label
            for="table-share-custom-h"
            class="text-xs font-medium text-surface-700 dark:text-surface-200"
          >
            {{ t('admin.tournament_page.table_share_custom_height') }}
          </label>
          <InputNumber
            id="table-share-custom-h"
            v-model="customExportH"
            class="w-full max-w-full"
            :min="EXPORT_MIN"
            :max="EXPORT_MAX"
            :step="1"
            show-buttons
            button-layout="horizontal"
            @blur="customExportH = clampExportDim(customExportH)"
          />
        </div>
        <p class="text-xs text-muted-color sm:col-span-2">
          {{ t('admin.tournament_page.table_share_custom_size_hint') }}
        </p>
      </div>

      <div class="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
        <div class="flex min-w-0 flex-col gap-1.5">
          <label
            for="table-share-color-hex"
            class="text-xs font-medium text-surface-700 dark:text-surface-200"
          >
            {{ t('admin.tournament_page.table_share_text_color') }}
          </label>
          <div class="flex flex-wrap items-center gap-2">
            <InputText
              v-model="textColorHex"
              type="color"
              class="h-9 w-12 shrink-0 cursor-pointer p-1"
              :aria-label="t('admin.tournament_page.table_share_text_color')"
            />
            <InputText
              id="table-share-color-hex"
              v-model="textColorHex"
              class="w-[6.75rem] shrink-0 font-mono text-xs"
              placeholder="#ffffff"
              @blur="textColorHex = normalizeHex(textColorHex)"
            />
          </div>
        </div>
        <div class="flex min-w-0 flex-col gap-1.5">
          <div class="flex items-center gap-1.5">
            <label
              id="table-share-font-scale-label"
              for="table-share-font-scale"
              class="text-xs font-medium text-surface-700 dark:text-surface-200"
            >
              {{ t('admin.tournament_page.table_share_font_scale') }}
            </label>
            <span
              v-tooltip.top="adminTooltip(t('admin.tournament_page.table_share_font_scale_hint'))"
              class="inline-flex cursor-help text-muted-color hover:text-surface-600 dark:hover:text-surface-300"
              tabindex="0"
              role="img"
              :aria-label="t('admin.tournament_page.table_share_font_scale_hint')"
            >
              <i class="pi pi-info-circle text-sm leading-none" aria-hidden="true" />
            </span>
          </div>
          <InputNumber
            v-model="exportFontScale"
            input-id="table-share-font-scale"
            class="w-full max-w-[12rem]"
            :min="0.55"
            :max="1.25"
            :step="0.05"
            :min-fraction-digits="2"
            :max-fraction-digits="2"
            show-buttons
            button-layout="horizontal"
            aria-labelledby="table-share-font-scale-label"
          />
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
        <input
          ref="customFileInput"
          type="file"
          accept="image/*"
          class="hidden"
          @change="onCustomFileChange"
        />
        <Button
          type="button"
          size="small"
          outlined
          severity="secondary"
          icon="pi pi-image"
          :label="t('admin.tournament_page.table_share_custom_image')"
          @click="onPickCustomImage"
        />
        <Button
          v-if="customImageUrl"
          type="button"
          size="small"
          text
          severity="secondary"
          :label="t('admin.tournament_page.table_share_clear_image')"
          @click="clearCustomImage"
        />
        <span
          class="hidden h-6 w-px shrink-0 bg-surface-300 dark:bg-surface-600 sm:inline-block"
          aria-hidden="true"
        />
        <div class="flex items-center gap-2">
          <Checkbox
            v-model="showLogo"
            binary
            input-id="table-share-show-logo"
          />
          <label
            for="table-share-show-logo"
            class="cursor-pointer text-sm text-surface-800 dark:text-surface-100"
          >
            {{ t('admin.tournament_page.table_share_show_logo') }}
          </label>
          <span
            v-tooltip.top="adminTooltip(t('admin.tournament_page.table_share_logo_hint'))"
            class="inline-flex cursor-help text-muted-color hover:text-surface-600 dark:hover:text-surface-300"
            tabindex="0"
            role="img"
            :aria-label="t('admin.tournament_page.table_share_logo_hint')"
          >
            <i class="pi pi-info-circle text-sm leading-none" aria-hidden="true" />
          </span>
        </div>
      </div>

      <div
        v-if="rowsForExport.length === 0"
        class="rounded-lg border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
      >
        {{ t('admin.tournament_page.table_share_empty') }}
      </div>

      <!-- Масштабированный предпросмотр = тот же DOM, что уйдёт в PNG (html-to-image) -->
      <div v-else class="space-y-2">
        <label class="text-xs font-medium text-surface-700 dark:text-surface-200">
          {{ t('admin.tournament_page.table_share_preview') }}
        </label>
        <div
          ref="previewContainerRef"
          class="relative w-full overflow-hidden rounded-lg border border-surface-200 bg-surface-950/15 dark:border-surface-700 dark:bg-surface-950/40"
          :style="{ aspectRatio: `${exportWidth} / ${exportHeight}` }"
        >
          <div
            class="pointer-events-none absolute left-1/2 top-1/2"
            :style="{
              width: `${exportWidth}px`,
              height: `${exportHeight}px`,
              transform: `translate(-50%, -50%) scale(${previewScale})`,
            }"
          >
            <div
              v-show="visible"
              ref="captureRef"
              class="pointer-events-none flex flex-col overflow-hidden"
              :style="captureBoxStyle"
              aria-hidden="true"
            >
              <div
                v-if="backgroundLayers.image"
                class="absolute inset-0 bg-cover bg-center"
                :style="{ backgroundImage: `url(${backgroundLayers.image})` }"
              />
              <div
                v-else
                class="absolute inset-0"
                :style="{ background: backgroundLayers.base }"
              />
              <div
                class="absolute inset-0"
                style="background: rgba(0, 0, 0, 0.5)"
              />

              <div
                v-if="showLogo"
                class="pointer-events-none absolute right-6 top-6 z-20 max-w-[28%]"
                style="max-height: 120px"
              >
                <img
                  :src="effectiveLogoSrc"
                  alt=""
                  crossorigin="anonymous"
                  class="ml-auto block h-[72px] max-h-[120px] w-auto max-w-full object-contain object-right drop-shadow-md"
                  draggable="false"
                />
              </div>

              <div
                class="relative z-10 flex h-full min-h-0 flex-col overflow-hidden px-9 py-7"
                :style="{ color: sharePalette.main }"
              >
                <div class="flex min-h-0 flex-1 flex-col overflow-hidden">
                  <div class="shrink-0 text-center">
                    <h2
                      class="font-bold leading-tight tracking-tight"
                      :style="{
                        color: sharePalette.main,
                        fontSize: `${titleFontPx}px`,
                        lineHeight: 1.15,
                      }"
                    >
                      {{ tournamentName }}
                    </h2>
                    <p
                      v-if="subtitle"
                      class="mt-2"
                      :style="{
                        color: sharePalette.subtitle,
                        fontSize: `${headerFontPx}px`,
                        lineHeight: 1.25,
                      }"
                    >
                      {{ subtitle }}
                    </p>
                  </div>

                  <div
                    class="flex min-h-0 flex-1 flex-col justify-center py-5"
                  >
                    <div class="min-h-0 w-full max-h-full overflow-hidden">
                      <table
                        class="w-full table-fixed border-collapse text-left"
                        :style="{
                          color: sharePalette.main,
                          fontSize: `${tableFontPx}px`,
                          lineHeight: 1.35,
                          tableLayout: 'fixed',
                        }"
                      >
                        <colgroup>
                          <col style="width: 4%" />
                          <col style="width: 51%" />
                          <col style="width: 6.5%" />
                          <col style="width: 6%" />
                          <col style="width: 6%" />
                          <col style="width: 6%" />
                          <col style="width: 8.5%" />
                          <col style="width: 6%" />
                          <col style="width: 6%" />
                        </colgroup>
                        <thead>
                          <tr
                            :style="{
                              borderBottom: `1px solid ${sharePalette.borderHeader}`,
                            }"
                          >
                            <th
                              class="px-1.5 pr-2 text-left font-semibold tabular-nums"
                              :style="{
                                color: sharePalette.main,
                                paddingBottom: `${tableHeadPadB}px`,
                              }"
                            >
                              #
                            </th>
                            <th
                              class="pr-2 text-left font-semibold"
                              :style="{
                                color: sharePalette.main,
                                paddingBottom: `${tableHeadPadB}px`,
                              }"
                            >
                              {{ t('admin.tournament_page.team') }}
                            </th>
                            <th
                              class="px-1 text-center font-semibold tabular-nums"
                              :style="{
                                color: sharePalette.main,
                                paddingBottom: `${tableHeadPadB}px`,
                              }"
                            >
                              {{ t('admin.tournament_page.table_share_col_played_short') }}
                            </th>
                            <th
                              class="px-1 text-center font-semibold tabular-nums"
                              :style="{
                                color: sharePalette.main,
                                paddingBottom: `${tableHeadPadB}px`,
                              }"
                            >
                              {{ t('admin.tournament_page.table_share_col_w_short') }}
                            </th>
                            <th
                              class="px-1 text-center font-semibold tabular-nums"
                              :style="{
                                color: sharePalette.main,
                                paddingBottom: `${tableHeadPadB}px`,
                              }"
                            >
                              {{ t('admin.tournament_page.table_share_col_d_short') }}
                            </th>
                            <th
                              class="px-1 text-center font-semibold tabular-nums"
                              :style="{
                                color: sharePalette.main,
                                paddingBottom: `${tableHeadPadB}px`,
                              }"
                            >
                              {{ t('admin.tournament_page.table_share_col_l_short') }}
                            </th>
                            <th
                              class="px-1 text-center font-semibold tabular-nums"
                              :style="{
                                color: sharePalette.main,
                                paddingBottom: `${tableHeadPadB}px`,
                              }"
                            >
                              {{ t('admin.tournament_page.table_share_col_goals_short') }}
                            </th>
                            <th
                              class="px-1 text-center font-semibold tabular-nums"
                              :style="{
                                color: sharePalette.main,
                                paddingBottom: `${tableHeadPadB}px`,
                              }"
                            >
                              Δ
                            </th>
                            <th
                              class="px-1 text-center font-semibold tabular-nums"
                              :style="{
                                color: sharePalette.main,
                                paddingBottom: `${tableHeadPadB}px`,
                              }"
                            >
                              {{ t('admin.tournament_page.table_share_col_pts_short') }}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr
                            v-for="row in rowsForExport"
                            :key="row.teamId"
                          >
                            <td
                              class="tabular-nums align-top"
                              :style="{
                                color: sharePalette.main,
                                paddingTop: `${tableCellPadY}px`,
                                paddingBottom: `${tableCellPadY}px`,
                                paddingLeft: '0.35rem',
                                paddingRight: '0.35rem',
                                borderBottom: tableRowBottomBorder(row),
                                ...shareLeaderCellStyle(row, 0),
                              }"
                            >
                              {{ row.position }}
                            </td>
                            <td
                              class="break-words font-medium leading-snug align-top"
                              :style="{
                                color: sharePalette.main,
                                paddingTop: `${tableCellPadY}px`,
                                paddingBottom: `${tableCellPadY}px`,
                                paddingRight: '0.5rem',
                                borderBottom: tableRowBottomBorder(row),
                                ...shareLeaderCellStyle(row, 1),
                              }"
                            >
                              {{ row.teamName }}
                            </td>
                            <td
                              class="text-center tabular-nums align-top"
                              :style="{
                                color: sharePalette.main,
                                paddingTop: `${tableCellPadY}px`,
                                paddingBottom: `${tableCellPadY}px`,
                                paddingLeft: '0.2rem',
                                paddingRight: '0.2rem',
                                borderBottom: tableRowBottomBorder(row),
                                ...shareLeaderCellStyle(row, 2),
                              }"
                            >
                              {{ row.played }}
                            </td>
                            <td
                              class="text-center tabular-nums align-top"
                              :style="{
                                color: sharePalette.main,
                                paddingTop: `${tableCellPadY}px`,
                                paddingBottom: `${tableCellPadY}px`,
                                paddingLeft: '0.2rem',
                                paddingRight: '0.2rem',
                                borderBottom: tableRowBottomBorder(row),
                                ...shareLeaderCellStyle(row, 3),
                              }"
                            >
                              {{ row.wins }}
                            </td>
                            <td
                              class="text-center tabular-nums align-top"
                              :style="{
                                color: sharePalette.main,
                                paddingTop: `${tableCellPadY}px`,
                                paddingBottom: `${tableCellPadY}px`,
                                paddingLeft: '0.2rem',
                                paddingRight: '0.2rem',
                                borderBottom: tableRowBottomBorder(row),
                                ...shareLeaderCellStyle(row, 4),
                              }"
                            >
                              {{ row.draws }}
                            </td>
                            <td
                              class="text-center tabular-nums align-top"
                              :style="{
                                color: sharePalette.main,
                                paddingTop: `${tableCellPadY}px`,
                                paddingBottom: `${tableCellPadY}px`,
                                paddingLeft: '0.2rem',
                                paddingRight: '0.2rem',
                                borderBottom: tableRowBottomBorder(row),
                                ...shareLeaderCellStyle(row, 5),
                              }"
                            >
                              {{ row.losses }}
                            </td>
                            <td
                              class="text-center tabular-nums align-top"
                              :style="{
                                color: sharePalette.main,
                                paddingTop: `${tableCellPadY}px`,
                                paddingBottom: `${tableCellPadY}px`,
                                paddingLeft: '0.2rem',
                                paddingRight: '0.2rem',
                                borderBottom: tableRowBottomBorder(row),
                                ...shareLeaderCellStyle(row, 6),
                              }"
                            >
                              {{ row.goalsFor }}:{{ row.goalsAgainst }}
                            </td>
                            <td
                              class="text-center tabular-nums align-top"
                              :style="{
                                color: sharePalette.main,
                                paddingTop: `${tableCellPadY}px`,
                                paddingBottom: `${tableCellPadY}px`,
                                paddingLeft: '0.2rem',
                                paddingRight: '0.2rem',
                                borderBottom: tableRowBottomBorder(row),
                                ...shareLeaderCellStyle(row, 7),
                              }"
                            >
                              {{ row.goalDiff }}
                            </td>
                            <td
                              class="text-center tabular-nums font-semibold align-top"
                              :style="{
                                color: sharePalette.main,
                                paddingTop: `${tableCellPadY}px`,
                                paddingBottom: `${tableCellPadY}px`,
                                paddingLeft: '0.2rem',
                                paddingRight: '0.2rem',
                                borderBottom: tableRowBottomBorder(row),
                                ...shareLeaderCellStyle(row, 8),
                              }"
                            >
                              {{ row.points }}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <p
                    class="shrink-0 pb-1 pt-2 text-center"
                    :style="{
                      color: sharePalette.footer,
                      fontSize: `${footerFontPx}px`,
                    }"
                  >
                    {{ t('admin.tournament_page.table_share_footer') }}
                  </p>
                </div>
              </div>
            </div>
          </div>
          <div
            v-if="generating"
            class="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 rounded-lg bg-surface-950/75 backdrop-blur-[2px] dark:bg-surface-950/85"
            role="status"
            aria-live="polite"
          >
            <i
              class="pi pi-spin pi-spinner text-3xl text-surface-0 dark:text-surface-100"
              aria-hidden="true"
            />
            <span class="px-2 text-center text-sm font-medium text-surface-0/95 dark:text-surface-100">
              {{ t('admin.tournament_page.table_share_preparing') }}
            </span>
          </div>
        </div>
      </div>

      <div class="flex flex-wrap justify-end gap-2 pt-1">
        <Button
          type="button"
          severity="secondary"
          :label="t('admin.tournament_page.table_share_cancel')"
          @click="close"
        />
        <Button
          type="button"
          icon="pi pi-copy"
          outlined
          severity="secondary"
          :label="t('admin.tournament_page.table_share_copy')"
          :loading="generating"
          :disabled="rowsForExport.length === 0"
          @click="copyImageToClipboard"
        />
        <Button
          type="button"
          icon="pi pi-download"
          :label="t('admin.tournament_page.table_share_download')"
          :loading="generating"
          :disabled="rowsForExport.length === 0"
          @click="downloadPng"
        />
      </div>
    </div>
  </Dialog>
</template>
