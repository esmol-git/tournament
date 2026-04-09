/**
 * Копирование PNG в буфер обмена (вставка в Telegram, Discord и т.д.).
 * Нужен secure context (HTTPS или localhost) и разрешение браузера.
 */
export function canCopyImageToClipboard(): boolean {
  if (typeof window === 'undefined') return false
  return !!(
    navigator.clipboard &&
    typeof navigator.clipboard.write === 'function' &&
    typeof ClipboardItem !== 'undefined'
  )
}

export async function copyPngBlobToClipboard(blob: Blob): Promise<void> {
  const pngBlob =
    blob.type === 'image/png' ? blob : new Blob([await blob.arrayBuffer()], { type: 'image/png' })
  await navigator.clipboard.write([
    new ClipboardItem({
      'image/png': pngBlob,
    }),
  ])
}
