import type { TournamentRow } from '~/types/admin/tournaments-index'
import { getApiErrorMessage } from '~/utils/apiError'
import type { Ref } from 'vue'
import { ref } from 'vue'

type AuthFetchFn = <T = unknown>(
  url: string,
  options?: Record<string, unknown>,
) => Promise<T>

/**
 * Действия с карточкой турнира в списке: переходы, публикация на сайте.
 */
export function useAdminTournamentListCardActions(options: {
  token: Ref<string | null>
  authFetch: AuthFetchFn
  apiUrl: (path: string) => string
  tournaments: Ref<TournamentRow[]>
}) {
  const router = useRouter()
  const toast = useToast()
  const { t } = useI18n()
  const { token, authFetch, apiUrl, tournaments } = options

  const listPublishSavingId = ref<string | null>(null)

  function goToTournament(row: TournamentRow) {
    void router.push(`/admin/tournaments/${row.id}`)
  }

  function openTournamentNews(row: TournamentRow) {
    void router.push({ path: '/admin/news', query: { tournament: row.id } })
  }

  function openTournamentGallery(row: TournamentRow) {
    void router.push(`/admin/gallery/${row.id}`)
  }

  async function toggleTournamentListPublished(row: TournamentRow) {
    if (!token.value || listPublishSavingId.value) return
    const next = !row.published
    if (next && row.status === 'DRAFT') {
      toast.add({
        severity: 'warn',
        summary: t('admin.tournament_page.published_toggle_label'),
        detail: t('admin.tournament_page.published_draft_blocked_hint'),
        life: 6000,
      })
      return
    }
    listPublishSavingId.value = row.id
    try {
      await authFetch(apiUrl(`/tournaments/${row.id}`), {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token.value}` },
        body: { published: next },
      })
      const found = tournaments.value.find((x) => x.id === row.id)
      if (found) found.published = next
    } catch (e: unknown) {
      toast.add({
        severity: 'error',
        summary: t('admin.tournament_page.published_save_error'),
        detail: getApiErrorMessage(e),
        life: 5000,
      })
    } finally {
      listPublishSavingId.value = null
    }
  }

  return {
    listPublishSavingId,
    goToTournament,
    openTournamentNews,
    openTournamentGallery,
    toggleTournamentListPublished,
  }
}
