export function getAccountPagePath(slug?: string | null) {
  const normalized = (slug || '').trim().replace(/^\/+/, '')
  return normalized ? `/${normalized}` : '/'
}
