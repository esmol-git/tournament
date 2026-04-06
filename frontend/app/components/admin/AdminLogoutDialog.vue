<script setup lang="ts">
import { computed, useId } from 'vue'
import { useAdminLogout } from '~/composables/useAdminLogout'

const visible = defineModel<boolean>({ default: false })

const { logout } = useAdminLogout()
const { t } = useI18n()

const logoutMessageId = useId()
const logoutDialogPt = computed(() => ({
  root: { 'aria-describedby': logoutMessageId },
}))

const onConfirm = async () => {
  visible.value = false
  await logout()
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    block-scroll
    :header="t('admin.logout.title')"
    :style="{ width: '24rem' }"
    :pt="logoutDialogPt"
    @update:visible="(v) => (visible = v)"
  >
    <p :id="logoutMessageId" class="mb-4 text-sm text-muted-color">
      {{ t('admin.logout.message') }}
    </p>
    <div class="flex justify-end gap-2">
      <Button
        type="button"
        :label="t('admin.logout.cancel')"
        text
        class="px-3 py-2"
        @click="visible = false"
      />
      <Button
        type="button"
        :label="t('admin.logout.confirm')"
        severity="danger"
        class="px-3 py-2"
        @click="onConfirm"
      />
    </div>
  </Dialog>
</template>
