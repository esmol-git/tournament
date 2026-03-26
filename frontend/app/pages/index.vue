<template>
  <div class="landing-root bg-white text-slate-900">
    <header class="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
      <div class="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div class="flex items-center gap-2">
          <div class="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 font-bold text-white shadow-lg shadow-slate-400/40">
            TP
          </div>
          <div class="leading-tight">
            <p class="text-xs font-semibold uppercase tracking-wide text-slate-500">Tournament</p>
            <p class="text-lg font-black text-emerald-600">Platform</p>
          </div>
        </div>

        <nav class="hidden items-center gap-7 text-sm font-semibold lg:flex">
          <a
            v-for="item in navItems"
            :key="item.label"
            :href="item.href"
            class="text-slate-700 transition hover:text-emerald-600"
          >
            {{ item.label }}
          </a>
        </nav>

        <div class="flex items-center gap-2">
          <NuxtLink to="/admin/login" class="login-link-btn">
            Войти
          </NuxtLink>
          <Button label="Демо-доступ" />
        </div>
      </div>
    </header>

    <main>
      <section
        ref="heroRef"
        class="parallax-layer relative isolate overflow-hidden bg-slate-950"
        :style="heroStyle"
      >
        <div class="pointer-events-none absolute -left-20 top-20 h-64 w-64 rounded-full bg-emerald-500/20 blur-3xl hero-depth-1" />
        <div class="float-slow pointer-events-none absolute -right-8 top-8 h-44 w-44 rounded-full bg-violet-500/20 blur-2xl hero-depth-2" />
        <div class="float-fast pointer-events-none absolute bottom-10 right-1/4 h-24 w-24 rounded-full bg-cyan-400/30 blur-xl hero-depth-3" />
        <div class="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.06)_1px,transparent_1px)] [background-size:42px_42px]" />
        <div class="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
          <div class="max-w-3xl hero-depth-2 reveal">
            <p class="mb-5 inline-flex rounded-full border border-emerald-400/30 bg-emerald-400/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-300">
              Цифровая экосистема для спорта
            </p>
            <h1 class="text-4xl font-black leading-tight text-white sm:text-5xl lg:text-6xl">
              Создайте современный сайт лиги
              <span class="text-emerald-400">за 1 день</span>
            </h1>
            <p class="mt-6 max-w-2xl text-lg leading-relaxed text-slate-300">
              Продающий дизайн, удобная админка, автоматизация турниров, аналитика и мобильный опыт.
              Все ключевые процессы в одном продукте.
            </p>
            <div class="mt-9 flex flex-wrap gap-3">
              <Button label="Запросить демо" size="large" class="hero-cta shadow-xl shadow-emerald-500/30" />
              <Button label="Смотреть тарифы" severity="secondary" outlined size="large" class="border-white/30 text-white" />
            </div>
            <div class="mt-8 grid max-w-2xl grid-cols-2 gap-5 text-sm text-slate-300 sm:grid-cols-4">
              <div v-for="fact in heroFacts" :key="fact.label">
                <p class="text-2xl font-black text-white">{{ fact.value }}</p>
                <p class="mt-1">{{ fact.label }}</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="benefits" class="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24 reveal">
        <div class="max-w-2xl reveal">
          <p class="text-sm font-bold uppercase tracking-[0.2em] text-emerald-600">Ваши выгоды</p>
          <h2 class="mt-3 text-3xl font-black leading-tight sm:text-4xl">
            Не просто витрина, а центр управления вашим турниром
          </h2>
        </div>
        <div class="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          <article
            v-for="item in benefits"
            :key="item.title"
            class="card-fx reveal rounded-2xl border border-slate-200 bg-white p-6 shadow-md transition hover:-translate-y-1.5"
          >
            <div class="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-lg font-bold text-emerald-600">
              {{ item.icon }}
            </div>
            <h3 class="text-xl font-bold">{{ item.title }}</h3>
            <p class="mt-3 text-slate-600">{{ item.text }}</p>
          </article>
        </div>
      </section>

      <section class="mx-auto max-w-7xl px-4 pb-6 sm:px-6 lg:px-8 reveal lg:pb-10">
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <article
            v-for="metric in animatedMetrics"
            :key="metric.label"
            ref="metricRefs"
            class="card-fx rounded-2xl border border-slate-200 bg-white p-5 shadow-md"
          >
            <p class="text-3xl font-black text-slate-900">
              {{ metricDisplay[metric.key] }}<span class="text-emerald-600">{{ metric.suffix }}</span>
            </p>
            <p class="mt-1 text-sm text-slate-600">{{ metric.label }}</p>
          </article>
        </div>
      </section>

      <section class="relative overflow-hidden bg-gradient-to-b from-slate-50 to-white reveal">
        <div class="pointer-events-none absolute -right-32 top-14 h-80 w-80 rounded-full bg-emerald-300/20 blur-3xl" />
        <div class="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div class="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr]">
            <div>
              <p class="text-sm font-bold uppercase tracking-[0.2em] text-emerald-600">Как это работает</p>
              <h2 class="mt-3 text-3xl font-black sm:text-4xl">Запуск в 4 шага без боли и хаоса</h2>
              <p class="mt-5 text-lg text-slate-600">
                Готовый процесс внедрения помогает быстро выйти в продакшн и сразу начать получать заявки.
              </p>
            </div>
            <div class="space-y-4">
              <div
                v-for="step in launchSteps"
                :key="step.title"
                class="card-fx reveal flex gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-md"
              >
                <div class="mt-0.5 h-8 min-w-8 rounded-lg bg-slate-900 text-center text-sm font-bold leading-8 text-white">
                  {{ step.num }}
                </div>
                <div>
                  <p class="text-base font-bold">{{ step.title }}</p>
                  <p class="mt-1 text-sm text-slate-600">{{ step.text }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="features" class="bg-slate-50 reveal">
        <div class="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div class="grid items-start gap-10 lg:grid-cols-2">
            <div>
              <p class="text-sm font-bold uppercase tracking-[0.2em] text-emerald-600">Функциональность</p>
              <h2 class="mt-3 text-3xl font-black leading-tight sm:text-4xl">
                Новые возможности с крутым футбольным движком
              </h2>
              <p class="mt-5 text-lg text-slate-600">
                От заявочной кампании и календаря до протоколов матчей и живой статистики. Все модули
                уже готовы к работе.
              </p>
            </div>
            <div class="grid gap-4 sm:grid-cols-2">
              <div
                v-for="feature in featureList"
                :key="feature"
                class="card-fx reveal rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm"
              >
                {{ feature }}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section class="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24 reveal">
        <div class="rounded-3xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/70 lg:p-10">
          <div class="flex flex-wrap items-center justify-between gap-5">
            <div>
              <p class="text-sm font-bold uppercase tracking-[0.2em] text-emerald-600">Интеграции</p>
              <h2 class="mt-2 text-3xl font-black sm:text-4xl">Подключается к вашей экосистеме</h2>
            </div>
            <p class="max-w-xl text-slate-600">
              CRM, аналитика, уведомления, платежи и соцсети. Используйте привычные сервисы без ручных
              костылей и дублирования данных.
            </p>
          </div>
          <div class="mt-8 grid grid-cols-2 gap-3 text-center sm:grid-cols-3 lg:grid-cols-6">
            <div v-for="integration in integrations" :key="integration" class="card-fx reveal rounded-xl border border-slate-200 bg-slate-50 px-3 py-4 text-sm font-semibold text-slate-700 shadow-sm">
              {{ integration }}
            </div>
          </div>
        </div>
      </section>

      <section class="border-y border-slate-200 bg-gradient-to-r from-white via-cyan-50/40 to-violet-50/40 py-4">
        <div class="marquee">
          <div class="marquee-track">
            <span v-for="(metric, idx) in trustMetricsLoop" :key="`m-${idx}-${metric}`" class="mx-6 inline-flex items-center gap-3 whitespace-nowrap text-sm font-semibold text-slate-600">
              <span class="h-2 w-2 rounded-full bg-emerald-500" />
              {{ metric }}
            </span>
          </div>
        </div>
      </section>

      <section class="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24 reveal">
        <div class="mb-10 text-center">
          <p class="text-sm font-bold uppercase tracking-[0.2em] text-emerald-600">Кейсы</p>
          <h2 class="mt-3 text-3xl font-black sm:text-4xl">Результаты до и после внедрения</h2>
        </div>
        <div class="grid gap-6 md:grid-cols-3">
          <article
            v-for="item in caseStudies"
            :key="item.title"
            class="card-fx reveal rounded-2xl border border-slate-200 bg-white p-6 shadow-md"
          >
            <h3 class="text-xl font-bold">{{ item.title }}</h3>
            <div class="mt-4 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <span class="font-bold">Было:</span> {{ item.before }}
            </div>
            <div class="mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              <span class="font-bold">Стало:</span> {{ item.after }}
            </div>
            <p class="mt-4 text-sm font-semibold text-slate-700">{{ item.result }}</p>
          </article>
        </div>
      </section>

      <section id="pricing" class="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24 reveal">
        <div class="text-center">
          <p class="text-sm font-bold uppercase tracking-[0.2em] text-emerald-600">Тарифы</p>
          <h2 class="mt-3 text-3xl font-black sm:text-4xl">Выберите подходящий тариф</h2>
        </div>
        <div class="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          <article
            v-for="plan in plans"
            :key="plan.name"
            :class="[
              'card-fx reveal relative flex flex-col rounded-2xl border bg-white p-6 shadow-lg shadow-slate-200/70',
              plan.highlight
                ? 'border-emerald-500 ring-2 ring-emerald-100'
                : 'border-slate-200',
            ]"
          >
            <p
              v-if="plan.highlight"
              class="absolute -top-3 left-6 rounded-full bg-emerald-500 px-3 py-1 text-xs font-bold uppercase tracking-wide text-white"
            >
              Популярный
            </p>
            <h3 class="text-2xl font-black">{{ plan.name }}</h3>
            <p class="mt-2 text-slate-500">{{ plan.caption }}</p>
            <p class="mt-4 text-4xl font-black">{{ plan.price }}</p>
            <ul class="mt-6 space-y-2 text-sm text-slate-600">
              <li v-for="line in plan.features" :key="line">• {{ line }}</li>
            </ul>
            <a href="#contacts" class="plan-btn mt-auto inline-flex w-full items-center justify-center rounded-xl px-5 py-3 text-sm font-bold uppercase tracking-wide">
              Выбрать тариф
            </a>
          </article>
        </div>
      </section>

      <section class="bg-slate-50 reveal">
        <div class="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div class="mb-10 text-center">
            <p class="text-sm font-bold uppercase tracking-[0.2em] text-emerald-600">Подбор тарифа</p>
            <h2 class="mt-3 text-3xl font-black sm:text-4xl">Ответьте на 3 вопроса за 30 секунд</h2>
          </div>
          <div class="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
            <div class="grid gap-4">
              <article class="card-fx rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p class="text-sm font-semibold text-slate-500">1/3 Количество команд</p>
                <div class="mt-3 flex flex-wrap gap-2">
                  <button
                    v-for="size in quizTeamSizeOptions"
                    :key="size.id"
                    type="button"
                    class="quiz-chip"
                    :class="{ 'quiz-chip-active': quizTeamSize === size.id }"
                    @click="quizTeamSize = size.id"
                  >
                    {{ size.label }}
                  </button>
                </div>
              </article>

              <article class="card-fx rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p class="text-sm font-semibold text-slate-500">2/3 Нужно мобильное приложение</p>
                <div class="mt-3 flex flex-wrap gap-2">
                  <button
                    v-for="mobile in quizMobileOptions"
                    :key="mobile.id"
                    type="button"
                    class="quiz-chip"
                    :class="{ 'quiz-chip-active': quizMobile === mobile.id }"
                    @click="quizMobile = mobile.id"
                  >
                    {{ mobile.label }}
                  </button>
                </div>
              </article>

              <article class="card-fx rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <p class="text-sm font-semibold text-slate-500">3/3 Важен индивидуальный дизайн</p>
                <div class="mt-3 flex flex-wrap gap-2">
                  <button
                    v-for="design in quizDesignOptions"
                    :key="design.id"
                    type="button"
                    class="quiz-chip"
                    :class="{ 'quiz-chip-active': quizDesign === design.id }"
                    @click="quizDesign = design.id"
                  >
                    {{ design.label }}
                  </button>
                </div>
              </article>
            </div>

            <aside class="card-fx rounded-2xl border border-slate-200 bg-white p-6 shadow-md">
              <p class="text-sm font-semibold uppercase tracking-wide text-emerald-600">Рекомендация</p>
              <h3 class="mt-2 text-2xl font-black">{{ quizRecommendation.name }}</h3>
              <p class="mt-1 text-slate-500">{{ quizRecommendation.caption }}</p>
              <p class="mt-5 text-4xl font-black">{{ quizRecommendation.price }}</p>
              <ul class="mt-5 space-y-2 text-sm text-slate-600">
                <li v-for="line in quizRecommendation.features" :key="line">• {{ line }}</li>
              </ul>
              <a href="#demo-form" class="plan-btn mt-7 inline-flex w-full items-center justify-center rounded-xl px-5 py-3 text-sm font-bold uppercase tracking-wide">
                Получить предложение
              </a>
            </aside>
          </div>
        </div>
      </section>

      <section id="testimonials" class="bg-slate-50 reveal">
        <div class="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div class="text-center">
            <p class="text-sm font-bold uppercase tracking-[0.2em] text-emerald-600">Отзывы</p>
            <h2 class="mt-3 text-3xl font-black sm:text-4xl">Нам доверяют ведущие футбольные лиги</h2>
          </div>
          <div class="mt-10 grid gap-6 md:grid-cols-3">
            <article
              v-for="quote in testimonials"
              :key="quote.author"
              class="card-fx reveal rounded-2xl border border-slate-200 bg-white p-6 shadow-md"
            >
              <p class="text-sm leading-relaxed text-slate-700">"{{ quote.text }}"</p>
              <p class="mt-5 text-base font-bold">{{ quote.author }}</p>
              <p class="text-sm text-slate-500">{{ quote.role }}</p>
            </article>
          </div>
        </div>
      </section>

      <section class="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24 reveal">
        <div class="mb-10 text-center">
          <p class="text-sm font-bold uppercase tracking-[0.2em] text-emerald-600">FAQ</p>
          <h2 class="mt-3 text-3xl font-black sm:text-4xl">Частые вопросы перед запуском</h2>
        </div>
        <div class="grid gap-4 md:grid-cols-2">
          <article v-for="faq in faqs" :key="faq.q" class="card-fx reveal rounded-2xl border border-slate-200 bg-white p-6 shadow-md">
            <h3 class="text-lg font-bold">{{ faq.q }}</h3>
            <p class="mt-2 text-slate-600">{{ faq.a }}</p>
          </article>
        </div>
      </section>

      <section id="demo-form" class="bg-slate-950">
        <div class="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6 lg:px-8 lg:py-24">
          <h2 class="text-3xl font-black leading-tight text-white sm:text-5xl">
            Создайте персональный футбольный сайт уже сегодня
          </h2>
          <p class="mx-auto mt-5 max-w-2xl text-lg text-slate-300">
            Получите бесплатный демо-доступ и запустите современный сайт лиги с удобной админкой.
          </p>
          <div class="mt-9">
            <Button label="Запросить демонстрацию" size="large" class="cta-glow shadow-xl shadow-emerald-500/30" />
          </div>
          <form class="mx-auto mt-10 grid max-w-3xl gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-left backdrop-blur sm:grid-cols-2">
            <input class="landing-input" type="text" placeholder="Ваше имя" />
            <input class="landing-input" type="text" placeholder="Телефон или Telegram" />
            <input class="landing-input sm:col-span-2" type="text" placeholder="Название лиги / турнира" />
            <textarea class="landing-input min-h-24 sm:col-span-2" placeholder="Коротко опишите задачу" />
            <button type="button" class="plan-btn form-submit-btn sm:col-span-2">
              Отправить заявку
            </button>
          </form>
        </div>
      </section>
    </main>

    <footer id="contacts" class="border-t border-slate-200 bg-white">
      <div class="mx-auto grid max-w-7xl gap-8 px-4 py-14 sm:px-6 md:grid-cols-2 lg:grid-cols-4 lg:px-8">
        <div>
          <p class="text-lg font-bold">Демо-доступ и тарифы</p>
          <a class="mt-2 block text-slate-600 transition hover:text-emerald-600" href="tel:+78005553535">
            8 800 555-35-35
          </a>
          <a class="block text-slate-600 transition hover:text-emerald-600" href="mailto:sales@tournament-platform.ru">
            sales@tournament-platform.ru
          </a>
        </div>
        <div>
          <p class="text-lg font-bold">Техподдержка</p>
          <a class="mt-2 block text-slate-600 transition hover:text-emerald-600" href="tel:+78005553536">
            8 800 555-35-36
          </a>
          <a class="block text-slate-600 transition hover:text-emerald-600" href="mailto:support@tournament-platform.ru">
            support@tournament-platform.ru
          </a>
        </div>
        <div>
          <p class="text-lg font-bold">Маркетинг и реклама</p>
          <a class="mt-2 block text-slate-600 transition hover:text-emerald-600" href="mailto:partners@tournament-platform.ru">
            partners@tournament-platform.ru
          </a>
          <a class="block text-slate-600 transition hover:text-emerald-600" href="https://vk.com" target="_blank" rel="noopener noreferrer">
            VK.com
          </a>
        </div>
        <div>
          <p class="text-lg font-bold">Наш офис</p>
          <p class="mt-2 text-slate-600">
            РФ, Санкт-Петербург,<br>
            Фермское шоссе, 30
          </p>
        </div>
      </div>
    </footer>

    <div class="mobile-cta fixed inset-x-3 bottom-3 z-40 md:hidden">
      <a href="#demo-form" class="plan-btn inline-flex w-full items-center justify-center rounded-xl px-5 py-3 text-sm font-bold uppercase tracking-wide">
        Запросить демо за 30 секунд
      </a>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

