<script setup lang="ts">
import { computed, nextTick, ref, useId } from 'vue'
import { renderMarkdownToHtml } from '~/utils/renderMarkdown'

const model = defineModel<string>({ default: '' })

const props = withDefaults(
  defineProps<{
    /** Для связи с `<label>` */
    inputId?: string
    placeholder?: string
    rows?: number
    /** Короткие поля (примечания в справочниках) */
    compact?: boolean
  }>(),
  {
    rows: 6,
    compact: false,
  },
)

const { t } = useI18n()
const tab = ref<'edit' | 'preview'>('edit')
const textareaRef = ref<{ $el?: HTMLElement } | null>(null)

const effectiveRows = computed(() => (props.compact ? 3 : props.rows))

const previewHtml = computed(() => {
  const html = renderMarkdownToHtml(model.value)
  if (!html) {
    return `<p class="text-sm text-muted-color m-0">${escapeHtml(t('admin.markdown.preview_empty'))}</p>`
  }
  return html
})

function escapeHtml(s: string) {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function getNativeTextarea(): HTMLTextAreaElement | null {
  if (!import.meta.client) return null
  const vm = textareaRef.value as unknown as { $el?: HTMLElement } | null
  const root = vm?.$el
  if (!root) return null
  if (root instanceof HTMLTextAreaElement) return root
  return root.querySelector('textarea')
}

function ensureEdit() {
  tab.value = 'edit'
}

function wrapMarkers(before: string, after: string) {
  ensureEdit()
  void nextTick(() => {
    const el = getNativeTextarea()
    if (!el) return
    const value = model.value ?? ''
    const start = el.selectionStart
    const end = el.selectionEnd
    const sel = value.slice(start, end)
    const sample = t('admin.markdown.sample')
    const inner = sel.length ? sel : sample
    const insert = before + inner + after
    model.value = value.slice(0, start) + insert + value.slice(end)
    void nextTick(() => {
      el.focus()
      if (!sel.length) {
        const a = start + before.length
        el.setSelectionRange(a, a + sample.length)
      } else {
        const pos = start + insert.length
        el.setSelectionRange(pos, pos)
      }
    })
  })
}

function prefixCurrentLine(prefix: string) {
  ensureEdit()
  void nextTick(() => {
    const el = getNativeTextarea()
    if (!el) return
    const value = model.value ?? ''
    const pos = el.selectionStart
    const lineStart = value.lastIndexOf('\n', pos - 1) + 1
    const nextNl = value.indexOf('\n', lineStart)
    const lineEnd = nextNl === -1 ? value.length : nextNl
    const line = value.slice(lineStart, lineEnd)
    if (line.startsWith(prefix)) return
    model.value = value.slice(0, lineStart) + prefix + value.slice(lineStart)
    void nextTick(() => {
      el.focus()
      const newPos = pos + prefix.length
      el.setSelectionRange(newPos, newPos)
    })
  })
}

function insertAtCursor(snippet: string, cursorOffsetFromEnd = 0) {
  ensureEdit()
  void nextTick(() => {
    const el = getNativeTextarea()
    if (!el) return
    const value = model.value ?? ''
    const start = el.selectionStart
    const end = el.selectionEnd
    model.value = value.slice(0, start) + snippet + value.slice(end)
    void nextTick(() => {
      el.focus()
      const pos = start + snippet.length - cursorOffsetFromEnd
      el.setSelectionRange(pos, pos)
    })
  })
}

function onBold() {
  wrapMarkers('**', '**')
}

function onItalic() {
  wrapMarkers('*', '*')
}

/** Экранирование `[` `]` и `\` в тексте ссылки и alt у картинки. */
function escapeMdLinkOrAlt(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]')
}

const linkDialogVisible = ref(false)
const linkFormUrl = ref('https://')
const linkFormLabel = ref('')
const linkRange = ref({ start: 0, end: 0 })

const imageDialogVisible = ref(false)
const imageFormUrl = ref('https://')
const imageFormAlt = ref('')
const imageRange = ref({ start: 0, end: 0 })

