import { randomBytes, timingSafeEqual } from 'crypto'
import { getSeoAccessSnapshot, type SeoAccessSnapshot } from '@/lib/actions/seo/access'

const DEFAULT_LAUNCH_TTL_SECONDS = 60
const SERVICE_TOKEN_HEADER = 'x-seo-service-token'
const DEV_DEFAULTS = {
  SEO_APP_URL: 'http://127.0.0.1:5173',
  SEO_API_URL: 'http://127.0.0.1:8000',
} as const

function getOptionalEnvOrDevDefault(name: 'SEO_APP_URL' | 'SEO_API_URL') {
  const value = process.env[name]

  if (value) {
    return value
  }

  if (process.env.NODE_ENV !== 'production') {
    return DEV_DEFAULTS[name]
  }

  throw new Error(`${name} is not configured`)
}

function getSeoAppUrlFromEnv() {
  return getOptionalEnvOrDevDefault('SEO_APP_URL')
}

function getRequiredEnv(name: 'SEO_INTERNAL_API_TOKEN') {
  const value = process.env[name]

  if (value) {
    return value
  }

  throw new Error(`${name} is not configured`)
}

export function getSeoAppUrl() {
  return getSeoAppUrlFromEnv()
}

export function getSeoApiUrl() {
  return getOptionalEnvOrDevDefault('SEO_API_URL')
}

export function isUsingSeoDevDefaults() {
  return process.env.NODE_ENV !== 'production' && !process.env.SEO_APP_URL
}

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)

  if (left.length !== right.length) {
    return false
  }

  return timingSafeEqual(left, right)
}

export function createSeoLaunchSnapshot(user: {
  id: string
  email: string
  role?: string | null
}) {
  return getSeoAccessSnapshot(user)
}

export function createSeoLaunchCode() {
  return randomBytes(24).toString('base64url')
}

export function createSeoLaunchExpiresAt(ttlSeconds = DEFAULT_LAUNCH_TTL_SECONDS) {
  return new Date(Date.now() + ttlSeconds * 1000)
}

export function getSeoServiceTokenHeader() {
  return SERVICE_TOKEN_HEADER
}

export function isValidSeoServiceToken(token: string | null) {
  if (!token) {
    return false
  }

  return safeEqual(token, getRequiredEnv('SEO_INTERNAL_API_TOKEN'))
}
