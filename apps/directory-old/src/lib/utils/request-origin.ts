function firstHeaderValue(value: string | null) {
  return value?.split(',')[0]?.trim() || ''
}

function getRequestOrigin(request: Request) {
  const headers = request.headers
  const forwardedProto = firstHeaderValue(headers.get('x-forwarded-proto'))
  const forwardedHost = firstHeaderValue(headers.get('x-forwarded-host'))
  const host = forwardedHost || firstHeaderValue(headers.get('host'))

  try {
    const requestUrl = new URL(request.url)
    const protocol = forwardedProto || requestUrl.protocol.replace(':', '')
    return new URL(`${protocol}://${host || requestUrl.host}`).origin
  } catch {
    return null
  }
}

export function isSameOriginRequest(request: Request) {
  const source = request.headers.get('origin') || request.headers.get('referer')
  if (!source) return false

  const requestOrigin = getRequestOrigin(request)
  if (!requestOrigin) return false

  try {
    return new URL(source).origin === requestOrigin
  } catch {
    return false
  }
}