const heroRef = ref<HTMLElement | null>(null)
const offsetX = ref(0)
const offsetY = ref(0)
let revealObserver: IntersectionObserver | null = null
let cleanupHeroListeners: (() => void) | null = null
let metricObserver: IntersectionObserver | null = null
const metricRefs = ref<HTMLElement[]>([])

const heroStyle = computed(() => ({
  '--hero-offset-x': `${offsetX.value}px`,
  '--hero-offset-y': `${offsetY.value}px`,
}))

const navItems = [
  { label: 'Возможности', href: '#features' },
  { label: 'Выгоды', href: '#benefits' },
  { label: 'Тарифы', href: '#pricing' },
  { label: 'Отзывы', href: '#testimonials' },
  { label: 'Контакты', href: '#contacts' },
]

const heroFacts = [
  { value: '1 день', label: 'запуск сайта' },
  { value: '80%', label: 'трафика с мобильных' },
  { value: '100+', label: 'клиентов в спорте' },
  { value: '24/7', label: 'поддержка клиентов' },
]

const benefits = [
  {
    icon: '01',
    title: 'Быстрее запуск',
    text: 'Не тратите месяцы на разработку: базовый сайт и админка готовы сразу после подключения.',
  },
  {
    icon: '02',
    title: 'Проще управление',
    text: 'Календарь, турнирные таблицы, заявки, составы и протоколы матчей собраны в одном интерфейсе.',
  },
  {
    icon: '03',
    title: 'Безопаснее процесс',
    text: 'Роли пользователей, контроль доступа и централизованные данные снижают риск ошибок.',
  },
  {
    icon: '04',
    title: 'Профессиональный вид',
    text: 'Современный дизайн и адаптивная верстка формируют доверие у игроков, болельщиков и партнеров.',
  },
  {
    icon: '05',
    title: 'Рост вовлеченности',
    text: 'Новости, фото, видео и уведомления помогают удерживать аудиторию и увеличивать активность.',
  },
  {
    icon: '06',
    title: 'Экономия бюджета',
    text: 'Подписка обходится дешевле индивидуальной разработки и постоянной доработки отдельных модулей.',
  },
]

