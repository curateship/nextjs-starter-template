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
