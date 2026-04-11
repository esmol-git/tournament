/**
 * Заготовка под push: когда появится продуктовая необходимость и бэкенд для токенов,
 * подключить expo-notifications и регистрацию здесь, не размазывая по экранам.
 */

export type NotificationScope = 'match_protocol' | 'match_reminder' | 'general'

export type PushRegistrationResult =
  | { status: 'unavailable'; reason: string }
  | { status: 'ready'; expoPushToken?: string }

/**
 * Зарегистрировать push (заглушка). Возвращает результат без побочных эффектов.
 */
export async function registerForPushNotificationsAsync(): Promise<PushRegistrationResult> {
  return { status: 'unavailable', reason: 'not_configured' }
}
