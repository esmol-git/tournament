<template>
  <div class="landing-root bg-white text-slate-900">
    <header class="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
      <div class="scroll-progress" :style="{ transform: `scaleX(${scrollProgress})` }" />
      <div class="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div class="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="Турнирная платформа"
            width="36"
            height="36"
            class="h-9 w-9 shrink-0 object-contain"
          />
          <div class="min-w-0 leading-tight">
            <p class="landing-brand-tagline">Спортивные лиги и турниры</p>
            <p class="landing-brand-name">Турнирная платформа</p>
          </div>
        </div>

        <nav class="hidden items-center gap-7 text-sm font-semibold lg:flex">
          <a
            v-for="item in navItems"
            :key="item.label"
            :href="item.href"
            class="nav-link text-slate-700 transition hover:text-emerald-600"
            :class="{ 'nav-link-active': activeSection === item.targetId }"
            @click.prevent="scrollToSection(item.targetId)"
          >
            {{ item.label }}
          </a>
        </nav>

        <div class="flex items-center gap-2">
          <NuxtLink to="/admin/login" class="login-link-btn">
            Войти
          </NuxtLink>
          <Button label="Демо-доступ" @click="scrollToSection('demo-form')" />
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
        <div class="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 sm:py-24 lg:px-8 lg:py-28">
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
              <Button label="Запросить демо" size="large" class="hero-cta shadow-xl shadow-emerald-500/30" @click="scrollToSection('demo-form')" />
              <Button label="Смотреть тарифы" severity="secondary" outlined size="large" class="border-white/30 text-white" @click="scrollToSection('pricing')" />
            </div>
            <div class="mt-8 grid max-w-2xl grid-cols-2 gap-5 text-sm text-slate-300 sm:grid-cols-4">
              <div v-for="fact in heroFacts" :key="fact.label">
                <p class="text-2xl font-black text-white">{{ fact.value }}</p>
                <p class="mt-1">{{ fact.label }}</p>
              </div>
            </div>
            <div class="mt-7 flex flex-wrap gap-2">
              <button
                v-for="link in quickLinks"
                :key="link.id"
                type="button"
                class="hero-pill"
                @click="scrollToSection(link.id)"
              >
                {{ link.label }}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section id="benefits" class="section-anchor mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24 reveal">
        <div class="max-w-2xl reveal">
          <p class="text-sm font-bold uppercase tracking-[0.2em] text-emerald-600">Ваши выгоды</p>
          <h2 class="mt-3 text-3xl font-black leading-tight sm:text-4xl">
            Не просто витрина, а центр управления вашим турниром
          </h2>
        </div>
        <div class="mt-10 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          <article
            v-for="(item, idx) in benefits"
            :key="item.title"
            class="card-fx reveal rounded-2xl border border-slate-200 bg-white p-6 shadow-md transition hover:-translate-y-1.5"
            :style="revealDelayStyle(idx)"
          >
            <div class="benefit-icon mb-4 inline-flex h-11 w-11 items-center justify-center rounded-xl text-lg font-bold">
              <i :class="item.icon" />
            </div>
            <h3 class="text-xl font-bold">{{ item.title }}</h3>
            <p class="mt-3 text-slate-600">{{ item.text }}</p>
          </article>
        </div>
      </section>

      <section class="mx-auto max-w-7xl px-4 pb-6 sm:px-6 lg:px-8 reveal lg:pb-10">
        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <article
            v-for="(metric, idx) in animatedMetrics"
            :key="metric.label"
            ref="metricRefs"
            class="card-fx rounded-2xl border border-slate-200 bg-white p-5 shadow-md"
            :style="revealDelayStyle(idx)"
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
              <h2 class="mt-3 text-3xl font-black sm:text-4xl">Запуск в четыре шага</h2>
              <p class="mt-5 text-lg text-slate-600">
                Пошаговый онбординг: сначала данные и роли, затем публикация. Сроки зависят от объёма и того, что уже есть в таблицах.
              </p>
            </div>
            <div class="space-y-4">
              <div
                v-for="(step, idx) in launchSteps"
                :key="step.title"
                class="card-fx reveal flex gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-md"
                :style="revealDelayStyle(idx)"
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

      <section id="features" class="section-anchor relative overflow-hidden bg-slate-50 reveal">
        <div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_16%,rgba(16,185,129,0.09),transparent_36%),radial-gradient(circle_at_86%_85%,rgba(99,102,241,0.12),transparent_34%)]" />
        <div class="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div class="grid items-start gap-10 lg:grid-cols-2">
            <div>
              <p class="text-sm font-bold uppercase tracking-[0.2em] text-emerald-600">Функциональность</p>
              <h2 class="mt-3 text-3xl font-black leading-tight sm:text-4xl">
                Возможности платформы для футбольных лиг
              </h2>
              <p class="mt-5 text-lg text-slate-600">
                От заявочной кампании и календаря до протоколов матчей и статистики. Набор модулей зависит от тарифа и настроек организации.
              </p>
            </div>
            <div class="grid gap-4 sm:grid-cols-2">
              <div
                v-for="(feature, idx) in featureList"
                :key="feature"
                class="card-fx reveal rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 shadow-sm"
                :style="revealDelayStyle(idx)"
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
              Подключение внешних сервисов — по договорённости и возможностям тарифа (вебхуки, аналитика, уведомления). Не обещаем «из коробки» все интеграции сразу.
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
            <div class="mt-4 overflow-hidden rounded-xl border border-slate-200">
              <div class="flex">
                <div
                  class="bg-rose-50 px-4 py-3 text-sm text-rose-700 transition-all duration-300"
                  :style="{ width: `${caseSplit[item.title] ?? 50}%` }"
                >
                  <span class="font-bold">Было:</span> {{ item.before }}
                </div>
                <div
                  class="bg-emerald-50 px-4 py-3 text-sm text-emerald-700 transition-all duration-300"
                  :style="{ width: `${100 - (caseSplit[item.title] ?? 50)}%` }"
                >
                  <span class="font-bold">Стало:</span> {{ item.after }}
                </div>
              </div>
              <div class="border-t border-slate-200 px-3 py-2">
                <input
                  v-model.number="caseSplit[item.title]"
                  type="range"
                  min="25"
                  max="75"
                  class="w-full accent-emerald-600"
                >
              </div>
            </div>
            <p class="mt-4 text-sm font-semibold text-slate-700">{{ item.result }}</p>
          </article>
        </div>
      </section>

      <section id="pricing" class="section-anchor mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24 reveal">
        <div class="text-center">
          <p class="text-sm font-bold uppercase tracking-[0.2em] text-emerald-600">Тарифы</p>
          <h2 class="mt-3 text-3xl font-black sm:text-4xl">Выберите подходящий тариф</h2>
        </div>
        <div class="mt-10 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          <article
            v-for="(plan, idx) in plans"
            :key="plan.name"
            :class="[
              'card-fx reveal relative flex flex-col rounded-2xl border bg-white p-6 shadow-lg shadow-slate-200/70',
              plan.highlight
                ? 'border-emerald-500 ring-2 ring-emerald-100'
                : 'border-slate-200',
            ]"
            :style="revealDelayStyle(idx)"
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
            <a href="#demo-form" class="plan-btn mt-auto inline-flex w-full items-center justify-center rounded-xl px-5 py-3 text-sm font-bold uppercase tracking-wide" @click.prevent="requestDemoForPlan(plan.name)">
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

      <section id="testimonials" class="section-anchor bg-slate-50 reveal">
        <div class="mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8 lg:py-24">
          <div class="text-center">
            <p class="text-sm font-bold uppercase tracking-[0.2em] text-emerald-600">Отзывы</p>
            <h2 class="mt-3 text-3xl font-black sm:text-4xl">Нам доверяют ведущие футбольные лиги</h2>
          </div>
          <div class="mt-10 grid gap-6 md:grid-cols-3">
            <article
              v-for="(quote, idx) in testimonials"
              :key="quote.author"
              class="card-fx reveal rounded-2xl border border-slate-200 bg-white p-6 shadow-md"
              :style="revealDelayStyle(idx)"
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
          <article v-for="(faq, idx) in faqs" :key="faq.q" class="card-fx reveal rounded-2xl border border-slate-200 bg-white p-6 shadow-md" :style="revealDelayStyle(idx)">
            <h3 class="text-lg font-bold">{{ faq.q }}</h3>
            <p class="mt-2 text-slate-600">{{ faq.a }}</p>
          </article>
        </div>
      </section>

      <section id="demo-form" class="section-anchor bg-slate-950">
        <div class="mx-auto max-w-5xl px-4 py-16 text-center sm:px-6 lg:px-8 lg:py-24">
          <h2 class="text-3xl font-black leading-tight text-white sm:text-5xl">
            Создайте персональный футбольный сайт уже сегодня
          </h2>
          <p class="mx-auto mt-5 max-w-2xl text-lg text-slate-300">
            Получите бесплатный демо-доступ и запустите современный сайт лиги с удобной админкой.
          </p>
          <div class="mt-9">
            <Button label="Запросить демонстрацию" size="large" class="cta-glow shadow-xl shadow-emerald-500/30" @click="requestDemoForPlan(quizRecommendation.name)" />
          </div>
          <div class="mx-auto mt-5 flex max-w-3xl flex-wrap justify-center gap-2">
            <button type="button" class="quiz-chip" @click="requestDemoWithContext('Запуск лиги с нуля')">Запуск лиги с нуля</button>
            <button type="button" class="quiz-chip" @click="requestDemoWithContext('Переезд со старого сайта')">Переезд со старого сайта</button>
            <button type="button" class="quiz-chip" @click="requestDemoWithContext('Интеграция CRM и Telegram')">Интеграция CRM и Telegram</button>
          </div>
          <form
            class="mx-auto mt-10 grid max-w-3xl gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-left backdrop-blur sm:grid-cols-2"
            @submit.prevent="submitDemoForm"
          >
            <input
              v-model="demoForm.name"
              class="landing-input"
              :class="{ 'landing-input-error': showDemoNameError }"
              type="text"
              placeholder="Ваше имя"
            >
            <input
              v-model="demoForm.contact"
              class="landing-input"
              :class="{ 'landing-input-error': showDemoContactError }"
              type="text"
              placeholder="Телефон или Telegram"
            >
            <input
              v-model="demoForm.league"
              class="landing-input sm:col-span-2"
              :class="{ 'landing-input-error': showDemoLeagueError }"
              type="text"
              placeholder="Название лиги / турнира"
            >
            <textarea
              v-model="demoForm.message"
              class="landing-input min-h-24 sm:col-span-2"
              :class="{ 'landing-input-error': showDemoMessageError }"
              placeholder="Коротко опишите задачу"
            />
            <p
              v-if="showDemoNameError"
              class="sm:col-span-2 mt-0 text-[11px] leading-3 text-red-300"
            >
              {{ demoFormErrors.name }}
            </p>
            <p
              v-if="showDemoContactError"
              class="sm:col-span-2 mt-0 text-[11px] leading-3 text-red-300"
            >
              {{ demoFormErrors.contact }}
            </p>
            <p
              v-if="showDemoLeagueError"
              class="sm:col-span-2 mt-0 text-[11px] leading-3 text-red-300"
            >
              {{ demoFormErrors.league }}
            </p>
            <p
              v-if="showDemoMessageError"
              class="sm:col-span-2 mt-0 text-[11px] leading-3 text-red-300"
            >
              {{ demoFormErrors.message }}
            </p>
            <button
              type="submit"
              class="plan-btn form-submit-btn sm:col-span-2"
              :disabled="isSubmittingDemo || (demoSubmitAttempted && !canSubmitDemoForm)"
            >
              {{ isSubmittingDemo ? 'Отправляем...' : 'Отправить заявку' }}
            </button>
            <p v-if="demoJustSubmitted" class="sm:col-span-2 mt-1 text-center text-xs font-semibold text-emerald-300">
              Спасибо! Заявка отправлена, скоро свяжемся.
            </p>
          </form>
        </div>
      </section>
    </main>

    <footer id="contacts" class="section-anchor border-t border-slate-200 bg-white">
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
      <a href="#demo-form" class="plan-btn inline-flex w-full items-center justify-center rounded-xl px-5 py-3 text-sm font-bold uppercase tracking-wide" @click.prevent="scrollToSection('demo-form')">
        Запросить демо за 30 секунд
      </a>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import useVuelidate from '@vuelidate/core'
