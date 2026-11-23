/**
 * SEO helper utilities for building Open Graph, Twitter Card, and canonical URL metadata
 */

import { getSiteUrl } from './site-url-generator'
import { toCdnUrl } from './cdn'
import { buildShareImagePath, shareImageVersion } from '@/lib/share-image'
import type { SiteSettings } from '@/lib/db/schema/sites'
import type { Metadata } from '@/lib/metadata'

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
  id?: string
  updatedAt?: Date | string
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
type TemplateContentType = Exclude<ContentType, 'home'>

const CONTENT_SEO_CONFIG: Record<TemplateContentType, {
  titleSetting: keyof SiteSettings
  descriptionSetting: keyof SiteSettings
  titleToken: string
  defaultTitleTemplate: string
  defaultDescriptionTemplate: string
}> = {
  page: {
    titleSetting: 'seo_pages_title_template',
    descriptionSetting: 'seo_pages_description_template',
    titleToken: 'page_title',
    defaultTitleTemplate: '{{page_title}} | {{site_title}}',
    defaultDescriptionTemplate: 'Visit {{page_title}} on {{site_title}}',
  },
  post: {
    titleSetting: 'seo_posts_title_template',
    descriptionSetting: 'seo_posts_description_template',
    titleToken: 'post_title',
    defaultTitleTemplate: '{{post_title}} | {{site_title}}',
    defaultDescriptionTemplate: 'Read {{post_title}} on {{site_title}}',
  },
  product: {
    titleSetting: 'seo_products_title_template',
    descriptionSetting: 'seo_products_description_template',
    titleToken: 'product_title',
    defaultTitleTemplate: '{{product_title}} | {{site_title}}',
    defaultDescriptionTemplate: '{{product_title}} from {{site_title}}',
  },
  category: {
    titleSetting: 'seo_categories_title_template',
    descriptionSetting: 'seo_categories_description_template',
    titleToken: 'category_title',
    defaultTitleTemplate: '{{category_title}} | {{site_title}}',
    defaultDescriptionTemplate: '{{category_title}} on {{site_title}}',
  },
  directory: {
    titleSetting: 'seo_directories_title_template',
    descriptionSetting: 'seo_directories_description_template',
    titleToken: 'directory_title',
    defaultTitleTemplate: '{{directory_title}} | {{site_title}}',
    defaultDescriptionTemplate: '{{directory_title}} on {{site_title}}',
  },
  event: {
    titleSetting: 'seo_events_title_template',
    descriptionSetting: 'seo_events_description_template',
    titleToken: 'event_title',
    defaultTitleTemplate: '{{event_title}} | {{site_title}}',
    defaultDescriptionTemplate: '{{event_title}} on {{site_title}}',
  },
}

function cleanSeoText(value: string): string {
  return value
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function renderSeoTemplate(template: string, tokens: Record<string, string>): string {
  return cleanSeoText(
    template.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key: string) => tokens[key] || '')
  )
    .replace(/^\s*[-|:]\s*/, '')
    .replace(/\s*[-|:]\s*$/, '')
    .trim()
}

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

function getSeoSiteTitle(site: SeoSite): string {
  const title = typeof site.settings?.site_title === 'string'
    ? site.settings.site_title.trim()
    : ''

  return title || site.name
}

export function getHomeSeoTitle(site: SeoSite): string {
  const title = typeof site.settings?.seo_home_title === 'string'
    ? site.settings.seo_home_title.trim()
    : ''

  return title || getSeoSiteTitle(site)
}

export function getHomeSeoDescription(site: SeoSite): string {
  const description = typeof site.settings?.seo_home_description === 'string'
    ? site.settings.seo_home_description.trim()
    : ''

  if (description) return description
  if (site.settings?.seo_site_description) return site.settings.seo_site_description
  return `Visit ${site.name}`
}

function resolveSeoTitle(site: SeoSite, content: SeoContent | null): string {
  const siteTitle = getSeoSiteTitle(site)
  const contentTitle = typeof content?.title === 'string' ? content.title.trim() : ''

  if (!contentTitle) return siteTitle

  return `${contentTitle} | ${siteTitle}`
}

function getContentSpecificDescription(content: SeoContent | null): string {
  const desc = content?.metaDescription || content?.meta_description || content?.description || content?.excerpt
  return desc ? cleanSeoText(desc) : ''
}

function getSettingString(settings: SiteSettings | null | undefined, key: keyof SiteSettings): string {
  const value = settings?.[key]
  return typeof value === 'string' ? value.trim() : ''
}

