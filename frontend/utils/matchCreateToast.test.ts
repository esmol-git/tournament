import { describe, expect, it, vi } from 'vitest'
import { toastMatchScheduleCreateApiError } from './matchCreateToast'

const t = (key: string) =>
  ({
    'admin.tournament_page.match_duplicate_toast_summary': 'dup-summary',
    'admin.tournament_page.match_create_error_summary': 'err-summary',
    'admin.errors.request_failed': 'fallback',
  })[key] ?? key

describe('toastMatchScheduleCreateApiError', () => {
  it('uses warn and duplicate summary for MATCH_DUPLICATE', () => {
    const add = vi.fn()
    toastMatchScheduleCreateApiError(add, t, {
      data: { code: 'MATCH_DUPLICATE', message: 'already' },
    })
    expect(add).toHaveBeenCalledWith({
      severity: 'warn',
      summary: 'dup-summary',
      detail: 'already',
      life: 8000,
    })
  })

  it('uses error summary for other API errors', () => {
    const add = vi.fn()
    toastMatchScheduleCreateApiError(add, t, {
      data: { code: 'OTHER', message: 'nope' },
    })
    expect(add).toHaveBeenCalledWith({
      severity: 'error',
      summary: 'err-summary',
      detail: 'nope',
      life: 6000,
    })
  })

  it('respects genericErrorLifeMs', () => {
    const add = vi.fn()
    toastMatchScheduleCreateApiError(add, t, new Error('x'), {
      genericErrorLifeMs: 5000,
    })
    expect(add).toHaveBeenCalledWith(
      expect.objectContaining({ life: 5000 }),
    )
  })
})