import { minLength, required } from '@vuelidate/validators'
import { useApiUrl } from '~/composables/useApiUrl'

const heroRef = ref<HTMLElement | null>(null)
const offsetX = ref(0)
const offsetY = ref(0)
let revealObserver: IntersectionObserver | null = null
let sectionObserver: IntersectionObserver | null = null
let cleanupHeroListeners: (() => void) | null = null
let metricObserver: IntersectionObserver | null = null
const metricRefs = ref<HTMLElement[]>([])
const toast = useToast()
const { apiUrl } = useApiUrl()
const demoSubmitAttempted = ref(false)
const isSubmittingDemo = ref(false)
const demoJustSubmitted = ref(false)
const scrollProgress = ref(0)
const demoForm = reactive({
  name: '',
  contact: '',
  league: '',
  message: '',
})
const demoRules = computed(() => ({
  name: { required, minLength: minLength(2) },
  contact: { required, minLength: minLength(5) },
  league: { required, minLength: minLength(2) },
  message: { required, minLength: minLength(5) },
}))
const demoV$ = useVuelidate(demoRules, demoForm, { $autoDirty: true })
const demoFormErrors = computed(() => ({
  name: demoForm.name.trim().length >= 2 ? '' : 'Укажите имя (минимум 2 символа).',
  contact:
    demoForm.contact.trim().length >= 5
      ? ''
      : 'Укажите контакт для связи (минимум 5 символов).',
  league:
    demoForm.league.trim().length >= 2
      ? ''
      : 'Укажите название лиги/турнира (минимум 2 символа).',
  message:
    demoForm.message.trim().length >= 5
      ? ''
      : 'Опишите задачу (минимум 5 символов).',
}))
const canSubmitDemoForm = computed(
  () =>
    !demoV$.value.$invalid &&
    !demoFormErrors.value.name &&
    !demoFormErrors.value.contact &&
    !demoFormErrors.value.league &&
    !demoFormErrors.value.message,
)
const showDemoNameError = computed(
  () => (demoSubmitAttempted.value || demoV$.value.name.$dirty) && !!demoFormErrors.value.name,
)
const showDemoContactError = computed(
  () => (demoSubmitAttempted.value || demoV$.value.contact.$dirty) && !!demoFormErrors.value.contact,
)
const showDemoLeagueError = computed(
  () => (demoSubmitAttempted.value || demoV$.value.league.$dirty) && !!demoFormErrors.value.league,
)
const showDemoMessageError = computed(
  () => (demoSubmitAttempted.value || demoV$.value.message.$dirty) && !!demoFormErrors.value.message,
)

