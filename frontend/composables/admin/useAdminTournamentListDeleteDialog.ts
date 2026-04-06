import type { TournamentRow } from '~/types/admin/tournaments-index'
import { getApiErrorMessage } from '~/utils/apiError'
import type { Ref } from 'vue'
import { ref } from 'vue'

type AuthFetchFn = <T = unknown>(
  url: string,
  options?: Record<string, unknown>,
) => Promise<T>

/**
 * Диалог удаления / архивации турнира на странице списка.
 */
export function useAdminTournamentListDeleteDialog(options: {
  token: Ref<string | null>
  authFetch: AuthFetchFn
  apiUrl: (path: string) => string
  refreshList: () => void | Promise<void>
}) {
  const toast = useToast()
  const { t } = useI18n()
  const { token, authFetch, apiUrl, refreshList } = options

  const deleteDialogVisible = ref(false)
  const deleteTarget = ref<TournamentRow | null>(null)
  const deleteSaving = ref(false)

  function openDeleteDialog(row: TournamentRow) {
    deleteTarget.value = row
    deleteDialogVisible.value = true
  }

  async function confirmDeleteTournament() {
    if (!token.value || !deleteTarget.value) return
    const row = deleteTarget.value
    deleteSaving.value = true
    try {
      await authFetch(apiUrl(`/tournaments/${row.id}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token.value}` },
      })
      deleteDialogVisible.value = false
      deleteTarget.value = null
      await refreshList()
      toast.add({
        severity: 'success',
        summary: t('admin.tournaments_list.delete_toast_success'),
        life: 2500,
      })
    } catch (e: unknown) {
      toast.add({
        severity: 'error',
        summary: t('admin.tournaments_list.delete_toast_error_summary'),
        detail: getApiErrorMessage(e, t('admin.errors.request_failed')),
        life: 6000,
      })
    } finally {
      deleteSaving.value = false
    }
  }

  async function moveTournamentToArchive() {
    if (!token.value || !deleteTarget.value) return
    const row = deleteTarget.value
    if (row.status === 'ARCHIVED') {
      toast.add({
        severity: 'info',
        summary: t('admin.tournaments_list.archive_toast_already'),
        life: 2500,
      })
      return
    }
    deleteSaving.value = true
    try {
      await authFetch(apiUrl(`/tournaments/${row.id}`), {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token.value}` },
        body: { status: 'ARCHIVED' },
      })
      deleteDialogVisible.value = false
      deleteTarget.value = null
      await refreshList()
      toast.add({
        severity: 'success',
        summary: t('admin.tournaments_list.archive_toast_success'),
        life: 2500,
      })
    } catch (e: unknown) {
      toast.add({
        severity: 'error',
        summary: t('admin.tournaments_list.archive_toast_error_summary'),
        detail: getApiErrorMessage(e, t('admin.errors.request_failed')),
        life: 6000,
      })
    } finally {
      deleteSaving.value = false
    }
  }

  return {
    deleteDialogVisible,
    deleteTarget,
    deleteSaving,
    openDeleteDialog,
    confirmDeleteTournament,
    moveTournamentToArchive,
  }
}
