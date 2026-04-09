<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'

definePageMeta({
  layout: 'admin-docs',
  adminOrgModeratorReadOnly: false,
})

const { t } = useI18n()

useHead(() => ({
  title: t('admin.docs.title'),
  meta: [{ name: 'description', content: t('admin.docs.subtitle') }],
}))

type TocItem = { id: string; label: string; children?: { id: string; label: string }[] }

const toc: TocItem[] = [
  { id: 'intro', label: 'Введение' },
  {
    id: 'formats',
    label: 'Форматы турниров',
    children: [
      { id: 'formats-catalog', label: 'Каталог форматов' },
      { id: 'formats-rules', label: 'Правила выбора формата' },
    ],
  },
  {
    id: 'settings',
    label: 'Настройки турнира',
    children: [
      { id: 'settings-core', label: 'Базовые параметры' },
      { id: 'settings-schedule', label: 'Параметры расписания' },
      { id: 'settings-risks', label: 'Типичные ошибки' },
    ],
  },
  {
    id: 'calendar-deep',
    label: 'Генерация календаря',
    children: [
      { id: 'calendar-modes', label: 'Режимы FLOW/STRICT' },
      { id: 'calendar-limits', label: 'Ограничения и валидации' },
      { id: 'calendar-replace', label: 'replaceExisting' },
      { id: 'calendar-ics', label: 'Экспорт и подписка (ICS)' },
    ],
  },
  {
    id: 'roles-matrix',
    label: 'Роли и доступы',
    children: [
      { id: 'roles-matrix-table', label: 'Матрица доступа' },
      { id: 'roles-route-locks', label: 'Что закрыто по маршрутам' },
    ],
  },
  {
    id: 'plans',
    label: 'Тарифы и функции',
    children: [
      { id: 'plans-levels', label: 'Уровни тарифов' },
      { id: 'plans-feature-matrix', label: 'Матрица возможностей' },
    ],
  },
  {
    id: 'presets',
    label: 'Рекомендуемые пресеты',
  },
  {
    id: 'roles',
    label: 'Доступ и роли',
    children: [
      { id: 'roles-who', label: 'Кто что может' },
      { id: 'roles-why', label: 'Зачем роли нужны' },
    ],
  },
  { id: 'dashboard', label: 'Дашборд' },
  { id: 'users', label: 'Пользователи' },
  { id: 'audit', label: 'Журнал действий' },
  { id: 'teams-players', label: 'Команды и игроки' },
  {
    id: 'references',
    label: 'Справочники',
    children: [
      { id: 'refs-when', label: 'Когда заполнять' },
      { id: 'refs-what', label: 'Что в справочниках' },
    ],
  },
  {
    id: 'competitions',
    label: 'Раздел «Соревнования»',
    children: [
      { id: 'comp-tournaments', label: 'Турниры: список' },
      { id: 'comp-matches', label: 'Матчи: общий список' },
      { id: 'comp-calendar', label: 'Календарь: обзор по организации' },
      { id: 'comp-media', label: 'Новости и галерея' },
    ],
  },
  {
    id: 'tournament',
    label: 'Турниры: как сделать правильно',
    children: [
      { id: 't-create', label: 'Создать турнир' },
      { id: 't-setup', label: 'Настройки турнира' },
      { id: 't-teams', label: 'Команды и заявки' },
      { id: 't-schedule', label: 'Расписание и генерация' },
      { id: 't-warnings', label: 'Предупреждения по расписанию' },
      { id: 't-matches', label: 'Матчи и протокол' },
      { id: 't-table', label: 'Таблица и статистика' },
      { id: 't-share-images', label: 'Картинки для соцсетей' },
      { id: 't-playoff', label: 'Плей-офф (если есть)' },
      { id: 't-publish', label: 'Публикация на сайте' },
    ],
  },
  {
    id: 'org',
    label: 'Профиль и настройки организации',
    children: [
      { id: 'org-profile', label: 'Мой профиль' },
      { id: 'org-settings', label: 'Настройки организации' },
      { id: 'org-social', label: 'Соцсети' },
    ],
  },
  {
    id: 'notifications',
    label: 'Уведомления (Telegram + Email)',
    children: [
      { id: 'notifications-setup', label: 'Как подключить' },
      { id: 'notifications-events', label: 'Какие события отправляются' },
      { id: 'notifications-errors', label: 'Типовые ошибки и решения' },
    ],
  },
  { id: 'tips', label: 'Советы' },
  { id: 'ideas', label: 'Идеи улучшений' },
]

const flatSectionIds = computed(() => {
  const ids: string[] = []
  for (const item of toc) {
    ids.push(item.id)
    if (item.children) ids.push(...item.children.map((c) => c.id))
  }
  return ids
})

const activeId = ref('intro')
const mobileTocVisible = ref(false)
let rafPending = false

function downloadPdf() {
  if (!import.meta.client) return
  // Браузер: «Печать → Сохранить в PDF»
  window.print()
}

function scrollToSection(id: string) {
  activeId.value = id
  mobileTocVisible.value = false
  const el = document.getElementById(id)
  if (!el) return
  const top = el.getBoundingClientRect().top + window.scrollY - 124
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
}

function updateActiveFromScroll() {
  const ids = flatSectionIds.value
  if (!ids.length) return

  const doc = document.documentElement
  const pageBottom = window.scrollY + window.innerHeight
  const nearBottom = pageBottom >= doc.scrollHeight - 48
  if (nearBottom) {
    activeId.value = ids[ids.length - 1] ?? 'intro'
    return
  }

  const focusY = window.scrollY + Math.max(140, Math.round(window.innerHeight * 0.4))
  const sections = ids
    .map((id) => {
      const node = document.getElementById(id)
      if (!node) return null
      const top = node.getBoundingClientRect().top + window.scrollY
      return { id, top }
    })
    .filter((x): x is { id: string; top: number } => !!x)
    .sort((a, b) => a.top - b.top)

  if (!sections.length) return

  let current = sections[0].id
  for (let i = 0; i < sections.length; i++) {
    const cur = sections[i]
    const next = sections[i + 1]
    const end = next ? next.top : Number.POSITIVE_INFINITY
    if (focusY >= cur.top && focusY < end) {
      current = cur.id
      break
    }
    if (focusY >= cur.top) current = cur.id
  }
  activeId.value = current
}

