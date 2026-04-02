<script setup lang="ts">
import { computed } from 'vue'

definePageMeta({
  // Пусть 404 выглядит одинаково во всех разделах
  layout: 'default',
})

const route = useRoute()
const router = useRouter()

const path = computed(() => String(route.path || ''))

const title = computed(() => 'Страница не найдена')
const subtitle = computed(() => 'Такой страницы нет. Возможно, ссылка устарела или была введена с ошибкой.')

function goBack() {
  if (typeof window !== 'undefined' && window.history.length > 1) {
    router.back()
    return
  }
  void navigateTo('/')
}
</script>

<template>
  <div class="not-found-shell min-h-screen px-4 py-10">
    <div class="mx-auto w-full max-w-2xl">
      <div class="not-found-card rounded-3xl border p-6 md:p-8">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <p class="text-xs font-semibold uppercase tracking-[0.12em] text-[#4f6b8c]">404</p>
            <h1 class="mt-2 text-2xl font-semibold text-[#123c67] md:text-3xl">{{ title }}</h1>
            <p class="mt-2 text-sm text-[#4f6b8c] md:text-base">
              {{ subtitle }}
            </p>
            <p class="mt-3 rounded-lg bg-[#f4f7fc] px-2.5 py-1 text-xs text-[#4f6b8c]">
              {{ path }}
            </p>
          </div>
          <div class="not-found-icon h-12 w-12 shrink-0 rounded-2xl" aria-hidden="true">
            <i class="pi pi-compass text-[1rem]" />
          </div>
        </div>

        <div class="mt-6 flex flex-wrap items-center gap-2.5">
          <button type="button" class="not-found-btn not-found-btn--secondary" @click="goBack">
            <i class="pi pi-undo text-[0.8rem]" />
            <span>Назад</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.not-found-shell {
  background:
    radial-gradient(1200px 500px at 20% -10%, rgba(200, 10, 72, 0.1) 0%, rgba(200, 10, 72, 0) 60%),
    radial-gradient(1000px 420px at 100% 0%, rgba(26, 90, 140, 0.14) 0%, rgba(26, 90, 140, 0) 55%),
    #f3f7fc;
}

.not-found-card {
  border-color: #d6e0ee;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(248, 251, 255, 0.98) 100%);
  box-shadow: 0 16px 48px rgba(18, 60, 103, 0.14);
}

.not-found-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #eef5ff;
  color: #1a5a8c;
  border: 1px solid #d2e2f7;
}

.not-found-btn {
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

.not-found-btn--secondary {
  background: #fff;
  border-color: #d2e2f7;
  color: #1a5a8c;
}

.not-found-btn--secondary:hover {
  border-color: #c80a48;
  color: #c80a48;
  background: #fff2f7;
}
</style>

