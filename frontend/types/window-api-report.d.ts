import type { ApiClientErrorPayload } from '~/utils/apiClientErrorLog'

declare global {
  interface Window {
    /** См. `reportApiClientPayload` в `utils/apiClientErrorLog.ts`. */
    __TP_REPORT_API_ERROR__?: (payload: ApiClientErrorPayload) => void
  }
}

export {}
