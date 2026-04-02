// @ts-ignore
import { fileURLToPath } from 'node:url'
import Aura from '@primeuix/themes/aura'
import { ru as primeVueRu } from 'primelocale/js/ru.js'
import { ADMIN_THEME_BOOT_INLINE_SCRIPT } from './constants/adminThemeBoot'

export default defineNuxtConfig({
  compatibilityDate: '2026-03-17',
  devtools: { enabled: true },
  devServer: {
    host: '0.0.0.0',
    port: 3000,
  },
  modules: [
    '@pinia/nuxt',
    '@nuxtjs/i18n',
    '@primevue/nuxt-module',
    '@nuxtjs/tailwindcss',
    '@nuxt/image',
    '@nuxt/fonts',
    '@nuxt/icon',
  ],
  i18n: {
    /** Иначе модуль ищет `<root>/i18n/locales`; у нас JSON в `<root>/locales` при srcDir `app/` */
    restructureDir: false,
    langDir: '../locales',
    locales: [
      { code: 'ru', language: 'ru-RU', file: 'ru.json', name: 'Русский' },
      { code: 'en', language: 'en-US', file: 'en.json', name: 'English' },
    ],
    lazy: true,
    defaultLocale: 'ru',
    strategy: 'no_prefix',
    detectBrowserLanguage: false,
    bundle: {
      optimizeTranslationDirective: false,
    },
  },
  runtimeConfig: {
    public: {
      /** Бэкенд NestJS (переопределяется через NUXT_PUBLIC_API_BASE) */
      apiBase: process.env.NUXT_PUBLIC_API_BASE || 'http://localhost:4000',
      /** Если slug не из стора (прямой заход на /admin/login), см. NUXT_PUBLIC_DEFAULT_TENANT_SLUG */
      defaultTenantSlug: process.env.NUXT_PUBLIC_DEFAULT_TENANT_SLUG || 'default',
    },
  },
  /** От `srcDir` (`app/`) поднимаемся к корню проекта, где лежит `assets/css/` */
  css: ['primeicons/primeicons.css', '../assets/css/admin-accents.css'],
  primevue: {
    directives: {
      include: ['tooltip'],
    },
    options: {
      /** Календарь, дни недели, подписи DatePicker / фильтров — на русском */
      locale: primeVueRu,
      theme: {
        preset: Aura,
        options: {
          darkModeSelector: '.dark-mode',
        },
      },
    },
  },
  // Tailwind module сам подключает ~/assets/css/tailwind.css по умолчанию
  /**
   * Hybrid rendering: SSR только для главной (`/`). Остальное — SPA (CSR), в т.ч. админка и публичные `/{tenant}/…`.
   * Упрощает сессию/cookies/middleware без гидратации; при росте проекта индексацию/SEO можно точечно включить.
   * Правило `/` должно идти до `/**`, чтобы корень не попал под catch-all.
   */
  ssr: true,
  routeRules: {
    '/': { ssr: true },
    '/**': { ssr: false },
  },
  vite: {
    server: {
      // Для локального multi-tenant через поддомены (lvh.me / localtest.me)
      // отключаем строгую whitelist-валидацию Host заголовка.
      allowedHosts: 'all' as any,
    },
    // Vite ругается, когда зависимости подхватываются в рантайме (CJS).
    // Пред-бандлим, чтобы не было лишних перезагрузок.
    optimizeDeps: {
      include: ['vuedraggable'],
    },
    resolve: {
      alias: {
        '~': fileURLToPath(new URL('./', import.meta.url)),
        '@': fileURLToPath(new URL('./', import.meta.url))
      }
    }
  },
  app: {
    /** Мягкая смена страницы в SPA; админка отключает через middleware. */
    pageTransition: {
      name: 'public-route-fade',
      // Важно для UX: предотвращает "миг" пустого слота, из-за которого футер успевает
      // подпрыгнуть вверх на долю секунды при переходе между публичными страницами.
      mode: 'in-out',
    },
    head: {
      title: 'Tournament Platform',
      charset: 'utf-8',
      viewport: 'width=device-width, initial-scale=1',
      link: [{ rel: 'icon', type: 'image/png', href: '/logo.png' }],
      htmlAttrs: {
        lang: 'ru',
      },
      script: [
        {
          innerHTML: ADMIN_THEME_BOOT_INLINE_SCRIPT,
          type: 'text/javascript',
          tagPosition: 'head',
          tagPriority: 'critical',
        },
      ],
    },
  },
})