const launchSteps = [
  { num: '01', title: 'Бриф и цели', text: 'Фиксируем задачи, бизнес-модель и структуру будущего проекта.' },
  { num: '02', title: 'Настройка платформы', text: 'Подключаем домен, роли, тарифы, интеграции и ключевые модули.' },
  { num: '03', title: 'Миграция данных', text: 'Переносим команды, игроков, календарь и материалы без потери истории.' },
  { num: '04', title: 'Запуск и рост', text: 'Выходим в прод и улучшаем конверсию на основе аналитики и поведения.' },
]

const featureList = [
  'Электронные протоколы матчей',
  'Турнирные таблицы и сетки плей-офф',
  'Заявочная кампания и трансферы',
  'Сквозная командная и персональная статистика',
  'Профили игроков и команд',
  'Публикация новостей, фото и видео',
  'Интеграции с VK и Telegram',
  'Мобильная версия публичного сайта',
]

const integrations = ['Telegram', 'VK', 'YouTube', 'GA4', 'Я.Метрика', 'Webhook API']
const trustMetrics = [
  '99.95% uptime',
  'До 70% меньше ручной работы',
  'Внедрение от 1 дня',
  '24/7 поддержка',
  'Готовые интеграции',
  'Современная аналитика',
]
const trustMetricsLoop = [...trustMetrics, ...trustMetrics]

