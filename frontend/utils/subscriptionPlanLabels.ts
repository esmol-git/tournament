/** Подписи к `SubscriptionPlan` с бэкенда (для таблиц и биллинга). */
export const SUBSCRIPTION_PLAN_LABELS_RU: Record<string, string> = {
  FREE: 'Бесплатный',
  AMATEUR: 'Любительская',
  PREMIER: 'Премьер-лига',
  CHAMPIONS: 'Лига чемпионов',
  WORLD_CUP: 'Чемпионат мира',
}

export function formatSubscriptionPlanLabel(plan: string | null | undefined): string {
  if (!plan) return '—'
  return SUBSCRIPTION_PLAN_LABELS_RU[plan] ?? plan
}

export const SUBSCRIPTION_STATUS_LABELS_RU: Record<string, string> = {
  NONE: 'Нет',
  TRIAL: 'Пробный',
  ACTIVE: 'Активна',
  PAST_DUE: 'Просрочена',
  CANCELED: 'Отменена',
}

export function formatSubscriptionStatusLabel(status: string | null | undefined): string {
  if (!status) return '—'
  return SUBSCRIPTION_STATUS_LABELS_RU[status] ?? status
}
