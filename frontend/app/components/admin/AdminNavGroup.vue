<script setup lang="ts">
import {
  adminNavItemResolvedTo,
  adminNavPathMatches,
  isAdminNavItemLocked,
  type AdminNavLinkItem,
} from '~/constants/adminNav'

const props = defineProps<{
  sectionId: string
  labelKey: string
  icon: string
  items: AdminNavLinkItem[]
  mini: boolean
  openSectionId: string | null
  subscriptionPlan: string | null
  userRole: string | null
}>()

const { t } = useI18n()
const label = computed(() => t(props.labelKey))

function itemLocked(item: AdminNavLinkItem): boolean {
  return isAdminNavItemLocked(props.subscriptionPlan, item, props.userRole)
}

function itemResolvedTo(item: AdminNavLinkItem) {
  return adminNavItemResolvedTo(props.subscriptionPlan, props.userRole, item)
}

const emit = defineEmits<{
  'update:openSectionId': [value: string | null]
}>()

const route = useRoute()
const popoverRef = ref<{ toggle: (e: Event) => void; hide: () => void } | null>(null)

const childActive = computed(() =>
  props.items.some((item) => adminNavPathMatches(item, route.path)),
)

const expanded = computed(() => props.openSectionId === props.sectionId)

const headerActiveClass = computed(() =>
  childActive.value
    ? 'bg-surface-100 dark:bg-surface-800 text-primary font-medium'
    : 'text-muted-color',
)

const toggleExpanded = () => {
  if (expanded.value) {
    emit('update:openSectionId', null)
  } else {
    emit('update:openSectionId', props.sectionId)
  }
}

const openPopover = (e: Event) => {
  popoverRef.value?.toggle(e)
}

const closePopover = () => {
  popoverRef.value?.hide()
}
</script>

<template>
  <!-- Полная ширина: аккордеон -->
  <div v-if="!mini" class="space-y-0.5">
    <button
      type="button"
      class="flex w-full items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-left text-[15px] transition-colors hover:bg-surface-100 dark:hover:bg-surface-800 hover:text-primary"
      :class="headerActiveClass"
      :aria-expanded="expanded"
      :aria-controls="`nav-group-${sectionId}`"
      @click="toggleExpanded"
    >
      <span :class="[icon, 'text-sm shrink-0']" aria-hidden="true" />
      <span class="min-w-0 flex-1 truncate font-medium">{{ label }}</span>
      <span
        class="pi text-sm opacity-70 shrink-0"
        :class="expanded ? 'pi-angle-up' : 'pi-angle-down'"
        aria-hidden="true"
      />
    </button>
    <div
      :id="`nav-group-${sectionId}`"
      v-show="expanded"
      class="ml-2 space-y-0.5 border-l border-surface-200 dark:border-surface-700 pl-2"
    >
      <AdminNavLink
        v-for="item in items"
        :key="item.to"
        :to="itemResolvedTo(item)"
        :label-key="item.labelKey"
        :icon="item.icon"
        :exact="!!item.exact"
        :locked="itemLocked(item)"
        class="!py-1.5 text-sm"
      />
    </div>
  </div>

  <!-- Компакт: иконка + Popover со списком -->
  <div v-else class="flex w-full justify-center">
    <Button
      type="button"
      text
      rounded
      class="!flex !h-11 !w-11 !items-center !justify-center !p-0"
      :class="
        childActive
          ? 'text-primary bg-surface-100 dark:bg-surface-800'
          : 'text-muted-color'
      "
      :aria-label="label"
      :title="label"
      @click="openPopover"
    >
      <span
        :class="[icon, 'inline-flex w-[1.35rem] justify-center text-[1.35rem] leading-none']"
        aria-hidden="true"
      />
    </Button>
    <Popover ref="popoverRef">
      <div class="flex min-w-[12rem] flex-col gap-0.5 py-1">
        <div v-for="item in items" :key="item.to">
          <span
            v-if="itemLocked(item)"
            class="flex cursor-not-allowed items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-color opacity-80"
            v-tooltip.top="t('admin.nav.subscription_locked_tooltip')"
          >
            <span :class="[item.icon, 'text-xs opacity-80']" aria-hidden="true" />
            <span class="min-w-0 flex-1 truncate">{{ t(item.labelKey) }}</span>
            <span class="pi pi-lock shrink-0 text-[0.7rem] opacity-70" aria-hidden="true" />
          </span>
          <NuxtLink
            v-else
            :to="itemResolvedTo(item)"
            custom
            v-slot="{ href, navigate }"
          >
            <a
              :href="href"
              class="flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors"
              :class="
                adminNavPathMatches(item, route.path)
                  ? 'bg-surface-100 dark:bg-surface-800 font-medium text-primary'
                  : 'text-surface-700 dark:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-800'
              "
              @click="
                (e) => {
                  navigate(e)
                  closePopover()
                }
              "
            >
              <span :class="[item.icon, 'text-xs opacity-80']" aria-hidden="true" />
              <span class="min-w-0 flex-1 truncate">{{ t(item.labelKey) }}</span>
            </a>
          </NuxtLink>
        </div>
      </div>
    </Popover>
  </div>
</template>