const plans = [
  {
    name: 'Любительская',
    caption: 'Для старта локальных турниров',
    price: '990 ₽/мес',
    features: ['Любое кол-во турниров', 'До 1 Gb медиа', 'Базовая статистика', 'Техподдержка'],
    highlight: false,
  },
  {
    name: 'Премьер-лига',
    caption: 'Для растущих лиг и федераций',
    price: '2 990 ₽/мес',
    features: ['До 50 команд', 'SEO и домен', 'Расширенная статистика', 'Кастомные протоколы'],
    highlight: false,
  },
  {
    name: 'Лига чемпионов',
    caption: 'Для больших сезонов',
    price: '5 990 ₽/мес',
    features: ['До 100 команд', 'Медиа-модуль', 'Расширенные роли', 'Интеграции и API'],
    highlight: true,
  },
  {
    name: 'Чемпионат мира',
    caption: 'Максимальный функционал',
    price: '12 490 ₽/мес',
    features: ['До 500 команд', 'Персональный менеджер', 'Приоритетный SLA', 'Индивидуальные доработки'],
    highlight: false,
  },
]

const animatedMetrics = [
  { key: 'launch', value: 1, suffix: 'д', label: 'средний срок запуска' },
  { key: 'lessRoutine', value: 70, suffix: '%', label: 'меньше ручной работы' },
  { key: 'mobile', value: 82, suffix: '%', label: 'мобильного трафика' },
  { key: 'support', value: 24, suffix: '/7', label: 'поддержка без выходных' },
] as const