let scrollListener: (() => void) | null = null

onMounted(() => {
  updateActiveFromScroll()
  scrollListener = () => {
    if (rafPending) return
    rafPending = true
    requestAnimationFrame(() => {
      rafPending = false
      updateActiveFromScroll()
    })
  }
  window.addEventListener('scroll', scrollListener, { passive: true })
  window.addEventListener('resize', scrollListener, { passive: true })
})

onBeforeUnmount(() => {
  if (!scrollListener) return
  window.removeEventListener('scroll', scrollListener)
  window.removeEventListener('resize', scrollListener)
})

function isActive(id: string) {
  if (activeId.value === id) return true
  const parent = toc.find((x) => x.children?.some((c) => c.id === activeId.value))
  return parent?.id === id
}

function isChildActive(id: string) {
  return activeId.value === id
}
</script>

<template>
  <div class="admin-docs w-full">
    <div class="admin-docs-shell">
      <div class="admin-docs-layout">
        <div class="admin-docs-main min-w-0">
        <button
          type="button"
          class="docs-mobile-toc-btn lg:!hidden"
          :aria-expanded="mobileTocVisible"
          aria-label="Открыть оглавление"
          title="Оглавление"
          @click="mobileTocVisible = true"
        >
          <i class="pi pi-list" />
        </button>

      <Drawer
        v-model:visible="mobileTocVisible"
        position="right"
        header="Оглавление"
        class="lg:!hidden !w-[min(92vw,22rem)]"
      >
        <nav class="space-y-1.5 text-sm">
          <template v-for="item in toc" :key="`m-${item.id}`">
            <button
              type="button"
              class="block w-full rounded-lg px-2.5 py-2.5 text-left font-semibold"
              :class="isActive(item.id) ? 'docs-toc-active' : 'text-surface-800 dark:text-surface-100'"
              @click.prevent="scrollToSection(item.id)"
            >
              {{ item.label }}
            </button>
            <div v-if="item.children?.length" class="ml-2.5 border-l border-surface-200 pl-2.5 dark:border-surface-700">
              <button
                v-for="c in item.children"
                :key="`m-${c.id}`"
                type="button"
                class="block w-full rounded-md px-2.5 py-1.5 text-left text-xs"
                :class="isChildActive(c.id) ? 'font-semibold docs-toc-child-active' : 'text-muted-color'"
                @click.prevent="scrollToSection(c.id)"
              >
                {{ c.label }}
              </button>
            </div>
          </template>
        </nav>
      </Drawer>

      <div class="rounded-2xl border border-surface-200 bg-surface-0 p-5 shadow-sm dark:border-surface-700 dark:bg-surface-900 sm:p-7">
        <div class="flex flex-wrap items-start justify-between gap-3">
          <h1 class="text-2xl font-bold text-surface-900 dark:text-surface-0 sm:text-3xl">
            {{ t('admin.docs.title') }}
          </h1>
          <button
            type="button"
            class="docs-pdf-btn"
            @click="downloadPdf"
          >
            <i class="pi pi-file-pdf" />
            <span>Скачать PDF</span>
          </button>
        </div>
        <p class="mt-2 text-base text-muted-color">
          {{ t('admin.docs.subtitle') }}
        </p>
        <p class="mt-3 text-sm leading-relaxed text-surface-600 dark:text-surface-300">
          {{ t('admin.docs.how_to') }}
        </p>
      </div>

      <article id="intro" class="docs-block scroll-mt-28">
        <h2 class="docs-h2">Введение</h2>
        <p class="docs-p">
          Админка — это рабочее место организатора. Здесь вы создаёте турниры, добавляете команды, планируете матчи,
          ведёте результаты и публикуете материалы. Публичный сайт обновляется из этих данных, поэтому главный принцип
          простой: <strong>сначала порядок в данных — потом красивый сайт</strong>.
        </p>
        <div class="docs-callout">
          <p class="m-0 text-sm leading-relaxed text-surface-700 dark:text-surface-200">
            <strong>Быстрый старт:</strong> заполните площадки/стадионы и сезоны → создайте турнир → добавьте команды →
            сгенерируйте расписание → внесите результаты матчей.
          </p>
        </div>
      </article>

      <article id="formats" class="docs-block scroll-mt-28">
        <h2 class="docs-h2">Форматы турниров</h2>
        <p class="docs-p">
          В платформе есть 7 рабочих форматов. Выбор формата определяет структуру вкладок, правила генерации календаря
          и логику плей-офф. Ниже — практический каталог без технических кодов.
        </p>

        <h3 id="formats-catalog" class="docs-h3 scroll-mt-28">Каталог форматов</h3>
        <div class="docs-table-wrap">
          <table class="docs-table">
            <thead>
              <tr>
                <th>Формат</th>
                <th>Когда использовать</th>
                <th>Ключевые ограничения</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Одна группа</td>
                <td>Классический круговой чемпионат</td>
                <td>Число групп должно быть 1</td>
              </tr>
              <tr>
                <td>2 / 3 / 4 группы</td>
                <td>Лига с делением на группы и выходом в плей-офф</td>
                <td>Число групп фиксировано форматом</td>
              </tr>
              <tr>
                <td>Группы + плей-офф (гибко)</td>
                <td>Когда нужно вручную выбирать число групп (1..8)</td>
                <td>Команду в плей-офф: группы × выходящих = степень двойки</td>
              </tr>
              <tr>
                <td>Только плей-офф</td>
                <td>Кубковая сетка без группового этапа</td>
                <td>Число команд: 4/8/16/32/... (степень двойки), групп = 0</td>
              </tr>
              <tr>
                <td>Ручной режим</td>
                <td>Когда календарь ведётся полностью вручную</td>
                <td>Автогенерация календаря отключена</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3 id="formats-rules" class="docs-h3 scroll-mt-28">Правила выбора формата</h3>
        <ul class="docs-ul">
          <li>Если нужен автоматический круговой календарь — выбирайте «Одна группа» или «Группы».</li>
          <li>Если нужен кубок сразу без таблицы групп — «Только плей-офф».</li>
          <li>Если расписание и сетка должны быть строго под внешний регламент вручную — «Ручной режим».</li>
          <li>Для групповых форматов важно заранее оценить: хватит ли команд на равномерное деление по группам.</li>
        </ul>
      </article>

      <article id="settings" class="docs-block scroll-mt-28">
        <h2 class="docs-h2">Настройки турнира</h2>

        <h3 id="settings-core" class="docs-h3 scroll-mt-28">Базовые параметры</h3>
        <div class="docs-table-wrap">
          <table class="docs-table">
            <thead>
              <tr>
                <th>Параметр</th>
                <th>Что означает</th>
                <th>Практический совет</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Дата начала / окончания</td>
                <td>Рамки турнира для генерации календаря</td>
                <td>Ставьте реальные даты аренды площадок, иначе получите перепланирование</td>
              </tr>
              <tr>
                <td>Интервал между игровыми днями</td>
                <td>Шаг в днях между блоками туров</td>
                <td>Для еженедельной лиги обычно 7</td>
              </tr>
              <tr>
                <td>Разрешённые дни недели</td>
                <td>В какие дни можно ставить матчи</td>
                <td>Если пусто — можно в любой день</td>
              </tr>
              <tr>
                <td>Число кругов</td>
                <td>Сколько раз пары команд встречаются в группе</td>
                <td>1 — один круг, 2 — дома/в гостях</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3 id="settings-schedule" class="docs-h3 scroll-mt-28">Параметры расписания</h3>
        <div class="docs-table-wrap">
          <table class="docs-table">
            <thead>
              <tr>
                <th>Параметр</th>
                <th>Смысл</th>
                <th>Влияние на календарь</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Длительность матча (мин)</td>
                <td>Чистая длительность игры</td>
                <td>Входит в длину слота, влияет на вместимость дня</td>
              </tr>
              <tr>
                <td>Перерыв между матчами (мин)</td>
                <td>Пауза между слотами</td>
                <td>Слишком большой перерыв = меньше матчей в день</td>
              </tr>
              <tr>
                <td>Параллельные матчи</td>
                <td>Сколько матчей одновременно</td>
                <td>Увеличивает пропускную способность календаря</td>
              </tr>
              <tr>
                <td>Время старта дня</td>
                <td>С какого времени начинается расписание</td>
                <td>Можно задать отдельное время на разные дни недели</td>
              </tr>
              <tr>
                <td>Туров в день</td>
                <td>Сколько раундов размещать в один календарный день</td>
                <td>Критично для плотности и риска переполнения дня</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3 id="settings-risks" class="docs-h3 scroll-mt-28">Типичные ошибки</h3>
        <ul class="docs-ul">
          <li>Слишком много туров в день при позднем старте — календарь не помещается до полуночи.</li>
          <li>Слишком мало параллельных матчей для большого состава — турнир растягивается на слишком долгий срок.</li>
          <li>Неверное число групп для выбранного формата — генерация не стартует.</li>
          <li>Для плей-офф число участников не степень двойки — сетка не строится корректно.</li>
        </ul>
      </article>

      <article id="calendar-deep" class="docs-block scroll-mt-28">
        <h2 class="docs-h2">Генерация календаря</h2>

        <h3 id="calendar-modes" class="docs-h3 scroll-mt-28">Режимы размещения матчей</h3>
        <div class="docs-table-wrap">
          <table class="docs-table">
            <thead>
              <tr>
                <th>Режим</th>
                <th>Как работает</th>
                <th>Когда подходит</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Потоковый</td>
                <td>Матчи ставятся максимально плотно с учётом доступности команд</td>
                <td>Когда нужна максимальная плотность расписания</td>
              </tr>
              <tr>
                <td>Раунд за раундом</td>
                <td>Раунды идут блоками, более «спортивная» последовательность</td>
                <td>Когда важна чистая логика этапов по турам</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3 id="calendar-limits" class="docs-h3 scroll-mt-28">Ограничения и проверки</h3>
        <ul class="docs-ul">
          <li>Дата старта генерации должна быть внутри диапазона турнира.</li>
          <li>Разрешённые дни недели — только значения 0..6.</li>
          <li>Время старта дня и переопределения дней — строго в формате HH:mm.</li>
          <li>Если матчи не помещаются в день, генерация возвращает ошибку с подсказкой, что уменьшить/увеличить.</li>
          <li>Если календарь выходит за дату окончания турнира, генерация останавливается.</li>
        </ul>

        <h3 id="calendar-replace" class="docs-h3 scroll-mt-28">Пересоздание существующего календаря</h3>
        <p class="docs-p">
          По умолчанию генерация пересоздаёт календарь: удаляет матчи и события текущего турнира, затем создаёт новый
          набор. Это удобно для черновой фазы, но перед боевым запуском лучше подтверждать операцию отдельно в регламенте
          вашей команды.
        </p>

        <h3 id="calendar-ics" class="docs-h3 scroll-mt-28">Экспорт и подписка на календарь (ICS)</h3>
        <p class="docs-p">
          В карточке турнира доступны две кнопки: <strong>«Скачать ICS»</strong> и
          <strong>«Скопировать ссылку подписки»</strong>. Первая нужна для разового импорта, вторая — для
          автосинхронизации расписания в календарях участников.
        </p>
        <div class="docs-table-wrap">
          <table class="docs-table">
            <thead>
              <tr>
                <th>Сценарий</th>
                <th>Как использовать</th>
                <th>Когда подходит</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Скачать ICS</td>
                <td>Импортировать файл `.ics` вручную в календарь</td>
                <td>Нужен разовый снимок расписания</td>
              </tr>
              <tr>
                <td>Скопировать ссылку подписки</td>
                <td>Вставить URL подписки в Google/Apple Calendar</td>
                <td>Нужны автообновления при переносах матчей</td>
              </tr>
            </tbody>
          </table>
        </div>
        <ul class="docs-ul">
          <li><strong>Google Calendar:</strong> «Другие календари» → «Добавить по URL» → вставьте ссылку подписки.</li>
          <li><strong>Apple Calendar:</strong> «Файл» → «Новая подписка на календарь» → вставьте ссылку.</li>
          <li>Если расписание изменилось и обновление не видно сразу — дождитесь фоновой синхронизации клиента.</li>
        </ul>
      </article>

      <article id="roles-matrix" class="docs-block scroll-mt-28">
        <h2 class="docs-h2">Роли и доступы</h2>

        <h3 id="roles-matrix-table" class="docs-h3 scroll-mt-28">Матрица доступа</h3>
        <div class="docs-table-wrap">
          <table class="docs-table">
            <thead>
              <tr>
                <th>Раздел</th>
                <th>Админ организации</th>
                <th>Админ турнира</th>
                <th>Представитель команды</th>
                <th>Модератор</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Пользователи / Настройки / Соцсети</td>
                <td>Да</td>
                <td>Нет</td>
                <td>Нет</td>
                <td>Нет</td>
              </tr>
              <tr>
                <td>Турниры</td>
                <td>Да</td>
                <td>Да</td>
                <td>Ограниченно</td>
                <td>Ограниченно</td>
              </tr>
              <tr>
                <td>Справочники</td>
                <td>Да</td>
                <td>Да</td>
                <td>Обычно нет</td>
                <td>Нет</td>
              </tr>
              <tr>
                <td>Новости/Галерея организации</td>
                <td>Да</td>
                <td>Да</td>
                <td>Ограниченно</td>
                <td>Нет</td>
              </tr>
              <tr>
                <td>Общий календарь организации</td>
                <td>Да</td>
                <td>Да</td>
                <td>Ограниченно</td>
                <td>Нет</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3 id="roles-route-locks" class="docs-h3 scroll-mt-28">Что закрыто по маршрутам</h3>
        <ul class="docs-ul">
          <li>Для модератора закрыты: справочники, новости, галерея, матчи организации и общий календарь.</li>
          <li>Только администратор организации: пользователи, соцсети, настройки.</li>
          <li>Даже при прямом переходе по URL ограничение сохраняется (не только через меню).</li>
        </ul>
      </article>

      <article id="plans" class="docs-block scroll-mt-28">
        <h2 class="docs-h2">Тарифы и функции</h2>

        <h3 id="plans-levels" class="docs-h3 scroll-mt-28">Уровни тарифа</h3>
        <p class="docs-p">
          Логика платформы построена по уровням: Free → Amateur → Premier → Champions → World Cup. Каждая следующая
          ступень включает предыдущие и добавляет новые функции и лимиты.
        </p>

        <h3 id="plans-feature-matrix" class="docs-h3 scroll-mt-28">Матрица возможностей</h3>
        <div class="docs-table-wrap">
          <table class="docs-table">
            <thead>
              <tr>
                <th>Функция</th>
                <th>С какого тарифа</th>
                <th>Что это даёт</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Базовые турниры и публичный сайт</td>
                <td>Free</td>
                <td>Запуск базового турнира и публичной витрины</td>
              </tr>
              <tr>
                <td>Справочники (базовые)</td>
                <td>Amateur</td>
                <td>Сезоны, возрастные группы, категории команд</td>
              </tr>
              <tr>
                <td>Автоматизация турнира</td>
                <td>Premier</td>
                <td>Автогенерация календаря, расширенные сценарии</td>
              </tr>
              <tr>
                <td>Новости/медиа и брендирование</td>
                <td>Premier</td>
                <td>Новости, галерея, публичные настройки бренда</td>
              </tr>
              <tr>
                <td>Справочники (расширенные)</td>
                <td>Champions</td>
                <td>Документы, типы событий протокола, причины переносов</td>
              </tr>
              <tr>
                <td>Журнал аудита</td>
                <td>World Cup</td>
                <td>Полный лог действий админ-API</td>
              </tr>
              <tr>
                <td>Лимит турниров</td>
                <td>Free/Amateur/Premier/Champions/World Cup</td>
                <td>1 / 3 / 10 / 50 / без лимита</td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>

      <article id="presets" class="docs-block scroll-mt-28">
        <h2 class="docs-h2">Рекомендуемые пресеты</h2>
        <div class="docs-table-wrap">
          <table class="docs-table">
            <thead>
              <tr>
                <th>Сценарий</th>
                <th>Рекомендуемые параметры</th>
                <th>Комментарий</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Детская лига (выходные)</td>
                <td>allowedDays: сб/вс, intervalDays: 7, roundsPerDay: 1-2, simultaneous: 1-2</td>
                <td>Снижает перегруз детей и тренеров, удобно для родителей</td>
              </tr>
              <tr>
                <td>Городской кубок (короткий цикл)</td>
                <td>Формат плей-офф, roundsPerDay: 1, strict режим</td>
                <td>Предсказуемая сетка, меньше переносов</td>
              </tr>
              <tr>
                <td>Интенсивный мини-турнир</td>
                <td>matchDuration 35-40, break 5-10, simultaneous 2+, flow режим</td>
                <td>Максимум матчей в ограниченное окно</td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>

      <article id="roles" class="docs-block scroll-mt-28">
        <h2 class="docs-h2">Доступ и роли</h2>
        <p class="docs-p">
          В админке есть разные уровни доступа. Это нужно, чтобы сотрудник видел только те разделы, за которые отвечает,
          и не мог случайно изменить критичные настройки организации.
        </p>

        <h3 id="roles-who" class="docs-h3 scroll-mt-28">Кто что может</h3>
        <ul class="docs-ul">
          <li>
            <strong>Администратор организации</strong> — управляет пользователями, настройками организации, видимостью
            разделов на публичном сайте и доступами.
          </li>
          <li>
            <strong>Администратор турнира</strong> — ведёт конкретные турниры: команды, заявки, расписание, матчи,
            результаты, таблицы, плей-офф (если он предусмотрен форматом).
          </li>
          <li>
            <strong>Представитель команды</strong> — отвечает за составы команды: игроки, номера, заявки (в зависимости
            от настроек организации).
          </li>
          <li>
            <strong>Модератор</strong> — контрольный доступ: часть разделов может быть только для просмотра. Если вы не
            видите пункт меню — это нормально: он скрыт вашей ролью.
          </li>
        </ul>

        <h3 id="roles-why" class="docs-h3 scroll-mt-28">Зачем роли нужны</h3>
        <p class="docs-p">
          Роли защищают от ошибок. Например, чтобы секретарь турнира мог планировать матчи и вести протоколы, но не мог
          случайно удалить пользователя или поменять глобальные настройки сайта. Отдельные возможности могут зависеть
          от подписки: тогда пункт видно, но он не активен — интерфейс подскажет, что именно недоступно.
        </p>
      </article>

      <article id="dashboard" class="docs-block scroll-mt-28">
        <h2 class="docs-h2">Дашборд</h2>
        <p class="docs-p">
          Стартовая страница после входа: сводка по организации, ближайшие матчи, показатели (для ролей с полной
          аналитикой). У глобального модератора набор виджетов может быть упрощён — это ожидаемо.
        </p>
      </article>

      <article id="users" class="docs-block scroll-mt-28">
        <h2 class="docs-h2">Пользователи</h2>
        <p class="docs-p">
          Раздел только для <strong>администратора организации</strong>: создание и редактирование учётных записей,
          назначение ролей, блокировка доступа. Выдавайте роль по минимально необходимому объёму: так проще соблюдать
          конфиденциальность данных игроков и внутренних процессов.
        </p>
      </article>

      <article id="audit" class="docs-block scroll-mt-28">
        <h2 class="docs-h2">Журнал действий</h2>
        <p class="docs-p">
          История изменений в админке: кто что поменял и когда. Полезно, когда нужно разобраться, почему «вчера было
          одно, сегодня другое». В некоторых тарифах раздел может быть недоступен.
        </p>
        <div class="docs-callout">
          <p class="m-0 text-sm leading-relaxed text-surface-700 dark:text-surface-200">
            <strong>Практика:</strong> если «пропали матчи» или «изменилась таблица», сначала проверьте журнал действий
            по дате и пользователю — часто причина там.
          </p>
        </div>
      </article>

      <article id="teams-players" class="docs-block scroll-mt-28">
        <h2 class="docs-h2">Команды и игроки</h2>
        <p class="docs-p">
          <strong>Команды</strong> — карточки клубов: название, категория, логотип, связь с турнирами. <strong>Игроки</strong>
          — персональные данные и привязка к командам. Данные переиспользуются при заявках в турниры; дубли снижаются,
          если вести справочник аккуратно. Доступен импорт из таблиц — удобно при первичной загрузке базы.
        </p>
      </article>

      <article id="references" class="docs-block scroll-mt-28">
        <h2 class="docs-h2">Справочники</h2>

        <h3 id="refs-when" class="docs-h3 scroll-mt-28">Когда заполнять</h3>
        <p class="docs-p">
          Лучшее время — <strong>до старта сезона</strong> или хотя бы до первого созданного турнира. Справочники задают
          правильные варианты выбора в формах: меньше ручного ввода, меньше опечаток, проще отчётность.
        </p>

        <h3 id="refs-what" class="docs-h3 scroll-mt-28">Что в справочниках</h3>
        <ul class="docs-ul">
          <li><strong>Сезоны</strong> — группировка турниров по годам/периодам.</li>
          <li><strong>Соревнования / дисциплины</strong> — если организация ведёт несколько лиг/дивизионов.</li>
          <li><strong>Возрастные группы</strong> — если важна классификация (U12, U14 и т.д.).</li>
          <li><strong>Площадки / стадионы</strong> — где проходят матчи; используется в расписании и проверках конфликтов.</li>
          <li><strong>Судьи</strong> — назначения на матчи и отображение (если включено).</li>
          <li><strong>Причины переноса/отмены</strong> — единые объяснения переносов.</li>
          <li><strong>Типы событий протокола</strong> — что фиксируется в матче (голы/карточки/замены и т.п.).</li>
          <li><strong>Теги новостей и документы</strong> — контент и регламенты (если модуль включён).</li>
        </ul>
      </article>

      <article id="competitions" class="docs-block scroll-mt-28">
        <h2 class="docs-h2">Меню «Соревнования»</h2>

        <h3 id="comp-tournaments" class="docs-h3 scroll-mt-28">Турниры</h3>
        <p class="docs-p">
          Список турниров организации: создание, копирование шаблонов (если доступно), переход в карточку турнира. На
          списке видны статусы и ключевые даты. Вкладка шаблонов может быть недоступна для отдельных ролей — следуйте
          подсказкам интерфейса.
        </p>

        <h3 id="comp-matches" class="docs-h3 scroll-mt-28">Матчи: общий список</h3>
        <p class="docs-p">
          Раздел для работы с матчами по всей организации: создание, переносы, назначение площадки и судей, ведение
          протокола. Удобен, когда нужно быстро найти матч без захода в конкретный турнир.
        </p>

        <h3 id="comp-calendar" class="docs-h3 scroll-mt-28">Календарь: обзор по организации</h3>
        <p class="docs-p">
          Календарь показывает общую картину по дням: удобно секретарю, чтобы видеть занятость площадок и плотность тура.
          Если календарь недоступен — это может быть связано с ролью или подключённым тарифом.
        </p>
        <h3 id="comp-media" class="docs-h3 scroll-mt-28">Новости и галерея</h3>
        <p class="docs-p">
          Контент для сайта организации: новости, фото, медиа-материалы. Обычно публикации можно привязывать к конкретному
          турниру, чтобы на публичной стороне всё было структурировано.
        </p>
      </article>

      <article id="tournament" class="docs-block scroll-mt-28">
        <h2 class="docs-h2">Турниры: как сделать правильно</h2>
        <p class="docs-p">
          Ниже — подробный, понятный сценарий «от нуля до опубликованного турнира». Если идти по шагам, вы избежите
          большинства типичных проблем: пустых таблиц, кривого календаря и путаницы с составами.
        </p>

        <h3 id="t-create" class="docs-h3 scroll-mt-28">1) Создать турнир</h3>
        <p class="docs-p">
          Откройте «Турниры» → «Создать». Заполните базовые поля: название, сезон (если используете), даты, формат.
          Формат влияет на вкладки и возможности: например, для групповых турниров появятся группы, а для форматов
          «группы + плей‑офф» — инструменты плей‑офф.
        </p>
        <ul class="docs-ul">
          <li><strong>Название</strong>: делайте понятным для сайта (например: «Премьер‑лига · сезон 2026»).</li>
          <li><strong>Даты</strong>: они задают рамки календаря и помогают проверять «влезает ли расписание».</li>
          <li><strong>Формат</strong>: выбирайте по регламенту; если сомневаетесь — начните с более простого.</li>
        </ul>

        <h3 id="t-setup" class="docs-h3 scroll-mt-28">2) Настройки турнира</h3>
        <p class="docs-p">
          Настройки — это то, что определяет удобство календаря и корректность таблицы. Рекомендуемая практика:
          сначала настроить слот матча, затем генерировать календарь.
        </p>
        <ul class="docs-ul">
          <li><strong>Длительность матча</strong> и <strong>перерыв</strong>: формируют длительность слота в расписании.</li>
          <li><strong>Параллельные матчи</strong>: сколько игр может идти одновременно.</li>
          <li><strong>Игровые дни</strong>: какие дни недели разрешены и с какого времени начинается «игровой день».</li>
          <li><strong>Ограничения сезона</strong>: если есть дата окончания — генератор не должен выходить за неё.</li>
        </ul>

        <h3 id="t-teams" class="docs-h3 scroll-mt-28">3) Команды и заявки</h3>
        <p class="docs-p">
          Добавьте команды в турнир. Если формат с группами — распределите команды по группам. Проверьте, что
          у команд есть игроки и номера (если их используют протоколы). Так вы избежите ситуации, когда матч уже
          сыгран, а состав в протокол добавить нельзя или он «пустой».
        </p>
        <div class="docs-callout">
          <p class="m-0 text-sm leading-relaxed text-surface-700 dark:text-surface-200">
            <strong>Лайфхак:</strong> если у вас много команд, сначала заведите справочник команд и игроков, а потом
            добавляйте команды в турнир — это быстрее, чем создавать всё внутри турнира.
          </p>
        </div>

        <h3 id="t-schedule" class="docs-h3 scroll-mt-28">4) Расписание и генерация</h3>
        <p class="docs-p">
          Генератор создаёт календарь матчей автоматически. Обычно вы задаёте стартовую дату, интервалы между
          игровыми днями, туров в день и параметры слота (длительность + перерыв). После генерации:
          просмотрите первые 1–2 игровых дня; оцените равномерность нагрузки на команды; при необходимости —
          пересоздайте календарь с другими параметрами.
        </p>
        <ul class="docs-ul">
          <li><strong>Когда пересоздавать</strong>: если только что создали черновик и ещё не ведёте протоколы.</li>
          <li><strong>Когда править вручную</strong>: если нужно точечно сдвинуть несколько матчей, не ломая всё расписание.</li>
        </ul>

        <h3 id="t-warnings" class="docs-h3 scroll-mt-28">Предупреждения по расписанию</h3>
        <p class="docs-p">
          Предупреждение означает, что обнаружено пересечение по времени: у команды два матча, которые накладываются
          по времени, или площадка занята в пересекающееся время. Предупреждение не блокирует сохранение — вы можете
          быстро собрать черновик календаря и затем спокойно исправить спорные места.
        </p>
        <ul class="docs-ul">
          <li><strong>Как исправить</strong>: сдвиньте время, смените площадку, увеличьте перерыв, уменьшите параллельные игры.</li>
          <li><strong>На что обратить внимание</strong>: пересечение может быть «скрытым», если матчи начинаются в разное время, но пересекаются по длительности.</li>
        </ul>

        <h3 id="t-matches" class="docs-h3 scroll-mt-28">5) Матчи и протокол</h3>
        <p class="docs-p">
          В матчах вы фиксируете результаты и события. В зависимости от настроек регламента протокол может включать
          события (голы, карточки, замены и т.п.). После сохранения данные идут в статистику и таблицу. Завершённые
          матчи обычно защищены от некоторых правок расписания — это нормально.
        </p>

        <h3 id="t-table" class="docs-h3 scroll-mt-28">6) Таблица и статистика</h3>
        <p class="docs-p">
          Таблица пересчитывается по правилам турнира. Если что-то выглядит странно — проверьте, что результаты
          сохранены, статусы матчей корректны, и команды привязаны к нужным группам.
        </p>
        <p id="t-share-images" class="docs-p scroll-mt-28">
          <strong>Картинки для соцсетей.</strong> На странице турнира во вкладке
          <strong>«Таблица»</strong> и <strong>«Статистика»</strong> можно собрать PNG (фон, формат кадра, цвет
          текста, логотип) и скачать файл или скопировать изображение в буфер — удобно вставлять в Telegram и
          другие мессенджеры. Логотип и масштаб текста по умолчанию задаются в
          <strong>«Настройках организации»</strong> (блок про картинку таблицы). Сам файл на сервер не загружается:
          картинка собирается в браузере. Вкладка «Статистика» не грузит данные, пока вы на ней не находитесь; при
          каждом переходе на неё и после обновления турнира на странице (например, сохранён протокол) список
          перезапрашивается.
        </p>

        <h3 id="t-playoff" class="docs-h3 scroll-mt-28">7) Плей-офф (если есть)</h3>
        <p class="docs-p">
          Если формат предусматривает плей‑офф, после завершения групп можно сформировать сетку. Система подставит
          команды по местам из таблиц. Далее плей‑офф ведётся как обычные матчи: расписание → протокол → результат.
        </p>

        <h3 id="t-publish" class="docs-h3 scroll-mt-28">8) Публикация на сайте</h3>
        <p class="docs-p">
          Публикуйте турнир, когда он выглядит «как настоящий»: есть команды, расписание (хотя бы ближайшие матчи),
          понятное название и, по возможности, логотипы. Это повышает доверие и снижает вопросы от участников.
        </p>
      </article>

      <article id="org" class="docs-block scroll-mt-28">
        <h2 class="docs-h2">Профиль и настройки организации</h2>
        <ul class="docs-ul">
          <li id="org-profile" class="scroll-mt-28">
            <strong>Мой профиль</strong> — личные данные, язык интерфейса, тема оформления и, при наличии прав, смена
            части параметров аккаунта.
          </li>
          <li id="org-settings" class="scroll-mt-28">
            <strong>Настройки организации</strong> — видимость разделов на сайте, организационные параметры, включённые
            модули и общие правила. Обычно доступны только администратору организации.
          </li>
          <li id="org-social" class="scroll-mt-28">
            <strong>Соцсети</strong> — ссылки на каналы организации, которые отображаются на публичном сайте (если
            модуль включён).
          </li>
        </ul>
      </article>

      <article id="notifications" class="docs-block scroll-mt-28">
        <h2 class="docs-h2">Уведомления (Telegram + Email)</h2>
        <p class="docs-p">
          В платформе доступны два канала уведомлений: Telegram и Email. Оба настраиваются в разделе
          <strong> «Настройки организации»</strong> и работают независимо: можно включить один канал или оба сразу.
        </p>
        <div class="docs-callout">
          <p class="docs-p"><strong>Быстрый запуск за 2 минуты</strong></p>
          <ul class="docs-ul mb-0">
            <li>Откройте «Настройки организации» и выберите канал (Telegram и/или Email).</li>
            <li>Для Telegram нажмите «Найти мои чаты» и выберите нужный chat/channel.</li>
            <li>Для Email укажите получателей через запятую и включите email-канал.</li>
            <li>Сохраните настройки и отправьте тест для каждого канала.</li>
            <li>Проверьте блок «Последние доставки»: статус должен быть <strong>SENT</strong>.</li>
          </ul>
        </div>

        <h3 id="notifications-setup" class="docs-h3 scroll-mt-28">Как подключить</h3>
        <div class="docs-table-wrap">
          <table class="docs-table">
            <thead>
              <tr>
                <th>Канал</th>
                <th>Что указать</th>
                <th>Проверка</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Telegram</td>
                <td>Chat/channel ID (не username бота), события и тест</td>
                <td>Кнопка «Тестовое сообщение» + статус доставки `SENT`</td>
              </tr>
              <tr>
                <td>Email</td>
                <td>Получатели через запятую, события и тест</td>
                <td>Кнопка «Тестовое письмо» + письмо во входящих</td>
              </tr>
            </tbody>
          </table>
        </div>
        <ul class="docs-ul">
          <li>
            Для Telegram сначала добавьте бота в чат/канал, отправьте туда сообщение и нажмите
            <strong> «Найти мои чаты»</strong>.
          </li>
          <li>
            Для Email сервер должен быть настроен через SMTP-переменные в backend (`SMTP_HOST`, `SMTP_PORT`,
            `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`).
          </li>
          <li>После любого изменения нажимайте «Сохранить», затем запускайте тест канала.</li>
        </ul>

        <h3 id="notifications-events" class="docs-h3 scroll-mt-28">Какие события отправляются</h3>
        <ul class="docs-ul">
          <li><strong>Перенос/изменение времени матча:</strong> старое время, новое время, турнир, площадка, причина.</li>
          <li><strong>Публикация протокола:</strong> пары команд, счет, дата матча, турнир.</li>
          <li><strong>Скорый старт матча:</strong> зарезервировано под следующий этап (v1.1).</li>
        </ul>

        <h3 id="notifications-errors" class="docs-h3 scroll-mt-28">Типовые ошибки и решения</h3>
        <ul class="docs-ul">
          <li>
            <strong>`chat not found` (Telegram):</strong> указан не chat ID или бот не добавлен в чат. Выберите чат через
            «Найти мои чаты».
          </li>
          <li>
            <strong>`authentication failed 535` (Email):</strong> проблема SMTP-логина отправителя. Проверьте SMTP-провайдера,
            пароль приложения и перезапустите backend.
          </li>
          <li>
            <strong>Нет сообщений, но ошибок нет:</strong> проверьте, что канал включен и событие отмечено в настройках.
          </li>
          <li>
            <strong>Доставки нестабильны:</strong> откройте блок «Последние доставки» в настройках и проверьте `status`,
            `attempts`, `error`.
          </li>
        </ul>
      </article>

      <article id="tips" class="docs-block scroll-mt-28">
        <h2 class="docs-h2">Советы</h2>
        <ul class="docs-ul">
          <li>Сначала заполните справочники площадок и судей — это ускорит массовое планирование.</li>
          <li>Держите двух пользователей с правами редактирования на случай отпуска.</li>
          <li>После автогенерации календаря просмотрите первые туры глазами секретаря — учтите локальные праздники и аренду зала.</li>
          <li>Не игнорируйте предупреждения расписания: даже если сохранение разрешено, пересечения бьют по логистике команд.</li>
        </ul>
      </article>

      <article id="ideas" class="docs-block scroll-mt-28">
        <h2 class="docs-h2">Идеи улучшений</h2>
        <p class="docs-p">
          Идеи, которые заметно улучшают опыт организатора и участников.
        </p>
        <ul class="docs-ul">
          <li><strong>Экспорт расписания (ICS)</strong>: турнир/команда/площадка → Google/Apple Calendar.</li>
          <li><strong>Уведомления</strong>: переносы, публикация протокола, старт матча.</li>
          <li><strong>Мастер запуска турнира</strong>: пошаговый чек‑лист готовности.</li>
          <li><strong>Массовые операции</strong>: сдвиг времени, замена площадки, пакетные причины переносов.</li>
          <li><strong>Режим «день тура»</strong>: экран секретаря с матчами по порядку и быстрыми действиями.</li>
          <li><strong>Умные подсказки при конфликтах</strong>: предлагать ближайшие свободные слоты.</li>
        </ul>
      </article>
        </div>

        <!-- Правая колонка: без внутреннего скролла, единый «контейнер» со страницей -->
        <aside class="admin-docs-toc admin-docs-toc-sidebar" aria-label="Оглавление">
          <p class="mb-2 text-xs font-bold uppercase tracking-wide text-muted-color">
            Оглавление
          </p>
          <nav class="space-y-1 text-sm">
            <template v-for="item in toc" :key="item.id">
              <button
                type="button"
                class="block w-full rounded-lg px-3 py-2.5 text-left font-semibold transition-colors"
                :class="
                  isActive(item.id)
                  ? 'docs-toc-active'
                    : 'text-surface-700 hover:bg-surface-100 dark:text-surface-200 dark:hover:bg-surface-800'
                "
                @click.prevent="scrollToSection(item.id)"
              >
                {{ item.label }}
              </button>
              <div v-if="item.children?.length" class="ml-3 border-l border-surface-200 pl-3 dark:border-surface-700">
                <button
                  v-for="c in item.children"
                  :key="c.id"
                  type="button"
                  class="block w-full rounded-md px-2.5 py-1.5 text-left text-xs transition-colors"
                  :class="
                    isChildActive(c.id)
                    ? 'font-semibold docs-toc-child-active'
                    : 'text-muted-color docs-toc-child-hover'
                  "
                  @click.prevent="scrollToSection(c.id)"
                >
                  {{ c.label }}
                </button>
              </div>
            </template>
          </nav>
        </aside>
      </div>
    </div>
  </div>
