import { getApiErrorCode, getApiErrorMessage } from './apiError'

type ToastAddPayload = {
  severity: 'success' | 'info' | 'warn' | 'error' | 'secondary' | 'contrast'
  summary: string
  detail?: string
  life?: number
}

export type ToastAddFn = (message: ToastAddPayload) => void

/**
 * Toast после неуспешного создания матча в расписании: дубликат (409 MATCH_DUPLICATE) — предупреждение, иначе ошибка.
 */
export function toastMatchScheduleCreateApiError(
  add: ToastAddFn,
  t: (key: string) => string,
  error: unknown,
  options?: { genericErrorLifeMs?: number },
): void {
  const dup = getApiErrorCode(error) === 'MATCH_DUPLICATE'
  const genericLife = options?.genericErrorLifeMs ?? 6000
  add({
    severity: dup ? 'warn' : 'error',
    summary: dup
      ? t('admin.tournament_page.match_duplicate_toast_summary')
      : t('admin.tournament_page.match_create_error_summary'),
    detail: getApiErrorMessage(error, t('admin.errors.request_failed')),
    life: dup ? 8000 : genericLife,
  })
}