const metricDisplay = ref<Record<string, number>>({
  launch: 0,
  lessRoutine: 0,
  mobile: 0,
  support: 0,
})

const testimonials = [
  {
    author: 'Тимур Михайлов',
    role: 'Руководитель лиги',
    text: 'Запустили сайт и админку очень быстро. Система закрыла вопросы статистики и публикации результатов.',
  },
  {
    author: 'Артем Максимовских',
    role: 'Организатор турниров',
    text: 'Удобная мобильная версия и понятный интерфейс для администраторов. Команда поддержки реагирует оперативно.',
  },
  {
    author: 'Сергей Крестин',
    role: 'Основатель проекта',
    text: 'Платформа дает стабильную основу для роста турнира: от заявок до качественной публичной витрины.',
  },
]

const caseStudies = [
  {
    title: 'Региональная лига (32 команды)',
    before: 'Протоколы заполнялись вручную, ошибки в таблице каждую неделю.',
    after: 'Автогенерация протоколов и синхронизация таблиц в реальном времени.',
    result: '-58% операционных задач у администраторов.',
  },
  {
    title: 'Городской чемпионат',
    before: 'Сайт не адаптирован под мобильные и слабая вовлеченность.',
    after: 'Новая мобильная витрина, push-уведомления и понятный календарь.',
    result: '+41% возвратных посетителей за 2 месяца.',
  },
  {
    title: 'Федерация детского футбола',
    before: 'Разрозненные инструменты и нет прозрачной аналитики по турнирам.',
    after: 'Единая панель, сквозная статистика, роли и контроль доступа.',
    result: 'Сокращение времени подготовки отчетов с 6 часов до 45 минут.',
  },
]

