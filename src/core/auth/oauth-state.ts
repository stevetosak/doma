export const OAUTH_STATE_COOKIE_NAME = 'doma_oauth_state'

export interface OAuthStatePayload {
  state: string
  codeVerifier: string
  returnTo: string
  inviteCode: string | undefined
}
