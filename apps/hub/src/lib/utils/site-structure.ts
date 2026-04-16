import { isSafeUrl, sanitizeUrl } from '@/lib/utils/url-validator'
import {
  isQuickLinkIconName,
  type QuickLinkIconName,
} from '@/lib/utils/site-quick-links'
import {
  getSavedNavigationButtonIds,
  normalizeNavigationActionItemOrder,
} from '@/lib/utils/navigation-action-items'

export interface SiteChromeSettings {
  navigation: Record<string, any> | null
  footer: Record<string, any> | null
}

export type NavigationActionStyle = 'primary' | 'outline' | 'ghost'

export interface NavigationActionSettings {
  text: string
  url: string
  style: NavigationActionStyle
  showOnMobile?: boolean
  icon?: QuickLinkIconName
}

export interface NavigationAccountMenuSettings {
  enabled: boolean
  login: NavigationActionSettings
  register: NavigationActionSettings
}

const NAVIGATION_ACTION_STYLES: readonly NavigationActionStyle[] = [
  'primary',
  'outline',
  'ghost',
]

const DEFAULT_LOGIN_ACTION: NavigationActionSettings = {
  text: 'Login',
  url: '',
  style: 'outline',
  showOnMobile: true,
}

const DEFAULT_REGISTER_ACTION: NavigationActionSettings = {
  text: 'Register',
  url: '',
  style: 'primary',
  showOnMobile: true,
}

function isNavigationActionStyle(
  value: unknown
): value is NavigationActionStyle {
  return NAVIGATION_ACTION_STYLES.includes(value as NavigationActionStyle)
}

export function buildAccountMenuAuthUrl(
  publicAuthPagePath: string | null | undefined,
  tab: 'login' | 'register'
) {
  const path = sanitizeUrl(publicAuthPagePath, '')
  if (!path) return ''
  return `${path}${path.includes('?') ? '&' : '?'}tab=${tab}`
}

export function createDefaultNavigationAccountMenu(
  publicAuthPagePath?: string | null
): NavigationAccountMenuSettings {
  return {
    enabled: true,
    login: {
      ...DEFAULT_LOGIN_ACTION,
      url: buildAccountMenuAuthUrl(publicAuthPagePath, 'login'),
    },
    register: {
      ...DEFAULT_REGISTER_ACTION,
      url: buildAccountMenuAuthUrl(publicAuthPagePath, 'register'),
    },
  }
}

function sanitizeNavigationActionSettings(
  value: unknown,
  fallback: NavigationActionSettings
): NavigationActionSettings {
  const raw = value && typeof value === 'object'
    ? value as Record<string, unknown>
    : {}

  return {
    text: typeof raw.text === 'string' && raw.text.trim()
      ? raw.text.trim()
      : fallback.text,
    url: sanitizeUrl(typeof raw.url === 'string' ? raw.url : undefined, fallback.url),
    style: isNavigationActionStyle(raw.style) ? raw.style : fallback.style,
    showOnMobile: typeof raw.showOnMobile === 'boolean'
      ? raw.showOnMobile
      : fallback.showOnMobile === true,
    icon: isQuickLinkIconName(raw.icon) ? raw.icon : fallback.icon,
  }
}

export function normalizeNavigationAccountMenu(
  value: unknown,
  publicAuthPagePath?: string | null
): NavigationAccountMenuSettings {
  const fallback = createDefaultNavigationAccountMenu(publicAuthPagePath)

  if (!value || typeof value !== 'object') {
    return {
      ...fallback,
      enabled: true,
    }
  }

  const raw = value as Record<string, unknown>

  return {
    enabled: true,
    login: sanitizeNavigationActionSettings(raw.login, fallback.login),
    register: sanitizeNavigationActionSettings(raw.register, fallback.register),
  }
}

function sanitizeUrlItems(items: unknown) {
  if (!Array.isArray(items)) return []

  return items
    .filter((item): item is Record<string, any> => !!item && typeof item === 'object')
    .map(item => {
      const sanitizedItem: Record<string, any> = {
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

export function sanitizeNavigationSettings(
  navigation: Record<string, any> | null | undefined,
  options?: {
    publicAuthPagePath?: string | null
  }
) {
  if (!navigation || typeof navigation !== 'object') return null

  const {
    accountMenu,
    buttons: rawButtons,
    links: rawLinks,
    showAuthenticatedUserMenu,
    ...rest
  } = navigation
  const buttons = sanitizeUrlItems(rawButtons)

  return {
    ...rest,
    logo: isSafeUrl(navigation.logo) ? navigation.logo : '',
    logoUrl: sanitizeUrl(navigation.logoUrl, '/'),
    links: sanitizeUrlItems(rawLinks),
    buttons,
    accountMenu: normalizeNavigationAccountMenu(
      accountMenu,
      options?.publicAuthPagePath
    ),
    actionItemOrder: normalizeNavigationActionItemOrder(
      navigation.actionItemOrder,
      getSavedNavigationButtonIds(buttons)
    ),
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