const faqs = [
  {
    q: 'Сколько времени занимает запуск?',
    a: 'Обычно от 1 до 3 дней в зависимости от объема данных и количества интеграций.',
  },
  {
    q: 'Можно ли перейти со старого сайта?',
    a: 'Да, переносим контент, пользователей и историю турниров по согласованному плану.',
  },
  {
    q: 'Есть ли мобильная версия?',
    a: 'Да, все ключевые страницы адаптированы под смартфоны и планшеты.',
  },
  {
    q: 'Что с техподдержкой после запуска?',
    a: 'Поддержка доступна 24/7, плюс регулярные обновления и помощь по улучшению конверсии.',
  },
]

const quizTeamSizeOptions = [
  { id: 'small', label: 'До 20' },
  { id: 'medium', label: '20-100' },
  { id: 'large', label: '100+' },
] as const

const quizMobileOptions = [
  { id: 'no', label: 'Не обязательно' },
  { id: 'yes', label: 'Да, нужно' },
] as const

const quizDesignOptions = [
  { id: 'base', label: 'Базовый стиль' },
  { id: 'custom', label: 'Индивидуальный' },
] as const

const quizTeamSize = ref<'small' | 'medium' | 'large'>('medium')
const quizMobile = ref<'no' | 'yes'>('yes')
const quizDesign = ref<'base' | 'custom'>('base')

const quizRecommendation = computed(() => {
  if (quizTeamSize.value === 'large' || quizDesign.value === 'custom') {
    return plans[3]
  }
  if (quizTeamSize.value === 'medium' || quizMobile.value === 'yes') {
    return plans[2]
  }
  return plans[1]
})

