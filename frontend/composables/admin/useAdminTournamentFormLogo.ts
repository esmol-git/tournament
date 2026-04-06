import type { TournamentFormModel } from '~/composables/admin/useTournamentForm'
import { getApiErrorMessage } from '~/utils/apiError'
import type { Ref } from 'vue'
import { ref } from 'vue'

type AuthFetchFn = <T = unknown>(
  url: string,
  options?: Record<string, unknown>,
) => Promise<T>

const UPLOAD_FOLDER = 'tournaments'
const MAX_LOGO_BYTES = 15 * 1024 * 1024
const MAX_LOGO_MB = 15

/**
 * Загрузка и снятие логотипа турнира в форме создания/редактирования (список турниров).
 */
export function useAdminTournamentFormLogo(options: {
  token: Ref<string | null>
  authFetch: AuthFetchFn
  apiUrl: (path: string) => string
  form: TournamentFormModel
  editingId: Ref<string | null>
  refreshTournamentList: () => void | Promise<void>
}) {
  const toast = useToast()
  const { t } = useI18n()
  const { token, authFetch, apiUrl, form, editingId, refreshTournamentList } = options

  const logoFileInput = ref<HTMLInputElement | null>(null)
  const logoUploading = ref(false)
  const logoRemoving = ref(false)

  function triggerLogoPick() {
    if (logoUploading.value) return
    logoFileInput.value?.click()
  }

  async function onLogoFileChange(e: Event) {
    const target = e.target as HTMLInputElement | null
    const file = target?.files?.[0]
    if (!file) return
    if (!token.value) {
      toast.add({
        severity: 'warn',
        summary: t('admin.tournament_form.logo_toast_auth_summary'),
        detail: t('admin.tournament_form.logo_toast_auth_detail'),
        life: 4000,
      })
      if (target) target.value = ''
      return
    }

    if (!file.type.startsWith('image/')) {
      toast.add({
        severity: 'warn',
        summary: t('admin.tournament_form.logo_toast_bad_type_summary'),
        detail: t('admin.tournament_form.logo_toast_bad_type_detail'),
        life: 4000,
      })
      if (target) target.value = ''
      return
    }

    if (file.size > MAX_LOGO_BYTES) {
      toast.add({
        severity: 'warn',
        summary: t('admin.tournament_form.logo_toast_too_large_summary'),
        detail: t('admin.tournament_form.logo_toast_too_large_detail', { maxMb: MAX_LOGO_MB }),
        life: 4000,
      })
      if (target) target.value = ''
      return
    }

    logoUploading.value = true
    try {
      const body = new FormData()
      body.append('file', file)
      const res = await authFetch<{ key: string; url: string }>(
        apiUrl(`/upload?folder=${UPLOAD_FOLDER}`),
        {
          method: 'POST',
          body,
        },
      )
      const imageUrl = res.url
      form.logoUrl = imageUrl

      if (editingId.value) {
        try {
          await authFetch(apiUrl(`/tournaments/${editingId.value}`), {
            method: 'PATCH',
            body: { logoUrl: imageUrl },
          })
          await refreshTournamentList()
          toast.add({
            severity: 'success',
            summary: 'Логотип загружен и сохранён',
            life: 3000,
          })
        } catch (patchErr: unknown) {
          toast.add({
            severity: 'warn',
            summary: 'Файл загружен, но ссылка не записана в турнир',
            detail: `${getApiErrorMessage(patchErr)} — нажми «Сохранить».`,
            life: 7000,
          })
        }
      } else {
        toast.add({
          severity: 'success',
          summary: 'Логотип загружен',
          detail: 'Нажми «Создать», чтобы сохранить турнир.',
          life: 4000,
        })
      }
    } catch (err: unknown) {
      toast.add({
        severity: 'error',
        summary: 'Не удалось загрузить',
        detail: getApiErrorMessage(err),
        life: 6000,
      })
    } finally {
      logoUploading.value = false
      if (target) target.value = ''
    }
  }

  async function removeTournamentLogo(e?: MouseEvent) {
    e?.stopPropagation()
    e?.preventDefault()
    if (!form.logoUrl || logoUploading.value || logoRemoving.value) return

    form.logoUrl = ''

    if (editingId.value && token.value) {
      logoRemoving.value = true
      try {
        await authFetch(apiUrl(`/tournaments/${editingId.value}`), {
          method: 'PATCH',
          body: { logoUrl: null },
        })
        await refreshTournamentList()
        toast.add({
          severity: 'success',
          summary: t('admin.tournament_form.logo_toast_removed_summary'),
          life: 2500,
        })
      } catch (err: unknown) {
        toast.add({
          severity: 'error',
          summary: t('admin.tournament_form.logo_toast_remove_error_summary'),
          detail: getApiErrorMessage(err),
          life: 6000,
        })
      } finally {
        logoRemoving.value = false
      }
    }
  }

  return {
    logoFileInput,
    logoUploading,
    logoRemoving,
    triggerLogoPick,
    onLogoFileChange,
    removeTournamentLogo,
  }
}