function scrollToSection(targetId: string) {
  if (!process.client) return
  const el = document.getElementById(targetId)
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function requestDemoWithContext(context: string) {
  if (!demoForm.message.trim()) {
    demoForm.message = `Интересует: ${context}.`
  }
  scrollToSection('demo-form')
}

function requestDemoForPlan(planName: string) {
  if (!demoForm.message.trim()) {
    demoForm.message = `Интересует тариф "${planName}".`
  }
  scrollToSection('demo-form')
}

async function submitDemoForm() {
  demoSubmitAttempted.value = true
  demoV$.value.$touch()
  if (!canSubmitDemoForm.value) return
  isSubmittingDemo.value = true
  demoJustSubmitted.value = false
  try {
    await $fetch(apiUrl('/public/leads/demo'), {
      method: 'POST',
      body: {
        name: demoForm.name.trim(),
        contact: demoForm.contact.trim(),
        league: demoForm.league.trim(),
        message: demoForm.message.trim(),
        source: 'landing',
      },
    })
    toast.add({
      severity: 'success',
      summary: 'Заявка отправлена',
      detail: 'Спасибо! Мы свяжемся с вами в ближайшее время.',
      life: 4000,
    })
    demoForm.name = ''
    demoForm.contact = ''
    demoForm.league = ''
    demoForm.message = ''
    demoSubmitAttempted.value = false
    demoJustSubmitted.value = true
    setTimeout(() => {
      demoJustSubmitted.value = false
    }, 4000)
    demoV$.value.$reset()
  } catch {
    toast.add({
      severity: 'error',
      summary: 'Не удалось отправить заявку',
      detail: 'Попробуйте ещё раз через минуту или свяжитесь с нами по телефону.',
      life: 5000,
    })
  } finally {
    isSubmittingDemo.value = false
  }
}

const heroStyle = computed(() => ({
  '--hero-offset-x': `${offsetX.value}px`,
  '--hero-offset-y': `${offsetY.value}px`,
}))

const navItems = [
  { label: 'Возможности', href: '#features', targetId: 'features' },
  { label: 'Выгоды', href: '#benefits', targetId: 'benefits' },
  { label: 'Тарифы', href: '#pricing', targetId: 'pricing' },
  { label: 'Отзывы', href: '#testimonials', targetId: 'testimonials' },
  { label: 'Контакты', href: '#contacts', targetId: 'contacts' },
]
const quickLinks = [
  { id: 'benefits', label: 'Что получу' },
  { id: 'features', label: 'Возможности' },
  { id: 'pricing', label: 'Тарифы' },
  { id: 'demo-form', label: 'Демо за 30 сек' },
]
const activeSection = ref('benefits')
const sectionIds = ['benefits', 'features', 'pricing', 'testimonials', 'contacts', 'demo-form']

function revealDelayStyle(index: number) {
  const delay = Math.min(index, 8) * 70
  return { transitionDelay: `${delay}ms` }
}

const heroFacts = [
  { value: 'Быстро', label: 'старт без разработки с нуля' },
  { value: 'В одном месте', label: 'витрина, админка, турниры' },
  { value: 'Импорт', label: 'игроков из CSV / XLSX' },
  { value: 'По тарифу', label: 'лимиты и роли' },
]

const benefits = [
  {
    icon: 'pi pi-rocket',
    title: 'Быстрее запуск',
    text: 'Не тратите месяцы на разработку: базовый сайт и админка готовы сразу после подключения.',
  },
  {
    icon: 'pi pi-sitemap',
    title: 'Проще управление',
    text: 'Календарь, турнирные таблицы, заявки, составы и протоколы матчей собраны в одном интерфейсе.',
  },
  {
    icon: 'pi pi-shield',
    title: 'Безопаснее процесс',
    text: 'Роли пользователей, контроль доступа и централизованные данные снижают риск ошибок.',
  },
  {
    icon: 'pi pi-palette',
    title: 'Профессиональный вид',
    text: 'Современный дизайн и адаптивная верстка формируют доверие у игроков, болельщиков и партнеров.',
  },
  {
    icon: 'pi pi-chart-line',
    title: 'Работа с аудиторией',
    text: 'Новости, фото и видео — инструменты публикации; охват зависит от контента и продвижения, не только от платформы.',
  },
  {
    icon: 'pi pi-wallet',
    title: 'Экономия бюджета',
    text: 'Подписка обходится дешевле индивидуальной разработки и постоянной доработки отдельных модулей.',
  },
]

const launchSteps = [
  { num: '01', title: 'Бриф и цели', text: 'Согласуем задачи, состав данных и ожидания по срокам — без обещаний «магического» переноса с любого старого сайта.' },
  { num: '02', title: 'Настройка платформы', text: 'Организация, домен при необходимости, роли пользователей, тариф и включённые модули.' },
  { num: '03', title: 'Данные', text: 'Игроков можно загрузить из CSV/XLSX; команды — вручную или импортом CSV там, где это включено в тарифе. Остальное (новости, медиа, история матчей) переносится по плану: вручную или отдельными задачами под ваш кейс.' },
  { num: '04', title: 'Запуск', text: 'Публикуем витрину и админку, подключаем аналитику при необходимости и дорабатываем по обратной связи.' },
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
  'Роли и права в админке',
  'Импорт игроков из таблиц',
  'Публичная витрина и мобильная вёрстка',
  'Турниры, матчи, протоколы',
  'Новости и медиа',
  'Тарифы под размер лиги',
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
  { key: 'modules', value: 4, suffix: '+', label: 'основных раздела: витрина, турниры, команды, новости' },
  { key: 'roles', value: 3, suffix: '', label: 'роли в админке (по настройке тарифа)' },
  { key: 'mobile', value: 100, suffix: '%', label: 'адаптивная публичная витрина' },
  { key: 'import', value: 2, suffix: '', label: 'формата импорта игроков: CSV и XLSX' },
] as const

const metricDisplay = ref<Record<string, number>>({
  modules: 0,
  roles: 0,
  mobile: 0,
  import: 0,
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
    text: 'Удобная мобильная версия и понятный интерфейс для администраторов. Вопросы по платформе решаем через согласованные каналы.',
  },
  {
    author: 'Сергей Крестин',
    role: 'Основатель проекта',
    text: 'Платформа дает стабильную основу для роста турнира: от заявок до качественной публичной витрины.',
  },
]

const caseStudies = [
  {
    title: 'Региональная лига (пример)',
    before: 'Протоколы и таблицы вели вручную, частые ошибки при переносе счёта.',
    after: 'Единое место для матчей и публикации результатов; меньше ручных пересылок между файлами.',
    result: 'Типичный эффект — меньше согласований «кто что внёс», если процесс дисциплинирован.',
  },
  {
    title: 'Городской чемпионат (пример)',
    before: 'Устаревшая витрина, неудобно с телефона.',
    after: 'Адаптивная публичная часть и понятный календарь; push и прочие каналы — по настройке.',
    result: 'Удобство для зрителей зависит от контента и рекламы; платформа даёт техническую базу.',
  },
  {
    title: 'Детская лига (пример)',
    before: 'Разрозненные таблицы и переписки вместо одного источника правды.',
    after: 'Роли в админке и структурированные данные по сезонам — по мере заполнения.',
    result: 'Экономия времени на отчётах возможна, если заранее согласовать форматы данных.',
  },
]
const caseSplit = ref<Record<string, number>>(
  Object.fromEntries(caseStudies.map(item => [item.title, 50])),
)

const faqs = [
  {
    q: 'Сколько времени занимает запуск?',
    a: 'Первый рабочий контур (организация, роли, часть команд и игроков) часто укладывается в несколько дней. Полный перенос контента со старого сайта и «красивая» витрина без заготовок занимают дольше и оцениваются отдельно.',
  },
  {
    q: 'Можно ли перейти со старого сайта?',
    a: 'Автоматического переноса «с любого движка» нет. Игроков загружаем из CSV/XLSX; команды — вручную или CSV там, где это включено в тариф. Тексты, медиа и история матчей переносятся по плану: вручную или отдельными задачами.',
  },
  {
    q: 'Есть ли мобильная версия?',
    a: 'Публичные страницы и админка рассчитаны на адаптивную вёрстку; удобство на телефоне зависит ещё и от объёма данных на экране.',
  },
  {
    q: 'Что с поддержкой после запуска?',
    a: 'Каналы и время ответа зависят от тарифа и договора. Обновления платформы выкатываем регулярно; индивидуальные доработки — по согласованию.',
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
    return plans[3]!
  }
  if (quizTeamSize.value === 'medium' || quizMobile.value === 'yes') {
    return plans[2]!
  }
  return plans[1]!
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
  const updateScrollProgress = () => {
    const total = document.documentElement.scrollHeight - window.innerHeight
    if (total <= 0) {
      scrollProgress.value = 0
      return
    }
    scrollProgress.value = Math.min(Math.max(window.scrollY / total, 0), 1)
  }

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
  window.addEventListener('scroll', updateScrollProgress, { passive: true })
  window.addEventListener('resize', updateScrollProgress)
  updateScrollProgress()
  cleanupHeroListeners = () => {
    heroRef.value?.removeEventListener('mousemove', onMove)
    heroRef.value?.removeEventListener('mouseleave', onLeave)
    window.removeEventListener('scroll', updateScrollProgress)
    window.removeEventListener('resize', updateScrollProgress)
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

  sectionObserver = new IntersectionObserver(
    entries => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          activeSection.value = (entry.target as HTMLElement).id
        }
      }
    },
    { threshold: 0.35, rootMargin: '-30% 0px -55% 0px' },
  )
  for (const id of sectionIds) {
    const el = document.getElementById(id)
    if (el) sectionObserver.observe(el)
  }

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
  sectionObserver?.disconnect()
  sectionObserver = null
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