function animateMetric(key: string, target: number) {
  const duration = 900
  const start = performance.now()
  const initial = metricDisplay.value[key] || 0
  const delta = target - initial

  const tick = (time: number) => {
    const progress = Math.min((time - start) / duration, 1)
    const eased = 1 - Math.pow(1 - progress, 3)
    metricDisplay.value[key] = Math.round(initial + delta * eased)
    if (progress < 1) requestAnimationFrame(tick)
  }
  requestAnimationFrame(tick)
}

onMounted(() => {
  const onMove = (event: MouseEvent) => {
    if (!heroRef.value) return
    const rect = heroRef.value.getBoundingClientRect()
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 16
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 16
    offsetX.value = Number.isFinite(x) ? x : 0
    offsetY.value = Number.isFinite(y) ? y : 0
  }

  const onLeave = () => {
    offsetX.value = 0
    offsetY.value = 0
  }

  heroRef.value?.addEventListener('mousemove', onMove)
  heroRef.value?.addEventListener('mouseleave', onLeave)
  cleanupHeroListeners = () => {
    heroRef.value?.removeEventListener('mousemove', onMove)
    heroRef.value?.removeEventListener('mouseleave', onLeave)
  }

  revealObserver = new IntersectionObserver(
    entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view')
          revealObserver?.unobserve(entry.target)
        }
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' },
  )

  document.querySelectorAll('.reveal').forEach(el => revealObserver?.observe(el))

  metricObserver = new IntersectionObserver(
    entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          for (const metric of animatedMetrics) {
            animateMetric(metric.key, metric.value)
          }
          metricObserver?.disconnect()
          metricObserver = null
          break
        }
      }
    },
    { threshold: 0.3 },
  )
  for (const el of metricRefs.value) metricObserver.observe(el)
})

onBeforeUnmount(() => {
  cleanupHeroListeners?.()
  revealObserver?.disconnect()
  revealObserver = null
  metricObserver?.disconnect()
  metricObserver = null
})
</script>

<style scoped>
.reveal {
  opacity: 0;
  transform: translateY(14px) scale(0.985);
  transition:
    opacity 500ms ease,
    transform 500ms ease;
}

.reveal.in-view {
  opacity: 1;
  transform: translateY(0) scale(1);
}

.login-link-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 2.5rem;
  border-radius: 0.75rem;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  padding: 0.55rem 0.95rem;
  font-size: 0.875rem;
  font-weight: 700;
  color: #334155;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.08);
  transition: all 180ms ease;
}

.login-link-btn:hover {
  border-color: #94a3b8;
  background: #f8fafc;
  color: #0f172a;
}

.landing-root {
  --landing-primary: #0d9488;
  --landing-primary-2: #6366f1;
  --landing-ink: #0f172a;
  --landing-card-shadow: 0 20px 45px -26px rgba(15, 23, 42, 0.38);
  --p-primary-color: var(--landing-primary);
  --p-primary-hover-color: #0f766e;
  --p-primary-active-color: #115e59;
  --p-primary-contrast-color: #ffffff;
  --p-button-primary-background: var(--landing-primary);
  --p-button-primary-border-color: var(--landing-primary);
  --p-button-primary-hover-background: #0f766e;
  --p-button-primary-hover-border-color: #0f766e;
  --p-button-primary-active-background: #115e59;
  --p-button-primary-active-border-color: #115e59;
}

.card-fx {
  transition:
    transform 250ms ease,
    box-shadow 250ms ease,
    border-color 250ms ease;
}

.card-fx:hover {
  transform: translateY(-4px);
  box-shadow: var(--landing-card-shadow);
  border-color: rgba(99, 102, 241, 0.35);
}

.parallax-layer {
  background-image:
    radial-gradient(circle at 10% 10%, rgba(13, 148, 136, 0.24), transparent 35%),
    radial-gradient(circle at 90% 20%, rgba(99, 102, 241, 0.2), transparent 30%);
  background-attachment: fixed;
}

.hero-depth-1 {
  transform: translate3d(calc(var(--hero-offset-x, 0px) * -0.45), calc(var(--hero-offset-y, 0px) * -0.45), 0);
}

.hero-depth-2 {
  transform: translate3d(calc(var(--hero-offset-x, 0px) * 0.35), calc(var(--hero-offset-y, 0px) * 0.35), 0);
}

