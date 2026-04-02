/** Строка списка пользователей в админке (`GET /users`) */
export interface UserRow {
  id: string
  username: string
  email: string | null
  name: string
  lastName: string
  role: string
  createdAt: string
  blocked: boolean
}
