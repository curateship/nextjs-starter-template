export interface SeoSessionUser {
  id: string
  hub_user_id: string
  email: string
  role: string
  seo_access: boolean
}

export interface SeoSession {
  token: string
  user: SeoSessionUser
}

const SESSION_STORAGE_KEY = 'whateverseo.session'

export function getSeoSession() {
  if (typeof window === 'undefined') {
    return null
  }

  const raw = window.localStorage.getItem(SESSION_STORAGE_KEY)
  if (!raw) {
    return null
  }

  try {
    return JSON.parse(raw) as SeoSession
  } catch {
    window.localStorage.removeItem(SESSION_STORAGE_KEY)
    return null
  }
}

export function saveSeoSession(session: SeoSession) {
  window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
}

export function clearSeoSession() {
  window.localStorage.removeItem(SESSION_STORAGE_KEY)
}
