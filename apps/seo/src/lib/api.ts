import { config } from '@/lib/config'
import type { SeoSession, SeoSessionUser } from '@/lib/session'

export interface ApiWorkspace {
  id: string
  name: string
  created_at: string
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
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  })

  const body = (await response.json().catch(() => null)) as
    | { detail?: string; [key: string]: unknown }
    | null

  if (!response.ok) {
    throw new ApiError(body?.detail ?? 'Request failed', response.status)
  }

  return body as T
}

export async function exchangeHubSsoToken(token: string) {
  return request<SeoSession>('/api/v1/auth/sso/exchange', {
    method: 'POST',
    body: JSON.stringify({ token }),
  })
}

export async function getSeoUser(token: string) {
  return request<{ user: SeoSessionUser }>('/api/v1/auth/me', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
}

export async function listWorkspaces(token: string) {
  return request<{ workspaces: ApiWorkspace[] }>('/api/v1/workspaces', {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  })
}

export async function createWorkspace(token: string, name: string) {
  return request<{ workspace: ApiWorkspace }>('/api/v1/workspaces', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ name }),
  })
}

export { ApiError }