</template>

<style scoped>
@media (min-width: 768px) {
  /* базовые правила для md+ ниже; тут оставляем хук */
}

.admin-docs-shell {
  border-radius: 1.25rem;
  border: 1px solid color-mix(in oklab, var(--p-surface-200) 22%, transparent);
  background: linear-gradient(
    180deg,
    color-mix(in oklab, var(--p-surface-900) 82%, transparent),
    color-mix(in oklab, var(--p-surface-950) 90%, transparent)
  );
  box-shadow: 0 18px 44px rgba(0, 0, 0, 0.28);
  /* Важно: sticky не работает внутри предков с overflow:hidden/auto */
  overflow: visible;
}

.docs-mobile-toc-btn {
  position: fixed;
  right: 0.75rem;
  bottom: 5rem;
  z-index: 90;
  height: 2.5rem;
  width: 2.5rem;
  border-radius: 9999px;
  border: 1px solid color-mix(in oklab, var(--p-surface-200) 35%, transparent);
  background: color-mix(in oklab, var(--p-surface-900) 78%, transparent);
  color: var(--p-surface-0);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  backdrop-filter: blur(2px);
}

.docs-mobile-toc-btn:active {
  transform: translateY(1px);
}

.docs-pdf-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  border-radius: 0.75rem;
  border: 1px solid color-mix(in oklab, var(--p-surface-200) 25%, transparent);
  background: color-mix(in oklab, var(--p-surface-900) 62%, transparent);
  padding: 0.55rem 0.85rem;
  font-size: 0.8rem;
  font-weight: 800;
  color: var(--p-surface-0);
  box-shadow: 0 10px 22px rgba(0, 0, 0, 0.22);
  transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
}