function getContentTitle(content: SeoContent | null): string {
  return typeof content?.title === 'string' ? content.title.trim() : ''
}

function getTemplateTokens(site: SeoSite, content: SeoContent | null, contentType: TemplateContentType) {
  const siteTitle = getSeoSiteTitle(site)
  const contentTitle = getContentTitle(content)
  const titleToken = CONTENT_SEO_CONFIG[contentType].titleToken

  return {
    site_title: siteTitle,
    [titleToken]: contentTitle,
  }
}

function resolveContentSeoTitle(site: SeoSite, content: SeoContent | null, contentType: TemplateContentType): string {
  const config = CONTENT_SEO_CONFIG[contentType]
  const template = getSettingString(site.settings, config.titleSetting) || config.defaultTitleTemplate
  const title = renderSeoTemplate(template, getTemplateTokens(site, content, contentType))

  return title || resolveSeoTitle(site, content)
}

function resolveContentSeoDescription(site: SeoSite, content: SeoContent | null, contentType: TemplateContentType): string {
  const config = CONTENT_SEO_CONFIG[contentType]
  const template = getSettingString(site.settings, config.descriptionSetting) || config.defaultDescriptionTemplate
  const description = renderSeoTemplate(template, getTemplateTokens(site, content, contentType))

  return description || site.settings?.seo_site_description || `Visit ${site.name}`
}

function getSeoTitle(site: SeoSite, content: SeoContent | null, contentType: ContentType): string {
  if (contentType === 'home') return getHomeSeoTitle(site)
  return resolveContentSeoTitle(site, content, contentType)
}

/**
 * Get the best available description for a content item
 */
function getContentDescription(site: SeoSite, content: SeoContent | null, contentType: ContentType): string {
  if (contentType === 'home') return getHomeSeoDescription(site)

  const contentDescription = getContentSpecificDescription(content)
  if (contentDescription) return contentDescription

  return resolveContentSeoDescription(site, content, contentType)

}

/**
 * Listings and events without a photo get a drawn share card from the
 * /share-image route; the URL carries the item's updated-at as a version so
 * edits produce a fresh image.
 */
function getGeneratedShareImage(site: SeoSite, content: SeoContent | null, contentType: ContentType): string | null {
  if (contentType !== 'directory' && contentType !== 'event') return null
  if (!content?.id) return null

  const version = shareImageVersion(content.updatedAt)
  if (!version) return null

  const type = contentType === 'directory' ? 'listing' : 'event'
  // Absolute URL: link-preview scrapers do not reliably resolve relative ones
  return buildCanonicalUrl(site, buildShareImagePath(type, content.id, version))
}

/**
 * Get the best available image for OG/Twitter
 */
function getContentImage(site: SeoSite, content: SeoContent | null, contentType: ContentType): string | null {
  // Try content featured image first
  const contentImage = content?.featuredImage || content?.featured_image || content?.image
  if (contentImage) return toCdnUrl(contentImage)

  // Then a drawn card for listings and events without a photo
  const generated = getGeneratedShareImage(site, content, contentType)
  if (generated) return generated

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
    case 'product': return 'website'
    default: return 'website'
  }
}

/**
 * Build Open Graph metadata object for Next.js generateMetadata
 */
function buildOpenGraph(
  site: SeoSite,
  content: SeoContent | null,
  contentType: ContentType,
  path: string = ''
): NonNullable<Metadata['openGraph']> {
  const title = getSeoTitle(site, content, contentType)
  const description = getContentDescription(site, content, contentType)
  const url = buildCanonicalUrl(site, path)
  const image = getContentImage(site, content, contentType)

  const og: any = {
    title,
    description,
    url,
    siteName: getSeoSiteTitle(site),
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
function buildTwitterCard(
  site: SeoSite,
  content: SeoContent | null,
  contentType: ContentType = 'page'
): NonNullable<Metadata['twitter']> {
  const settings = site.settings
  const cardType = settings?.seo_twitter_card_type || 'summary_large_image'
  const title = getSeoTitle(site, content, contentType)
  const description = getContentDescription(site, content, contentType)
  const image = getContentImage(site, content, contentType)

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
  const description = getContentDescription(site, content, contentType)

  return {
    title: getSeoTitle(site, content, contentType),
    description,
    openGraph: buildOpenGraph(site, content, contentType, path),
    twitter: buildTwitterCard(site, content, contentType),
    alternates: {
      canonical: buildCanonicalUrl(site, path),
    },
  }
}
