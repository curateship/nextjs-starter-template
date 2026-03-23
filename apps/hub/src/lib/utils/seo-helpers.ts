/**
 * SEO helper utilities for building Open Graph, Twitter Card, and canonical URL metadata
 */

import { getSiteUrl } from './site-url-generator'
import { toCdnUrl } from './cdn'
import type { SiteSettings } from '@/lib/db/schema/sites'
import type { Metadata } from 'next'

// Minimal site shape needed by SEO helpers
interface SeoSite {
  id: string
  name: string
  subdomain: string
  custom_domain?: string | null
  customDomain?: string | null
  settings?: SiteSettings | null
}

// Content item with optional SEO fields
interface SeoContent {
  title?: string
  slug?: string
  description?: string
  metaDescription?: string
  meta_description?: string
  excerpt?: string
  featuredImage?: string
  featured_image?: string
  image?: string
}

// Supported content types for og:type mapping
type ContentType = 'page' | 'post' | 'product' | 'category' | 'directory' | 'event' | 'home'

/**
 * Build the full site URL (custom domain or subdomain)
 */
export function buildSiteUrl(site: SeoSite): string {
  return getSiteUrl(site)
}

/**
 * Build canonical URL for a given path based on site's domain settings
 */
export function buildCanonicalUrl(site: SeoSite, path: string = ''): string {
  const baseUrl = buildSiteUrl(site)
  // Strip trailing slash from base, ensure path starts with /
  const cleanBase = baseUrl.replace(/\/$/, '')
  const cleanPath = path ? (path.startsWith('/') ? path : `/${path}`) : ''
  return `${cleanBase}${cleanPath}`
}

/**
 * Get the best available description for a content item
 */
function getContentDescription(site: SeoSite, content: SeoContent | null, contentType: ContentType): string {
  if (content) {
    // Try content-specific descriptions in order of preference
    const desc = content.metaDescription || content.meta_description || content.description || content.excerpt
    if (desc) {
      // Strip HTML tags if present
      return desc.replace(/<[^>]*>/g, '').trim()
    }
  }
  // Fall back to site-level SEO description
  const settings = site.settings
  if (settings?.seo_site_description) return settings.seo_site_description
  return `Visit ${site.name}`
}

/**
 * Get the best available image for OG/Twitter
 */
function getContentImage(site: SeoSite, content: SeoContent | null): string | null {
  // Try content featured image first
  const contentImage = content?.featuredImage || content?.featured_image || content?.image
  if (contentImage) return toCdnUrl(contentImage)

  // Fall back to site default OG image
  const defaultOg = site.settings?.seo_default_og_image
  if (defaultOg) return toCdnUrl(defaultOg)

  return null
}

/**
 * Map content type to Open Graph type
 */
function getOgType(contentType: ContentType): string {
  switch (contentType) {
    case 'post': return 'article'
    case 'product': return 'product'
    default: return 'website'
  }
}

/**
 * Build Open Graph metadata object for Next.js generateMetadata
 */
export function buildOpenGraph(
  site: SeoSite,
  content: SeoContent | null,
  contentType: ContentType,
  path: string = ''
): NonNullable<Metadata['openGraph']> {
  const title = content?.title ? `${content.title} | ${site.name}` : site.name
  const description = getContentDescription(site, content, contentType)
  const url = buildCanonicalUrl(site, path)
  const image = getContentImage(site, content)

  const og: any = {
    title,
    description,
    url,
    siteName: site.name,
    type: getOgType(contentType),
  }

  if (image) {
    og.images = [{ url: image }]
  }

  return og
}

/**
 * Build Twitter Card metadata object for Next.js generateMetadata
 */
export function buildTwitterCard(
  site: SeoSite,
  content: SeoContent | null
): NonNullable<Metadata['twitter']> {
  const settings = site.settings
  const cardType = settings?.seo_twitter_card_type || 'summary_large_image'
  const title = content?.title ? `${content.title} | ${site.name}` : site.name
  const description = getContentDescription(site, content, 'page')
  const image = getContentImage(site, content)

  const twitter: any = {
    card: cardType,
    title,
    description,
  }

  // Add twitter:site handle if configured
  if (settings?.seo_twitter_handle) {
    twitter.site = settings.seo_twitter_handle.startsWith('@')
      ? settings.seo_twitter_handle
      : `@${settings.seo_twitter_handle}`
  }

  if (image) {
    twitter.images = [image]
  }

  return twitter
}

/**
 * Build the full SEO metadata object (OG + Twitter + canonical) for a content page.
 * Merges with existing title/description metadata.
 */
export function buildSeoMetadata(
  site: SeoSite,
  content: SeoContent | null,
  contentType: ContentType,
  path: string = ''
): Partial<Metadata> {
  return {
    openGraph: buildOpenGraph(site, content, contentType, path),
    twitter: buildTwitterCard(site, content),
    alternates: {
      canonical: buildCanonicalUrl(site, path),
    },
  }
}