.docs-pdf-btn:hover {
  border-color: color-mix(in oklab, var(--p-primary-500) 45%, transparent);
  transform: translateY(-1px);
}

.docs-pdf-btn:active {
  transform: translateY(0);
}

.docs-toc-active {
  background: color-mix(in oklab, var(--p-primary-500) 18%, transparent);
  color: var(--p-primary-300);
}

.docs-toc-child-active {
  color: var(--p-primary-300);
}

.docs-toc-child-hover:hover {
  color: var(--p-primary-300);
}

@media print {
  :global(body) {
    background: #ffffff !important;
    color: #0f172a !important;
  }

  :global(header),
  .admin-docs-toc-sidebar,
  .docs-mobile-toc-btn,
  .docs-pdf-btn,
  :global(.p-drawer),
  :global(.p-drawer-mask) {
    display: none !important;
  }

  .admin-docs-shell {
    border: none !important;
    box-shadow: none !important;
    background: transparent !important;
  }

  .docs-h2,
  .docs-h3 {
    text-shadow: none !important;
  }

  .docs-p,
  .docs-ul {
    color: #0f172a !important;
  }

  @page {
    margin: 14mm;
  }
}

/* Две колонки: контент слева, оглавление справа */
.admin-docs-layout {
  display: block;
}

