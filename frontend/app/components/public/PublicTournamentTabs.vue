<script setup lang="ts">
import { useAutoAnimate } from '@formkit/auto-animate/vue'
import { PUBLIC_AUTO_ANIMATE } from '~/constants/publicMotion'
import { computed } from 'vue'

const props = defineProps<{
  modelValue: 'table' | 'chessboard' | 'progress' | 'playoff'
  capabilities?: {
    showTable?: boolean
    showChessboard?: boolean
    showProgress?: boolean
    showPlayoff?: boolean
  }
  tabOrder?: Array<'table' | 'chessboard' | 'progress' | 'playoff'>
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: 'table' | 'chessboard' | 'progress' | 'playoff'): void
}>()

function setView(v: 'table' | 'chessboard' | 'progress' | 'playoff') {
  emit('update:modelValue', v)
}

const labels: Record<'table' | 'chessboard' | 'progress' | 'playoff', string> = {
  table: 'ТАБЛИЦА',
  chessboard: 'ШАХМАТКА',
  progress: 'ПРОГРЕСС',
  playoff: 'ПЛЕЙ-ОФФ',
}

const defaultOrder: Array<'table' | 'chessboard' | 'progress' | 'playoff'> = [
  'table',
  'chessboard',
  'progress',
  'playoff',
]

const orderedVisibleTabs = computed(() => {
  const fromProps = Array.isArray(props.tabOrder) && props.tabOrder.length
    ? props.tabOrder
    : defaultOrder
  const ordered: Array<'table' | 'chessboard' | 'progress' | 'playoff'> = []
  for (const tab of fromProps) {
    if (ordered.includes(tab)) continue
    if (tab === 'table' && props.capabilities?.showTable === false) continue
    if (tab === 'chessboard' && props.capabilities?.showChessboard === false) continue
    if (tab === 'progress' && props.capabilities?.showProgress === false) continue
    if (tab === 'playoff' && props.capabilities?.showPlayoff === false) continue
    ordered.push(tab)
  }
  for (const tab of defaultOrder) {
    if (ordered.includes(tab)) continue
    if (tab === 'table' && props.capabilities?.showTable === false) continue
    if (tab === 'chessboard' && props.capabilities?.showChessboard === false) continue
    if (tab === 'progress' && props.capabilities?.showProgress === false) continue
    if (tab === 'playoff' && props.capabilities?.showPlayoff === false) continue
    ordered.push(tab)
  }
  return ordered
})

const [tabsWrapEl] = useAutoAnimate({ ...PUBLIC_AUTO_ANIMATE })
</script>

<template>
  <div class="overflow-x-auto rounded-xl border border-[#b7c7dd] bg-[#eaf1fb] p-1">
    <div ref="tabsWrapEl" class="public-stagger-appear flex min-w-max items-center gap-2">
      <button
        v-for="tab in orderedVisibleTabs"
        :key="tab"
        type="button"
        class="whitespace-nowrap text-center px-3 py-2 rounded-lg text-sm font-medium transition-colors md:flex-1"
        :class="
          modelValue === tab
            ? 'bg-[#c80a48] text-white shadow-sm'
            : 'text-[#123c67] hover:bg-white'
        "
        @click="setView(tab)"
      >
        {{ labels[tab] }}
      </button>
    </div>
  </div>
</template>

