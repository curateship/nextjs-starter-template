import { config } from '@/lib/config'

export interface ApiWorkspace {
  id: string
  name: string
  created_at: string
}

export interface SeoUser {
  id: string
  hub_user_id: string
  email: string
  role: string
  seo_access: boolean
}

class ApiError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit) {
  const response = await fetch(`${config.seoApiUrl}${path}`, {
    credentials: 'include',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  const text = await response.text()
  const body = text
    ? ((JSON.parse(text) as { detail?: string; [key: string]: unknown }))
    : null

  if (!response.ok) {
    throw new ApiError(body?.detail ?? 'Request failed', response.status)
  }

  return body as T
}

export async function getSeoUser() {
  return request<{ user: SeoUser }>('/api/v1/auth/me')
}

export async function logoutSeoSession() {
  await request<void>('/api/v1/auth/logout', {
    method: 'POST',
  })
}

export async function listWorkspaces() {
  return request<{ workspaces: ApiWorkspace[] }>('/api/v1/workspaces')
}

export async function createWorkspace(name: string) {
  return request<{ workspace: ApiWorkspace }>('/api/v1/workspaces', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export { ApiError }
