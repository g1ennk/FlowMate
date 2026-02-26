export interface AuthUser {
  id: string
  email: string | null
  nickname: string
}

export type AuthState =
  | { type: 'guest'; token: string }
  | { type: 'member'; accessToken: string; user: AuthUser }