const linkUrlId = useId()
const linkLabelId = useId()
const imageUrlId = useId()
const imageAltId = useId()

function openLinkDialog() {
  if (!import.meta.client) return
  ensureEdit()
  void nextTick(() => {
    const el = getNativeTextarea()
    if (!el) return
    const value = model.value ?? ''
    const start = el.selectionStart
    const end = el.selectionEnd
    linkRange.value = { start, end }
    linkFormLabel.value = value.slice(start, end)
    linkFormUrl.value = 'https://'
    linkDialogVisible.value = true
  })
}

function applyLink() {
  const url = linkFormUrl.value.trim()
  if (!url) return
  const labelRaw = linkFormLabel.value.trim() || t('admin.markdown.link_text')
  const label = escapeMdLinkOrAlt(labelRaw)
  const md = `[${label}](${url})`
  const { start, end } = linkRange.value
  const value = model.value ?? ''
  model.value = value.slice(0, start) + md + value.slice(end)
  linkDialogVisible.value = false
  void nextTick(() => {
    const el = getNativeTextarea()
    if (!el) return
    el.focus()
    const pos = start + md.length
    el.setSelectionRange(pos, pos)
  })
}

function openImageDialog() {
  if (!import.meta.client) return
  ensureEdit()
  void nextTick(() => {
    const el = getNativeTextarea()
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    imageRange.value = { start, end }
    imageFormUrl.value = 'https://'
    imageFormAlt.value = ''
    imageDialogVisible.value = true
  })
}

function applyImage() {
  const url = imageFormUrl.value.trim()
  if (!url) return
  const altRaw = imageFormAlt.value.trim() || t('admin.markdown.image_alt_default')
  const alt = escapeMdLinkOrAlt(altRaw)
  const md = `![${alt}](${url})`
  const { start, end } = imageRange.value
  const value = model.value ?? ''
  model.value = value.slice(0, start) + md + value.slice(end)
  imageDialogVisible.value = false
  void nextTick(() => {
    const el = getNativeTextarea()
    if (!el) return
    el.focus()
    const pos = start + md.length
    el.setSelectionRange(pos, pos)
  })
}

function onH1() {
  prefixCurrentLine('# ')
}

function onH2() {
  prefixCurrentLine('## ')
}

function onH3() {
  prefixCurrentLine('### ')
}

function onStrike() {
  wrapMarkers('~~', '~~')
}

function onBullet() {
  prefixCurrentLine('- ')
}

function onOrdered() {
  prefixCurrentLine('1. ')
}

function onParagraph() {
  insertAtCursor('\n\n')
}

function onHr() {
  insertAtCursor('\n---\n')
}

const btnClass =
  'h-7 w-7 shrink-0 p-0 text-surface-600 hover:text-surface-900 dark:text-surface-300 dark:hover:text-surface-0'

const headingBtnClass =
  'h-7 min-w-[2rem] shrink-0 px-1 py-0 text-[11px] font-bold text-surface-600 hover:text-surface-900 dark:text-surface-300 dark:hover:text-surface-0'

const tabBtnClass =
  'h-8 w-8 rounded-md p-0 text-sm font-medium transition-colors'
</script>

