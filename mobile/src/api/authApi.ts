import type { LoginResponse, SessionUser } from '../types/user'
import { apiRequest } from './client'

export type LoginBody = {
  username: string
  password: string
  tenantSlug: string
}

export async function login(body: LoginBody): Promise<LoginResponse> {
  return apiRequest<LoginResponse>('/auth/login', {
    method: 'POST',
    json: {
      username: body.username.trim().toLowerCase(),
      password: body.password,
      tenantSlug: body.tenantSlug.trim().toLowerCase(),
    },
    auth: false,
  })
}

export async function refreshSession(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
  return apiRequest<{ accessToken: string; refreshToken: string }>('/auth/refresh', {
    method: 'POST',
    json: { refreshToken },
    auth: false,
  })
}

export type MeResponse = SessionUser & {
  tenantSubscription?: unknown
  blocked?: boolean
}

export async function me(): Promise<MeResponse> {
  return apiRequest<MeResponse>('/auth/me', { method: 'GET' })
}

export async function logout(): Promise<void> {
  await apiRequest<{ success?: boolean }>('/auth/logout', { method: 'POST' })
}
