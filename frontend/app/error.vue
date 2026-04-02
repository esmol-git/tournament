<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  error: {
    statusCode?: number
    statusMessage?: string
    message?: string
  }
}>()

const router = useRouter()

const statusCode = computed(() => Number(props.error?.statusCode ?? 500) || 500)
const isNotFound = computed(() => statusCode.value === 404)

const title = computed(() => (isNotFound.value ? 'Страница не найдена' : 'Произошла ошибка'))
const subtitle = computed(() => {
  if (isNotFound.value) return 'Проверьте адрес или перейдите в доступный раздел.'
  return 'Попробуйте обновить страницу. Если повторится — сообщите администратору.'
})

function onBack() {
  if (typeof window !== 'undefined' && window.history.length > 1) {
    router.back()
    return
  }
  clearError({ redirect: '/' })
}
</script>

<template>
  <div class="error-shell min-h-screen px-4 py-10">
    <div class="mx-auto w-full max-w-2xl">
      <div class="error-card rounded-3xl border p-6 md:p-8">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <p class="text-xs font-semibold uppercase tracking-[0.12em] text-[#4f6b8c]">Код {{ statusCode }}</p>
            <h1 class="mt-2 text-2xl font-semibold text-[#123c67] md:text-3xl">{{ title }}</h1>
            <p class="mt-2 text-sm text-[#4f6b8c] md:text-base">
              {{ subtitle }}
            </p>
          </div>
          <div
            class="error-icon h-12 w-12 shrink-0 rounded-2xl"
            :class="isNotFound ? 'error-icon--not-found' : 'error-icon--danger'"
            aria-hidden="true"
          >
            <i :class="isNotFound ? 'pi pi-compass text-[1rem]' : 'pi pi-exclamation-triangle text-[1rem]'" />
          </div>
        </div>

        <div class="mt-6 flex flex-wrap items-center gap-2.5">
          <button type="button" class="error-btn error-btn--secondary" @click="onBack">
            <i class="pi pi-undo text-[0.8rem]" />
            <span>Назад</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.error-shell {
  background:
    radial-gradient(1200px 500px at 20% -10%, rgba(200, 10, 72, 0.1) 0%, rgba(200, 10, 72, 0) 60%),
    radial-gradient(1000px 420px at 100% 0%, rgba(26, 90, 140, 0.14) 0%, rgba(26, 90, 140, 0) 55%),
    #f3f7fc;
}

.error-card {
  border-color: #d6e0ee;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(248, 251, 255, 0.98) 100%);
  box-shadow: 0 16px 48px rgba(18, 60, 103, 0.14);
}

.error-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.error-icon--not-found {
  background: #eef5ff;
  color: #1a5a8c;
  border: 1px solid #d2e2f7;
}

.error-icon--danger {
  background: #fff2f7;
  color: #b10f46;
  border: 1px solid #f4c8d8;
}

.error-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  border-radius: 0.7rem;
  border: 1px solid transparent;
  padding: 0.56rem 0.9rem;
  font-size: 0.92rem;
  font-weight: 600;
  transition: all 0.16s ease;
}

.error-btn--secondary {
  background: #fff;
  border-color: #d2e2f7;
  color: #1a5a8c;
}

.error-btn--secondary:hover {
  border-color: #c80a48;
  color: #c80a48;
  background: #fff2f7;
}
</style>