<template>
  <div class="admin-markdown-editor">
    <div
      class="overflow-hidden rounded-lg border border-surface-200 bg-surface-0 dark:border-surface-600 dark:bg-surface-900"
    >
      <div
        class="flex min-w-0 items-stretch border-b border-surface-200 bg-surface-50 dark:border-surface-700 dark:bg-surface-800/90"
        role="toolbar"
        :aria-label="t('admin.markdown.hint')"
      >
        <div
          class="flex min-h-[2.25rem] min-w-0 flex-1 flex-nowrap items-center gap-0.5 px-1 py-1"
        >
          <Button
            type="button"
            :class="headingBtnClass"
            severity="secondary"
            text
            rounded
            :aria-label="t('admin.markdown.tb_h1')"
            :title="t('admin.markdown.tb_h1')"
            @click="onH1"
          >
            H1
          </Button>
          <Button
            type="button"
            :class="headingBtnClass"
            severity="secondary"
            text
            rounded
            :aria-label="t('admin.markdown.tb_h2')"
            :title="t('admin.markdown.tb_h2')"
            @click="onH2"
          >
            H2
          </Button>
          <Button
            type="button"
            :class="headingBtnClass"
            severity="secondary"
            text
            rounded
            :aria-label="t('admin.markdown.tb_h3')"
            :title="t('admin.markdown.tb_h3')"
            @click="onH3"
          >
            H3
          </Button>
          <span class="mx-0.5 h-5 w-px shrink-0 self-center bg-surface-300 dark:bg-surface-600" aria-hidden="true" />
          <Button
            type="button"
            :class="btnClass"
            severity="secondary"
            text
            rounded
            :aria-label="t('admin.markdown.tb_bold')"
            :title="t('admin.markdown.tb_bold')"
            @click="onBold"
          >
            <span class="text-xs font-bold leading-none" aria-hidden="true">B</span>
          </Button>
          <Button
            type="button"
            :class="btnClass"
            severity="secondary"
            text
            rounded
            :aria-label="t('admin.markdown.tb_italic')"
            :title="t('admin.markdown.tb_italic')"
            @click="onItalic"
          >
            <span class="text-xs italic font-semibold leading-none" aria-hidden="true">I</span>
          </Button>
          <Button
            type="button"
            :class="btnClass"
            severity="secondary"
            text
            rounded
            :aria-label="t('admin.markdown.tb_strike')"
            :title="t('admin.markdown.tb_strike')"
            @click="onStrike"
          >
            <span class="text-xs font-semibold line-through" aria-hidden="true">S</span>
          </Button>
          <span class="mx-0.5 h-5 w-px shrink-0 self-center bg-surface-300 dark:bg-surface-600" aria-hidden="true" />
          <Button
            type="button"
            :class="btnClass"
            severity="secondary"
            text
            rounded
            :aria-label="t('admin.markdown.tb_link')"
            :title="t('admin.markdown.tb_link')"
            @click="openLinkDialog"
          >
            <i class="pi pi-link text-sm" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            :class="btnClass"
            severity="secondary"
            text
            rounded
            :aria-label="t('admin.markdown.tb_image')"
            :title="t('admin.markdown.tb_image')"
            @click="openImageDialog"
          >
            <i class="pi pi-image text-sm" aria-hidden="true" />
          </Button>
          <span class="mx-0.5 h-5 w-px shrink-0 self-center bg-surface-300 dark:bg-surface-600" aria-hidden="true" />
          <Button
            type="button"
            :class="btnClass"
            severity="secondary"
            text
            rounded
            :aria-label="t('admin.markdown.tb_paragraph')"
            :title="t('admin.markdown.tb_paragraph')"
            @click="onParagraph"
          >
            <i class="pi pi-align-justify text-sm" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            :class="btnClass"
            severity="secondary"
            text
            rounded
            :aria-label="t('admin.markdown.tb_hr')"
            :title="t('admin.markdown.tb_hr')"
            @click="onHr"
          >
            <i class="pi pi-minus text-sm" aria-hidden="true" />
          </Button>
          <span class="mx-0.5 h-5 w-px shrink-0 self-center bg-surface-300 dark:bg-surface-600" aria-hidden="true" />
          <Button
            type="button"
            :class="btnClass"
            severity="secondary"
            text
            rounded
            :aria-label="t('admin.markdown.tb_ul')"
            :title="t('admin.markdown.tb_ul')"
            @click="onBullet"
          >
            <i class="pi pi-list text-sm" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            :class="btnClass"
            severity="secondary"
            text
            rounded
            :aria-label="t('admin.markdown.tb_ol')"
            :title="t('admin.markdown.tb_ol')"
            @click="onOrdered"
          >
            <i class="pi pi-sort-numeric-down text-sm" aria-hidden="true" />
          </Button>
        </div>

        <div class="flex shrink-0 items-center border-l border-surface-200 px-1 py-1 dark:border-surface-600">
          <div
            class="inline-flex rounded-md border border-surface-200 bg-surface-0 p-0.5 dark:border-surface-600 dark:bg-surface-900"
            role="tablist"
            :aria-label="t('admin.markdown.tablist_aria')"
          >
            <button
              type="button"
              role="tab"
              :aria-selected="tab === 'edit'"
              :aria-label="t('admin.markdown.tab_edit')"
              :title="t('admin.markdown.tab_edit')"
              :class="[
                tabBtnClass,
                tab === 'edit'
                  ? 'bg-surface-50 text-surface-900 shadow-sm dark:bg-surface-800 dark:text-surface-0'
                  : 'text-muted-color hover:text-surface-800 dark:hover:text-surface-100',
              ]"
              @click="tab = 'edit'"
            >
              <i class="pi pi-pencil" aria-hidden="true" />
            </button>
            <button
              type="button"
              role="tab"
              :aria-selected="tab === 'preview'"
              :aria-label="t('admin.markdown.tab_preview')"
              :title="t('admin.markdown.tab_preview')"
              :class="[
                tabBtnClass,
                tab === 'preview'
                  ? 'bg-surface-50 text-surface-900 shadow-sm dark:bg-surface-800 dark:text-surface-0'
                  : 'text-muted-color hover:text-surface-800 dark:hover:text-surface-100',
              ]"
              @click="tab = 'preview'"
            >
              <i class="pi pi-eye" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <div v-show="tab === 'edit'" class="border-b border-transparent p-px dark:border-surface-800">
        <Textarea
          ref="textareaRef"
          :id="inputId"
          v-model="model"
          class="admin-markdown-editor__input w-full font-mono text-sm"
          :rows="effectiveRows"
          :placeholder="placeholder"
          :autoResize="compact"
        />
      </div>

      <ClientOnly>
        <div
          v-show="tab === 'preview'"
          class="markdown-preview min-h-[6rem] px-3 py-2 text-sm"
          v-html="previewHtml"
        />
        <template #fallback>
          <div
            v-show="tab === 'preview'"
            class="min-h-[6rem] px-3 py-2 text-sm text-muted-color"
          >
            …
          </div>
        </template>
      </ClientOnly>
    </div>

    <Dialog
      v-model:visible="linkDialogVisible"
      modal
      :header="t('admin.markdown.dialog_link_title')"
      :style="{ width: 'min(26rem, calc(100vw - 2rem))' }"
    >
      <form class="flex flex-col gap-3" @submit.prevent="applyLink">
        <div>
          <label class="mb-1 block text-sm" :for="linkUrlId">{{ t('admin.markdown.dialog_url') }}</label>
          <InputText
            :id="linkUrlId"
            v-model="linkFormUrl"
            class="w-full"
            type="url"
            autocomplete="url"
            placeholder="https://"
          />
        </div>
        <div>
          <label class="mb-1 block text-sm" :for="linkLabelId">{{ t('admin.markdown.dialog_link_label') }}</label>
          <InputText
            :id="linkLabelId"
            v-model="linkFormLabel"
            class="w-full"
            :placeholder="t('admin.markdown.link_text')"
          />
        </div>
        <div class="flex justify-end gap-2 pt-1">
          <Button type="button" :label="t('admin.markdown.dialog_cancel')" text @click="linkDialogVisible = false" />
          <Button
            type="submit"
            :label="t('admin.markdown.dialog_apply')"
            icon="pi pi-check"
            :disabled="!linkFormUrl.trim()"
          />
        </div>
      </form>
    </Dialog>

    <Dialog
      v-model:visible="imageDialogVisible"
      modal
      :header="t('admin.markdown.dialog_image_title')"
      :style="{ width: 'min(26rem, calc(100vw - 2rem))' }"
    >
      <form class="flex flex-col gap-3" @submit.prevent="applyImage">
        <div>
          <label class="mb-1 block text-sm" :for="imageUrlId">{{ t('admin.markdown.dialog_url') }}</label>
          <InputText
            :id="imageUrlId"
            v-model="imageFormUrl"
            class="w-full"
            type="url"
            autocomplete="url"
            placeholder="https://"
          />
        </div>
        <div>
          <label class="mb-1 block text-sm" :for="imageAltId">{{ t('admin.markdown.dialog_image_alt') }}</label>
          <InputText
            :id="imageAltId"
            v-model="imageFormAlt"
            class="w-full"
            :placeholder="t('admin.markdown.image_alt_default')"
          />
        </div>
        <div class="flex justify-end gap-2 pt-1">
          <Button type="button" :label="t('admin.markdown.dialog_cancel')" text @click="imageDialogVisible = false" />
          <Button
            type="submit"
            :label="t('admin.markdown.dialog_apply')"
            icon="pi pi-check"
            :disabled="!imageFormUrl.trim()"
          />
        </div>
      </form>
    </Dialog>

  </div>
