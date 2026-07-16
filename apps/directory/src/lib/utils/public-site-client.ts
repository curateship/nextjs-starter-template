export interface PublicSiteClientProps {
  id: string
  subdomain: string
  name?: string
  settings?: {
    favicon?: string
    default_theme?: 'system' | 'light' | 'dark'
    site_width?: 'full' | 'custom'
    custom_width?: number
  }
}

interface PublicSiteClientInput {
  id?: string
  subdomain?: string
  name?: string
  settings?: Record<string, any> | null
}

function getDefaultTheme(value: unknown) {
  return value === 'light' || value === 'dark' || value === 'system'
    ? value
    : undefined
}

function getSiteWidth(value: unknown) {
  return value === 'full' || value === 'custom' ? value : undefined
}

export function toPublicSiteClientProps(
  site: PublicSiteClientInput | null | undefined
): PublicSiteClientProps | undefined {
  if (!site?.id || !site.subdomain) return undefined

  const settings = site.settings || {}
  const publicSettings: PublicSiteClientProps['settings'] = {}
  const defaultTheme = getDefaultTheme(settings.default_theme)
  const siteWidth = getSiteWidth(settings.site_width)

  if (typeof settings.favicon === 'string') {
    publicSettings.favicon = settings.favicon
  }

  if (defaultTheme) {
    publicSettings.default_theme = defaultTheme
  }

  if (siteWidth) {
    publicSettings.site_width = siteWidth
  }

  if (typeof settings.custom_width === 'number') {
    publicSettings.custom_width = settings.custom_width
  }

  return {
    id: site.id,
    subdomain: site.subdomain,
    name: site.name,
    settings: publicSettings,
  }
}