@media (min-width: 1024px) {
  .admin-docs-layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 20rem;
  }
}

.admin-docs-main {
  padding: 1rem;
}

@media (min-width: 640px) {
  .admin-docs-main {
    padding: 1.25rem;
  }
}

@media (min-width: 1024px) {
  .admin-docs-main {
    padding: 1.5rem;
  }
}

.admin-docs-toc-sidebar {
  display: none;
}

@media (min-width: 1024px) {
  .admin-docs-toc-sidebar {
    display: block;
    border-left: 1px solid color-mix(in oklab, var(--p-surface-200) 18%, transparent);
    padding: 1.25rem 1rem 1.5rem;
    /* Липкость без отдельного скролла внутри меню */
    position: sticky;
    top: 4rem;
    align-self: start;
    background: transparent;
    z-index: 10;
  }
}

.admin-docs-toc::-webkit-scrollbar {
  width: 6px;
}
.admin-docs-toc::-webkit-scrollbar-thumb {
  border-radius: 4px;
  background: var(--p-surface-300);
}

.docs-callout {
  border-radius: 1rem;
  border: 1px solid color-mix(in oklab, var(--p-primary-500) 30%, transparent);
  background: color-mix(in oklab, var(--p-primary-500) 10%, transparent);
  padding: 0.9rem 1rem;
}