</template>

<style scoped>
.admin-markdown-editor__input {
  width: 100%;
  border: none !important;
  border-radius: 0 !important;
  box-shadow: none !important;
  background: transparent;
  outline: none;
  resize: vertical;
}
.admin-markdown-editor__input:focus {
  box-shadow: none !important;
}
.markdown-preview :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 0.25rem;
}
.markdown-preview :deep(s),
.markdown-preview :deep(del) {
  text-decoration: line-through;
  opacity: 0.9;
}
.markdown-preview :deep(table) {
  width: 100%;
  border-collapse: collapse;
  margin: 0 0 0.5rem;
  font-size: 0.95em;
}
.markdown-preview :deep(th),
.markdown-preview :deep(td) {
  border: 1px solid var(--p-surface-300);
  padding: 0.35rem 0.5rem;
  text-align: left;
}
.dark-mode .markdown-preview :deep(th),
.dark-mode .markdown-preview :deep(td) {
  border-color: var(--p-surface-600);
}
.markdown-preview :deep(ul.contains-task-list),
.markdown-preview :deep(ol.contains-task-list) {
  list-style: none;
  padding-left: 0;
  margin-left: 0;
}
.markdown-preview :deep(li.task-list-item) {
  display: flex;
  align-items: flex-start;
  gap: 0.35rem;
  margin: 0.25rem 0;
}
.markdown-preview :deep(.task-list-item-checkbox) {
  margin-top: 0.2rem;
  flex-shrink: 0;
}
.markdown-preview :deep(h1) {
  font-size: 1.25rem;
  font-weight: 600;
  margin: 0.75rem 0 0.5rem;
}
.markdown-preview :deep(h2) {
  font-size: 1.1rem;
  font-weight: 600;
  margin: 0.65rem 0 0.4rem;
}
.markdown-preview :deep(h3) {
  font-size: 1rem;
  font-weight: 600;
  margin: 0.5rem 0 0.35rem;
}
.markdown-preview :deep(p) {
  margin: 0 0 0.5rem;
}
.markdown-preview :deep(ul),
.markdown-preview :deep(ol) {
  margin: 0 0 0.5rem;
  padding-left: 1.25rem;
}
.markdown-preview :deep(li) {
  margin: 0.15rem 0;
}
.markdown-preview :deep(a) {
  color: var(--p-primary-color);
  text-decoration: underline;
}
.markdown-preview :deep(code) {
  font-family: ui-monospace, monospace;
  font-size: 0.85em;
  background: var(--p-surface-100);
  padding: 0.1em 0.35em;
  border-radius: 0.25rem;
}
.dark-mode .markdown-preview :deep(code) {
  background: var(--p-surface-800);
}
.markdown-preview :deep(pre) {
  overflow-x: auto;
  padding: 0.75rem;
  border-radius: 0.375rem;
  background: var(--p-surface-100);
  margin: 0 0 0.5rem;
}
.dark-mode .markdown-preview :deep(pre) {
  background: var(--p-surface-800);
}
.markdown-preview :deep(pre code) {
  background: transparent;
  padding: 0;
}
.markdown-preview :deep(blockquote) {
  margin: 0 0 0.5rem;
  padding-left: 0.75rem;
  border-left: 3px solid var(--p-surface-300);
  color: var(--p-text-muted-color);
}
.markdown-preview :deep(hr) {
  margin: 0.75rem 0;
  border: none;
  border-top: 1px solid var(--p-surface-200);
}
</style>
