const R2_URL_PREFIX = 'r2://'
const PRIVATE_R2_KEY_SEGMENTS = [
  '/ai-automation-references/',
]

export type R2MediaKeyParseResult =
  | { key: string; error: null }
  | { key: null; error: string }

export function parseR2MediaKey(value: string): R2MediaKeyParseResult {
  if (!value.startsWith(R2_URL_PREFIX)) {
    return { key: null, error: 'Invalid R2 URL' }
  }

  const key = value.slice(R2_URL_PREFIX.length).trim()
  if (!key || key.length > 1024 || key.startsWith('/') || key.includes('\0')) {
    return { key: null, error: 'Invalid R2 media key' }
  }

  if (key.split('/').some(segment => segment === '..')) {
    return { key: null, error: 'Invalid R2 media key' }
  }

  const normalizedKey = `/${key}`
  if (PRIVATE_R2_KEY_SEGMENTS.some(segment => normalizedKey.includes(segment))) {
    return { key: null, error: 'R2 media key is not public' }
  }

  return { key, error: null }
}

export type ExternalMediaUrlParseResult =
  | { url: URL; error: null }
  | { url: null; error: 'invalid_url' | 'invalid_scheme' | 'host_not_allowed' }

type R2ProxyEnvironment = Partial<Pick<NodeJS.ProcessEnv, 'R2_PUBLIC_URL' | 'R2_ACCOUNT_ID'>>

function getConfiguredR2Hosts(env: R2ProxyEnvironment) {
  const hosts = new Set<string>()
  if (env.R2_PUBLIC_URL) {
    try {
      hosts.add(new URL(env.R2_PUBLIC_URL).hostname.toLowerCase())
    } catch {
      // Invalid configuration must not broaden proxy access.
    }
  }
  if (env.R2_ACCOUNT_ID && /^[a-f0-9]{32}$/i.test(env.R2_ACCOUNT_ID)) {
    hosts.add(`${env.R2_ACCOUNT_ID.toLowerCase()}.r2.cloudflarestorage.com`)
  }
  return hosts
}

export function parseExternalMediaUrl(
  value: string,
  env: R2ProxyEnvironment = {
    R2_PUBLIC_URL: process.env.R2_PUBLIC_URL,
    R2_ACCOUNT_ID: process.env.R2_ACCOUNT_ID,
  },
): ExternalMediaUrlParseResult {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return { url: null, error: 'invalid_url' }
  }

  if (url.protocol !== 'https:') return { url: null, error: 'invalid_scheme' }
  if (url.username || url.password || (url.port && url.port !== '443')) {
    return { url: null, error: 'invalid_url' }
  }
  if (!getConfiguredR2Hosts(env).has(url.hostname.toLowerCase())) {
    return { url: null, error: 'host_not_allowed' }
  }

  return { url, error: null }
}
