export const PUBLIC_PROFILE_TEMPLATE_SLUG = 'my-profile'
export const PUBLIC_PROFILE_TEMPLATE_DISPLAY_PATH = '/profile/{user-name}'
export const PUBLIC_PROFILE_TEMPLATE_ACCOUNT_PATH = `/account/${PUBLIC_PROFILE_TEMPLATE_SLUG}`

function safelyDecodeRouteValue(value: string) {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

export function toPublicProfileUsername(value?: string | null) {
  return safelyDecodeRouteValue(value || "")
    .trim()
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, 100)
}

export function isValidPublicProfileUsername(value: string) {
  return /^[a-z0-9](?:[a-z0-9-]{0,98}[a-z0-9])?$/.test(value)
}

export function getPublicProfilePath(displayName?: string | null) {
  const username = toPublicProfileUsername(displayName)
  return isValidPublicProfileUsername(username) ? `/profile/${username}` : null
}

function normalizePathLikeUrl(value?: string | null) {
  const rawValue = (value || '').trim()
  if (!rawValue) return ''

  let pathWithQuery = rawValue

  if (/^https?:\/\//i.test(rawValue)) {
    try {
      pathWithQuery = new URL(rawValue).pathname
    } catch {
      return ''
    }
  }
  const path = safelyDecodeRouteValue(pathWithQuery.split(/[?#]/)[0] || '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')

  return path ? `/${path}` : ''
}

export function isPublicProfileTemplateLink(value?: string | null) {
  const path = normalizePathLikeUrl(value)
  return path === PUBLIC_PROFILE_TEMPLATE_ACCOUNT_PATH
    || path === PUBLIC_PROFILE_TEMPLATE_DISPLAY_PATH
}

export function normalizePublicProfileTemplateLink(value: string) {
  return isPublicProfileTemplateLink(value) ? PUBLIC_PROFILE_TEMPLATE_DISPLAY_PATH : value
}
