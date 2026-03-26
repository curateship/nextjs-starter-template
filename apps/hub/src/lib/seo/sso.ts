import { createHmac, timingSafeEqual } from 'crypto'
import { getSeoAccessSnapshot, type SeoAccessSnapshot } from '@/lib/seo/access'

const DEFAULT_SSO_TTL_SECONDS = 60
const SERVICE_TOKEN_HEADER = 'x-seo-service-token'
const DEV_DEFAULTS = {
  SEO_APP_URL: 'http://localhost:5173',
  SEO_SSO_SHARED_SECRET: 'dev-seo-sso-secret',
  SEO_INTERNAL_API_TOKEN: 'dev-seo-internal-token',
} as const

export interface SeoSsoClaims extends SeoAccessSnapshot {
  exp: number
}

function getEnvOrDevDefault(
  name: 'SEO_APP_URL' | 'SEO_SSO_SHARED_SECRET' | 'SEO_INTERNAL_API_TOKEN'
) {
  const value = process.env[name]

  if (value) {
    return value
  }

  if (process.env.NODE_ENV !== 'production') {
    return DEV_DEFAULTS[name]
  }

  throw new Error(`${name} is not configured`)
}

export function getSeoAppUrl() {
  return getEnvOrDevDefault('SEO_APP_URL')
}

export function isUsingSeoDevDefaults() {
  return process.env.NODE_ENV !== 'production' && !process.env.SEO_APP_URL
}

function signValue(value: string, secret: string) {
  return createHmac('sha256', secret).update(value).digest('base64url')
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)

  if (left.length !== right.length) {
    return false
  }

  return timingSafeEqual(left, right)
}

export function createSeoSsoClaims(user: {
  id: string
  email: string
  role?: string | null
}, ttlSeconds = DEFAULT_SSO_TTL_SECONDS): SeoSsoClaims {
  const snapshot = getSeoAccessSnapshot(user)

  return {
    ...snapshot,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  }
}

export function createSeoSsoToken(claims: SeoSsoClaims) {
  const encodedPayload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  const signature = signValue(encodedPayload, getEnvOrDevDefault('SEO_SSO_SHARED_SECRET'))

  return `${encodedPayload}.${signature}`
}

export function buildSeoLaunchUrl(token: string) {
  const appUrl = getSeoAppUrl()
  const url = new URL('/auth/sso', appUrl)
  url.searchParams.set('token', token)
  return url.toString()
}

export function getSeoServiceTokenHeader() {
  return SERVICE_TOKEN_HEADER
}

export function isValidSeoServiceToken(token: string | null) {
  if (!token) {
    return false
  }

  return safeEqual(token, getEnvOrDevDefault('SEO_INTERNAL_API_TOKEN'))
}
