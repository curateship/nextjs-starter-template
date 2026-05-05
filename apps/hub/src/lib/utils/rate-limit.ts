type Bucket = {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

export function isRateLimited(key: string, limit: number, windowMs: number) {
  const now = Date.now()
  const current = buckets.get(key)

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return false
  }

  if (current.count >= limit) {
    return true
  }

  current.count += 1
  return false
}

function getConfiguredClientIpHeader() {
  return process.env.TRUSTED_CLIENT_IP_HEADER?.trim().toLowerCase() || ''
}

function getHeaderIp(headers: Headers, headerName: string) {
  const value = headers.get(headerName)
  if (!value) return null

  const parts = value.split(',').map(part => part.trim()).filter(Boolean)
  return parts[parts.length - 1] || null
}

export function getClientIp(headers: Headers) {
  const configuredHeader = getConfiguredClientIpHeader()
  if (configuredHeader) {
    return getHeaderIp(headers, configuredHeader)
  }

  return getHeaderIp(headers, 'cf-connecting-ip') || getHeaderIp(headers, 'true-client-ip')
}