.docs-table-wrap {
  overflow-x: auto;
  margin-bottom: 1rem;
  border: 1px solid color-mix(in oklab, var(--p-surface-200) 18%, transparent);
  border-radius: 0.85rem;
  background: color-mix(in oklab, var(--p-surface-900) 72%, transparent);
}

.docs-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.docs-table th,
.docs-table td {
  border-bottom: 1px solid color-mix(in oklab, var(--p-surface-200) 14%, transparent);
  padding: 0.6rem 0.7rem;
  text-align: left;
  vertical-align: top;
}

.docs-table th {
  font-weight: 800;
  color: #e2e8f0;
  background: color-mix(in oklab, var(--p-surface-900) 84%, transparent);
}

.docs-table td {
  color: #cbd5e1;
}

.docs-table tbody tr:last-child td {
  border-bottom: none;
}

.docs-block {
  margin-top: 2.5rem;
  padding-top: 0.5rem;
  scroll-margin-top: 7.75rem;
}

.docs-h2 {
  margin: 0 0 0.75rem;
  font-size: 1.35rem;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: #e2e8f0;
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.28);
}

.dark .docs-h2 {
  color: #e2e8f0;
}

.docs-h3 {
  margin: 1.5rem 0 0.5rem;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--p-primary-600);
  text-shadow: 0 1px 0 rgba(0, 0, 0, 0.18);
  scroll-margin-top: 7.5rem;
}

.dark .docs-h3 {
  color: var(--p-primary-300);
}

.docs-p {
  margin: 0 0 0.85rem;
  font-size: 0.9375rem;
  line-height: 1.7;
  color: #64748b;
}

.dark .docs-p {
  color: #cbd5e1;
}

.docs-ul {
  margin: 0 0 0.85rem;
  padding-left: 1.25rem;
  font-size: 0.9375rem;
  line-height: 1.75;
  color: #64748b;
}

.dark .docs-ul {
  color: #d1d5db;
}

.docs-ul li {
  margin-bottom: 0.45rem;
}
</style>
