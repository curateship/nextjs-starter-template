import { isSafeUrl, sanitizeUrl } from '@/lib/utils/url-validator'
import { isQuickLinkIconName } from '@/lib/utils/site-quick-links'

export interface SiteChromeSettings {
  navigation: Record<string, any> | null
  footer: Record<string, any> | null
}

function sanitizeUrlItems(items: unknown) {
  if (!Array.isArray(items)) return []

  return items
    .filter((item): item is Record<string, any> => !!item && typeof item === 'object')
    .map(item => {
      const sanitizedItem = {
        ...item,
        url: sanitizeUrl(item.url, ''),
      }

      if (!isQuickLinkIconName(item.icon)) {
        delete sanitizedItem.icon
      }

      return sanitizedItem
    })
    .filter(item => item.url)
}

export function sanitizeNavigationSettings(navigation: Record<string, any> | null | undefined) {
  if (!navigation || typeof navigation !== 'object') return null

  return {
    ...navigation,
    logo: isSafeUrl(navigation.logo) ? navigation.logo : '',
    logoUrl: sanitizeUrl(navigation.logoUrl, '/'),
    links: sanitizeUrlItems(navigation.links),
    buttons: sanitizeUrlItems(navigation.buttons),
  }
}

export function sanitizeFooterSettings(footer: Record<string, any> | null | undefined) {
  if (!footer || typeof footer !== 'object') return null

  return {
    ...footer,
    logo: isSafeUrl(footer.logo) ? footer.logo : '',
    logoUrl: sanitizeUrl(footer.logoUrl, '/'),
    links: sanitizeUrlItems(footer.links),
    socialLinks: sanitizeUrlItems(footer.socialLinks),
  }
}

export function resolveSiteNavigation(settings: Record<string, any> | null | undefined) {
  if (!settings) return null
  return sanitizeNavigationSettings(settings.navigation)
}

export function resolveSiteFooter(settings: Record<string, any> | null | undefined) {
  if (!settings) return null
  return sanitizeFooterSettings(settings.footer)
}

export function resolveSiteChrome(settings: Record<string, any> | null | undefined): SiteChromeSettings {
  return {
    navigation: resolveSiteNavigation(settings),
    footer: resolveSiteFooter(settings),
  }
}