.section-anchor {
  scroll-margin-top: 5rem;
}

.scroll-progress {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 2px;
  transform-origin: left;
  background: linear-gradient(90deg, #14b8a6, #6366f1);
  transition: transform 90ms linear;
}

.nav-link {
  position: relative;
}

.nav-link::after {
  content: "";
  position: absolute;
  left: 0;
  bottom: -0.25rem;
  width: 100%;
  height: 2px;
  border-radius: 9999px;
  background: linear-gradient(90deg, #14b8a6, #6366f1);
  transform: scaleX(0);
  transform-origin: left;
  transition: transform 180ms ease;
}

.nav-link-active {
  color: #0f766e;
}

.nav-link-active::after {
  transform: scaleX(1);
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
  --landing-font-text:
    "Manrope",
    "Inter",
    "Segoe UI",
    Roboto,
    Arial,
    sans-serif;
  --landing-font-display:
    "Unbounded",
    "Manrope",
    "Inter",
    "Segoe UI",
    Roboto,
    Arial,
    sans-serif;
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
  font-family: var(--landing-font-text);
  letter-spacing: 0.002em;
}

.landing-root .landing-brand-tagline {
  margin: 0;
  max-width: 14rem;
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #64748b;
}

.landing-root .landing-brand-name {
  margin: 0.15rem 0 0;
  font-family: var(--landing-font-display);
  font-size: 1.0625rem;
  font-weight: 800;
  letter-spacing: -0.04em;
  line-height: 1.15;
  background: linear-gradient(100deg, #0f766e 0%, #0d9488 38%, #1e293b 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.landing-root :is(h1, h2) {
  font-family: var(--landing-font-display);
  letter-spacing: -0.02em;
}

.landing-root :is(h3, .plan-btn, .login-link-btn) {
  font-family: var(--landing-font-text);
  letter-spacing: 0.01em;
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

.benefit-icon {
  color: #0f766e;
  background: linear-gradient(135deg, #ccfbf1, #e0e7ff);
  box-shadow: 0 8px 20px -14px rgba(15, 118, 110, 0.55);
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

.hero-pill {
  border: 1px solid rgba(255, 255, 255, 0.24);
  background: rgba(255, 255, 255, 0.06);
  color: #e2e8f0;
  border-radius: 9999px;
  padding: 0.45rem 0.8rem;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  transition: all 180ms ease;
}

.hero-pill:hover {
  border-color: rgba(52, 211, 153, 0.55);
  background: rgba(16, 185, 129, 0.2);
  color: #f8fafc;
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
  background: linear-gradient(135deg, #0f766e, #0d9488);
  box-shadow:
    0 12px 22px -12px rgba(15, 118, 110, 0.85),
    inset 0 1px 0 rgba(255, 255, 255, 0.3);
  transition:
    transform 220ms ease,
    box-shadow 220ms ease,
    filter 220ms ease,
    background-position 220ms ease;
  background-size: 140% 140%;
  background-position: 20% 50%;
}

.plan-btn:hover {
  transform: translateY(-1px);
  filter: saturate(1.08);
  box-shadow:
    0 16px 30px -14px rgba(15, 118, 110, 0.65),
    inset 0 1px 0 rgba(255, 255, 255, 0.35);
  background: linear-gradient(135deg, #115e59, #0f766e);
  background-position: 80% 50%;
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

.form-submit-btn:disabled {
  cursor: not-allowed;
  opacity: 0.6;
  filter: grayscale(0.15);
  box-shadow: none;
}

.landing-input {
  width: 100%;
  border-radius: 0.75rem;
  border: 1px solid rgba(148, 163, 184, 0.45);
  background: rgba(15, 23, 42, 0.35);
  padding: 0.72rem 0.85rem;
  color: #ffffff;
  outline: none;
  transition:
    border-color 180ms ease,
    box-shadow 180ms ease,
    background 180ms ease;
}

.landing-input::placeholder {
  color: rgba(226, 232, 240, 0.72);
}

.landing-input:focus {
  border-color: rgba(99, 102, 241, 0.75);
  box-shadow: 0 0 0 4px rgba(99, 102, 241, 0.2);
  background: rgba(255, 255, 255, 0.12);
}

.landing-input-error {
  border-color: rgba(248, 113, 113, 0.95);
  box-shadow: 0 0 0 3px rgba(248, 113, 113, 0.18);
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

@media (max-width: 640px) {
  .landing-root h1 {
    font-size: 2.2rem;
    line-height: 1.05;
  }
}
</style>

