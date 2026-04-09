/** Зеркало backend `UserRole` (Prisma). */
export type UserRole =
  | 'SUPER_ADMIN'
  | 'TENANT_ADMIN'
  | 'TOURNAMENT_ADMIN'
  | 'TEAM_ADMIN'
  | 'MODERATOR'
  | 'USER'
  | 'REFEREE'

export type TenantSubscription = {
  plan?: string
  status?: string
  endsAt?: string | null
}

export type SessionUser = {
  id: string
  email: string | null
  username: string
  name: string
  lastName: string
  role: UserRole
  tenantId: string
  tenantSubscription?: TenantSubscription | null
}

export type TenantBrief = {
  id: string
  slug: string
  name: string
  subscriptionPlan?: string
  subscriptionStatus?: string
  subscriptionEndsAt?: string | null
}

export type LoginResponse = {
  accessToken: string
  refreshToken: string
  user: SessionUser
  tenant: TenantBrief
}
