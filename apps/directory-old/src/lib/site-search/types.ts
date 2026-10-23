export const SITE_SEARCH_TYPES = [
  'page',
  'post',
  'product',
  'directory',
  'event',
  'category',
  'profile',
] as const

export type SiteSearchSourceType = typeof SITE_SEARCH_TYPES[number]
export type SiteSearchFilterType = 'all' | SiteSearchSourceType

export const SITE_SEARCH_TYPE_LABELS: Record<SiteSearchSourceType, string> = {
  page: 'Pages',
  post: 'Posts',
  product: 'Products',
  directory: 'Directory',
  event: 'Events',
  category: 'Categories',
  profile: 'Profiles',
}

export function isSiteSearchSourceType(value: unknown): value is SiteSearchSourceType {
  return typeof value === 'string' && SITE_SEARCH_TYPES.includes(value as SiteSearchSourceType)
}

export function normalizeSiteSearchTypes(value: unknown): SiteSearchSourceType[] {
  if (!Array.isArray(value)) return [...SITE_SEARCH_TYPES]

  const types = value.filter(isSiteSearchSourceType)
  return types.length ? [...new Set(types)] : [...SITE_SEARCH_TYPES]
}

export function isSiteSearchContentPrivate(contentBlocks: unknown) {
  if (!contentBlocks || typeof contentBlocks !== 'object') return false

  const settings = (contentBlocks as Record<string, unknown>)._settings
  if (!settings || typeof settings !== 'object') return false

  return (settings as Record<string, unknown>).is_private === true
}
