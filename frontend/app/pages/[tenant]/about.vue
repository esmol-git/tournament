<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import PublicHeader from '~/app/components/public/PublicHeader.vue'
import PublicFooter from '~/app/components/public/PublicFooter.vue'
import {
  usePublicTournamentFetch,
  type PublicManagementMemberItem,
} from '~/composables/usePublicTournamentFetch'
import { usePublicTenantContext } from '~/composables/usePublicTenantContext'

const { tenantSlug, ensureTenantResolved, tenantNotFound } = usePublicTenantContext()
const tenant = tenantSlug
const { fetchTenantManagement } = usePublicTournamentFetch()
const loading = ref(true)
const errorText = ref('')
const management = ref<PublicManagementMemberItem[]>([])

const hasManagement = computed(() => management.value.length > 0)

function memberFullName(m: PublicManagementMemberItem) {
  return `${m.lastName} ${m.firstName}`.trim()
}

onMounted(async () => {
  loading.value = true
  await ensureTenantResolved()
  if (tenantNotFound.value) {
    errorText.value = 'Тенант не найден. Проверьте ссылку.'
    loading.value = false
    return
  }
  try {
    management.value = await fetchTenantManagement(tenant.value)
  } catch {
    management.value = []
    errorText.value = 'Не удалось загрузить руководство.'
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="public-shell">
    <PublicHeader :tenant="tenant" />

    <section class="public-container">
      <div class="public-hero">
        <p class="text-sm font-medium uppercase tracking-wide text-[#1a5a8c]">О лиге</p>
        <h1 class="mt-2 text-3xl font-semibold text-surface-900">Единая площадка турниров</h1>
        <p class="mt-3 max-w-3xl text-sm leading-6 text-muted-color">
          Лига объединяет детско-юношеские и взрослые соревнования в одном цифровом пространстве: от календаря
          и турнирных таблиц до персональной статистики игроков и медиа-контента. Здесь удобно следить за
          каждым этапом сезона в реальном времени - без разрозненных чатов и устаревших протоколов.
        </p>
      </div>

      <div class="mt-6 grid gap-4 md:grid-cols-3">
        <article class="public-card">
          <h2 class="text-lg font-semibold text-surface-900">Прозрачность</h2>
          <p class="mt-2 text-sm text-muted-color">
            Все ключевые данные синхронизированы: результаты матчей, положение команд, карточки, голы и
            ассисты. Любой участник турнира видит одинаковую, актуальную картину сезона.
          </p>
        </article>
        <article class="public-card">
          <h2 class="text-lg font-semibold text-surface-900">Сценарий «от матча до сезона»</h2>
          <p class="mt-2 text-sm text-muted-color">
            Переходите от карточки матча к календарю, от календаря к таблице, от таблицы к статистике игроков.
            Вся навигация выстроена вокруг реальных задач тренеров, родителей и болельщиков.
          </p>
        </article>
        <article class="public-card">
          <h2 class="text-lg font-semibold text-surface-900">Медиа и коммуникация</h2>
          <p class="mt-2 text-sm text-muted-color">
            Новости, галерея и видео собираются в единую витрину турниров и организации. Это помогает не только
            информировать, но и формировать историю сезона и узнаваемость клуба.
          </p>
        </article>
      </div>

      <section class="mt-8">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-xl font-semibold text-surface-900">Руководство</h2>
          <span v-if="hasManagement" class="text-xs text-muted-color">{{ management.length }}</span>
        </div>

        <div v-if="errorText" class="public-error">
          {{ errorText }}
        </div>

        <div class="public-stage">
          <Transition name="public-fade" mode="out-in">
            <div v-if="loading" key="loading" class="grid gap-3 md:grid-cols-2">
              <div
                v-for="i in 4"
                :key="`mg-sk-${i}`"
                class="public-card"
              >
                <Skeleton width="10rem" height="1rem" />
                <Skeleton class="mt-2" width="8rem" height="0.9rem" />
                <Skeleton class="mt-3" width="12rem" height="0.8rem" />
              </div>
            </div>

            <div
              v-else-if="!hasManagement"
              key="empty"
              class="public-empty"
            >
              Раздел руководства пока заполняется. После публикации здесь появятся ответственные лица, контакты и
              роли по направлениям.
            </div>

            <div v-else key="content" class="grid gap-3 md:grid-cols-2">
              <article
                v-for="member in management"
                :key="member.id"
                class="public-card"
              >
                <h3 class="text-base font-semibold text-surface-900">
                  {{ memberFullName(member) }}
                </h3>
                <p class="mt-1 text-sm text-[#1a5a8c]">{{ member.title }}</p>
                <p v-if="member.note" class="mt-2 text-sm text-muted-color">
                  {{ member.note }}
                </p>
                <div class="mt-3 flex flex-wrap gap-3 text-xs text-muted-color">
                  <a
                    v-if="member.phone"
                    :href="`tel:${member.phone}`"
                    class="hover:underline"
                  >
                    {{ member.phone }}
                  </a>
                  <a
                    v-if="member.email"
                    :href="`mailto:${member.email}`"
                    class="hover:underline"
                  >
                    {{ member.email }}
                  </a>
                </div>
              </article>
            </div>
          </Transition>
        </div>
      </section>
    </section>
    <PublicFooter />
  </div>
</template>
