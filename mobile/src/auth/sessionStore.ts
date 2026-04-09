import * as SecureStore from 'expo-secure-store'

const K_ACCESS = 'tp_access_token'
const K_REFRESH = 'tp_refresh_token'
const K_META = 'tp_session_meta'

export type SessionMeta = {
  tenantSlug: string
  tenantName: string
}

export async function getAccessToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(K_ACCESS)
  } catch {
    return null
  }
}

export async function getRefreshToken(): Promise<string | null> {
  try {
    return await SecureStore.getItemAsync(K_REFRESH)
  } catch {
    return null
  }
}

export async function getSessionMeta(): Promise<SessionMeta | null> {
  try {
    const raw = await SecureStore.getItemAsync(K_META)
    if (!raw) return null
    return JSON.parse(raw) as SessionMeta
  } catch {
    return null
  }
}

export async function saveSession(params: {
  accessToken: string
  refreshToken: string
  meta: SessionMeta
}): Promise<void> {
  await SecureStore.setItemAsync(K_ACCESS, params.accessToken)
  await SecureStore.setItemAsync(K_REFRESH, params.refreshToken)
  await SecureStore.setItemAsync(K_META, JSON.stringify(params.meta))
}

export async function saveAccessToken(accessToken: string): Promise<void> {
  await SecureStore.setItemAsync(K_ACCESS, accessToken)
}

export async function clearSession(): Promise<void> {
  for (const key of [K_ACCESS, K_REFRESH, K_META]) {
    try {
      await SecureStore.deleteItemAsync(key)
    } catch {
      // ключ мог отсутствовать или хранилище недоступно
    }
  }
}
