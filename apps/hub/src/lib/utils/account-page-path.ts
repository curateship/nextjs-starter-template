export function getAccountPagePath(slug?: string | null) {
  const normalized = (slug || '').trim().replace(/^\/+/, '')
  return normalized ? `/account/${normalized}` : '/account'
}
