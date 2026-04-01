<script setup lang="ts">
const currentYear = new Date().getFullYear()

const pendingDocuments = [
  'Политика конфиденциальности',
  'Пользовательское соглашение',
  'Политика обработки персональных данных',
  'Согласие на обработку персональных данных',
]
</script>

<template>
  <footer class="mt-auto border-t-4 border-[#c80a48] bg-[#123c67] text-white">
    <div class="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div class="flex items-center gap-3">
          <img src="/logo.png" alt="Tournament Platform" class="h-9 w-auto object-contain" loading="lazy" />
          <div>
            <p class="text-sm font-semibold tracking-wide">Tournament Platform</p>
            <p class="text-xs text-white/70">Современная платформа турниров</p>
          </div>
        </div>
        <p class="text-xs text-white/80">© {{ currentYear }} Tournament Platform. Все права защищены.</p>
      </div>

      <div class="rounded-xl border border-white/20 bg-white/5 p-3">
        <div class="flex flex-wrap items-center gap-2">
          <span
            v-for="doc in pendingDocuments"
            :key="doc"
            class="inline-flex items-center rounded-full border border-white/30 bg-white/10 px-3 py-1 text-xs text-white/90"
          >
            {{ doc }}
            <i class="pi pi-clock ml-1 text-[0.65rem] text-white/70" />
          </span>
        </div>
        <p class="mt-2 text-xs text-white/70">Документы появятся после загрузки в систему.</p>
      </div>
    </div>
  </footer>
</template>