.hero-depth-3 {
  transform: translate3d(calc(var(--hero-offset-x, 0px) * 0.8), calc(var(--hero-offset-y, 0px) * 0.8), 0);
}

.marquee {
  overflow: hidden;
  white-space: nowrap;
}

.marquee-track {
  display: inline-block;
  min-width: 100%;
  animation: marqueeSlide 28s linear infinite;
}

.cta-glow {
  position: relative;
  overflow: hidden;
}

.hero-cta {
  background: var(--landing-primary);
  border: none;
}

.cta-glow::after {
  content: '';
  position: absolute;
  inset: -140% 35% auto auto;
  width: 35%;
  height: 340%;
  background: linear-gradient(to right, transparent, rgba(255, 255, 255, 0.45), transparent);
  transform: rotate(22deg);
  animation: ctaSweep 3.5s ease-in-out infinite;
}

.plan-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.85rem;
  border: 0;
  padding: 0.78rem 1rem;
  min-height: 3rem;
  font-size: 0.82rem;
  line-height: 1;
  letter-spacing: 0.04em;
  cursor: pointer;
  text-transform: uppercase;
  font-weight: 800;
  color: #ffffff;
  background: #0f766e;
  box-shadow:
    0 12px 22px -12px rgba(15, 118, 110, 0.85),
    inset 0 1px 0 rgba(255, 255, 255, 0.3);
  transition:
    transform 220ms ease,
    box-shadow 220ms ease,
    filter 220ms ease;
}

.plan-btn:hover {
  transform: translateY(-1px);
  filter: saturate(1.08);
  box-shadow:
    0 16px 30px -14px rgba(15, 118, 110, 0.65),
    inset 0 1px 0 rgba(255, 255, 255, 0.35);
  background: #115e59;
}

.plan-btn:active {
  transform: translateY(0);
}

.form-submit-btn {
  margin-top: 0.35rem;
  background: #0d9488;
  box-shadow:
    0 16px 30px -14px rgba(13, 148, 136, 0.72),
    inset 0 1px 0 rgba(255, 255, 255, 0.35);
}

.landing-input {
  width: 100%;
  border-radius: 0.75rem;
  border: 1px solid rgba(255, 255, 255, 0.22);
  background: rgba(255, 255, 255, 0.08);
  padding: 0.72rem 0.85rem;
  color: #ffffff;
  outline: none;
  transition:
    border-color 180ms ease,
    box-shadow 180ms ease,
    background 180ms ease;
}

.landing-input::placeholder {
  color: rgba(255, 255, 255, 0.62);
}

.landing-input:focus {
  border-color: rgba(99, 102, 241, 0.75);
  box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.2);
  background: rgba(255, 255, 255, 0.12);
}

.quiz-chip {
  border-radius: 9999px;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  padding: 0.5rem 0.9rem;
  font-size: 0.875rem;
  font-weight: 700;
  color: #334155;
  transition: all 180ms ease;
}

.quiz-chip:hover {
  border-color: rgba(99, 102, 241, 0.45);
  background: #eef2ff;
}

.quiz-chip-active {
  border-color: transparent;
  background: #0f766e;
  color: #ffffff;
  box-shadow: 0 8px 18px -10px rgba(15, 23, 42, 0.6);
}

.mobile-cta {
  padding-bottom: max(0px, env(safe-area-inset-bottom));
}

.float-slow {
  animation: floatSlow 9s ease-in-out infinite;
}

.float-fast {
  animation: floatFast 5s ease-in-out infinite;
}

@keyframes floatSlow {
  0%,
  100% {
    transform: translateY(0) translateX(0);
  }
  50% {
    transform: translateY(-16px) translateX(-8px);
  }
}

@keyframes floatFast {
  0%,
  100% {
    transform: translateY(0) scale(1);
  }
  50% {
    transform: translateY(-10px) scale(1.08);
  }
}

@keyframes marqueeSlide {
  0% {
    transform: translateX(0);
  }
  100% {
    transform: translateX(-50%);
  }
}

@keyframes ctaSweep {
  0%,
  60% {
    transform: translateX(-160%) rotate(22deg);
  }
  100% {
    transform: translateX(220%) rotate(22deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .card-fx,
  .float-slow,
  .float-fast,
  .marquee-track,
  .cta-glow::after,
  .reveal {
    animation: none !important;
    transition: none !important;
  }

  .reveal {
    opacity: 1;
    transform: none;
  }
}
</style>

