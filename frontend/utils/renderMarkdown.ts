import MarkdownIt from 'markdown-it'
import taskLists from 'markdown-it-task-lists'
import DOMPurify from 'dompurify'

const md = new MarkdownIt({
  html: false,
  linkify: true,
  breaks: true,
}).use(taskLists, { enabled: false })

const PURIFY = {
  ADD_TAGS: ['input'],
  ADD_ATTR: ['checked', 'disabled', 'type', 'class'],
}

/**
 * Безопасный HTML из Markdown для предпросмотра и публичных страниц.
 */
export function renderMarkdownToHtml(source: string | null | undefined): string {
  const s = (source ?? '').trim()
  if (!s) return ''
  const raw = md.render(s)
  if (import.meta.server) {
    return raw
  }
  return DOMPurify.sanitize(raw, PURIFY)
}
