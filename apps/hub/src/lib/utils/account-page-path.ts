import {
  PUBLIC_PROFILE_TEMPLATE_DISPLAY_PATH,
  PUBLIC_PROFILE_TEMPLATE_SLUG,
} from '@/lib/utils/public-profile-path'

export function normalizeAccountPageSlug(slug?: string | null) {
  return (slug || '').trim().replace(/^\/+/, '')
}

export function isPublicProfileTemplateSlug(slug?: string | null) {
  return normalizeAccountPageSlug(slug) === PUBLIC_PROFILE_TEMPLATE_SLUG
}

export function getAccountPagePath(slug?: string | null) {
  const normalized = normalizeAccountPageSlug(slug)
  return normalized ? `/account/${normalized}` : '/account'
}

export function getAccountPageDisplayPath(slug?: string | null) {
  return isPublicProfileTemplateSlug(slug)
    ? PUBLIC_PROFILE_TEMPLATE_DISPLAY_PATH
    : getAccountPagePath(slug)
}

export function getAccountPagePreviewPath(slug?: string | null) {
  return isPublicProfileTemplateSlug(slug) ? null : getAccountPagePath(slug)
}
