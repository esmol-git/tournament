/**
 * Переписывает URL файлов из S3/MinIO на прокси через API.
 * Старые ссылки на files.* остаются в БД — в UI подставляем рабочий адрес.
 */
export function resolveStorageUrl(
  url: string | null | undefined,
  apiBase?: string | null,
): string {
  const raw = String(url ?? '').trim()
  if (!raw) return ''

  const base = String(apiBase ?? '').trim().replace(/\/$/, '')
  if (!base) return raw

  try {
    const parsed = new URL(raw)

    // Уже API-прокси
    if (parsed.pathname.startsWith('/public/files/')) {
      return raw
    }

    // files.tournament-platform.ru/images/tenants/... → /public/files/tenants/...
    if (parsed.hostname === 'files.tournament-platform.ru') {
      const m = parsed.pathname.match(/^\/images\/(.+)$/)
      if (m?.[1]) {
        return `${base}/public/files/${m[1]}`
      }
    }

    // Прямой MinIO path-style: http://host:9000/images/tenants/...
    const bucketPath = parsed.pathname.match(/^\/([^/]+)\/tenants\/(.+)$/)
    if (bucketPath) {
      return `${base}/public/files/tenants/${bucketPath[2]}`
    }
  } catch {
    return raw
  }

  return raw
}
