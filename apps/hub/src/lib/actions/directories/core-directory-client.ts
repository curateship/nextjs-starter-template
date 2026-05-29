import 'server-only'

import {
  DIRECTORY_CORE_BLOCK_TYPE,
  type DirectoryCoreMenuLink,
} from '@/lib/actions/directories/directory-core'
import { DIRECTORY_GOOGLE_MAP_BLOCK_TYPE } from '@/lib/actions/directories/directory-google-map'
import { DIRECTORY_OPENING_HOURS_BLOCK_TYPE } from '@/lib/actions/directories/directory-opening-hours'
import { getCoreDirectoryConfig } from '@/lib/actions/integrations/config-helpers'

export interface CorePublicDirectoryItem {
  id: string
  slug: string
  title: string
  metaDescription: string | null
  featuredImage: string | null
  business: {
    description?: string
    address?: string
    phone?: string
    website?: string
    rating?: number
    reviewCount?: number
    placeId?: string
    mapsUrl?: string
    socialLinks?: Array<{ platform: string; url: string }>
    openingHours?: Record<string, unknown>
  }
}

export async function getCoreDirectoryBySlugForSite(siteId: string, slug: string) {
  const config = await getCoreDirectoryConfig(siteId)
  if (!config) return { enabled: false, data: null as CorePublicDirectoryItem | null }

  const apiUrl = normalizeCoreApiUrl(config.apiUrl)
  if (!apiUrl) {
    return { enabled: false, data: null as CorePublicDirectoryItem | null }
  }

  const response = await fetch(
    `${apiUrl}/api/v1/public/workspaces/${encodeURIComponent(config.workspaceId)}/directories/${encodeURIComponent(slug)}`,
    {
      headers: {
        Authorization: `Bearer ${config.readToken}`,
      },
      cache: 'no-store',
    }
  )

  if (response.status === 404) {
    return { enabled: true, data: null as CorePublicDirectoryItem | null }
  }

  if (!response.ok) {
    throw new Error('Core directory data is unavailable')
  }

  const body = await response.json().catch(() => null) as { data?: CorePublicDirectoryItem } | null
  return { enabled: true, data: body?.data ?? null }
}

export async function listCoreDirectoriesForSite(siteId: string) {
  const config = await getCoreDirectoryConfig(siteId)
  if (!config) return { enabled: false, items: [] as CorePublicDirectoryItem[] }

  const apiUrl = normalizeCoreApiUrl(config.apiUrl)
  if (!apiUrl) return { enabled: false, items: [] as CorePublicDirectoryItem[] }

  const response = await fetch(
    `${apiUrl}/api/v1/public/workspaces/${encodeURIComponent(config.workspaceId)}/directories?limit=100`,
    {
      headers: {
        Authorization: `Bearer ${config.readToken}`,
      },
      cache: 'no-store',
    }
  )

  if (!response.ok) {
    throw new Error('Core directory data is unavailable')
  }

  const body = await response.json().catch(() => null) as {
    data?: { items?: CorePublicDirectoryItem[] }
  } | null

  return {
    enabled: true,
    items: Array.isArray(body?.data?.items) ? body.data.items : [],
  }
}

export function mapCoreDirectoryToHubDirectory(item: CorePublicDirectoryItem) {
  const business = item.business || {}
  const menuLinks = buildCoreDirectoryMenuLinks(business)
  const blocks: Array<{
    id: string
    type: string
    display_order: number
    content: Record<string, any>
  }> = [
    {
      id: 'core-profile',
      type: DIRECTORY_CORE_BLOCK_TYPE,
      display_order: 0,
      content: {
        layoutColumn: 'main',
        sticky: false,
        introText: business.description || '',
        socialLinks: Array.isArray(business.socialLinks) ? business.socialLinks : [],
        menuLinks,
        claimEnabled: false,
        visibility: {},
      },
    },
  ]

  const locationQuery = business.address || business.mapsUrl || ''
  if (locationQuery) {
    blocks.push({
      id: 'core-map',
      type: DIRECTORY_GOOGLE_MAP_BLOCK_TYPE,
      display_order: 1,
      content: {
        layoutColumn: 'sidebar',
        locationQuery,
        caption: business.address || '',
        height: 320,
        visibility: {},
      },
    })
  }

  if (business.placeId) {
    blocks.push({
      id: 'core-opening-hours',
      type: DIRECTORY_OPENING_HOURS_BLOCK_TYPE,
      display_order: 2,
      content: {
        layoutColumn: 'sidebar',
        title: 'Business Hours',
        placeId: business.placeId,
        visibility: {},
      },
    })
  }

  return {
    id: item.id,
    title: item.title,
    slug: item.slug,
    meta_description: item.metaDescription,
    featured_image: item.featuredImage,
    description: business.description || item.metaDescription || '',
    blocks,
  }
}

function normalizeCoreApiUrl(value: string) {
  try {
    const url = new URL(value)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return ''
    if (!isAllowedCoreApiOrigin(url.origin)) return ''
    url.pathname = url.pathname.replace(/\/+$/, '')
    url.search = ''
    url.hash = ''
    return url.toString().replace(/\/+$/, '')
  } catch {
    return ''
  }
}

function isAllowedCoreApiOrigin(origin: string) {
  const configured = process.env.CORE_DIRECTORY_ALLOWED_ORIGINS
  const allowed = configured
    ? configured
        .split(',')
        .map((value) => value.trim().replace(/\/+$/, ''))
        .filter(Boolean)
    : process.env.NODE_ENV === 'production'
      ? []
      : ['http://localhost:3003', 'http://127.0.0.1:3003']

  return allowed.includes(origin)
}

function buildCoreDirectoryMenuLinks(
  business: CorePublicDirectoryItem['business']
): DirectoryCoreMenuLink[] {
  const links: DirectoryCoreMenuLink[] = []

  if (business.address || business.mapsUrl) {
    links.push({
      id: 'directions',
      type: 'directions',
      value: business.mapsUrl || business.address,
    })
  }

  if (business.phone) {
    links.push({ id: 'phone', type: 'phone', value: business.phone })
  }

  if (business.website) {
    links.push({ id: 'website', type: 'website', value: business.website })
  }

  return links
}
