'use server'

import { createHash, createHmac } from 'node:crypto'
import { resolveTxt } from 'node:dns/promises'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { eq, and, ne, desc, asc, inArray } from 'drizzle-orm'
import { revalidateTag, revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { pages, sites } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { sanitizeFooterSettings, sanitizeNavigationSettings } from '@/lib/utils/site-structure'
import { getPublicAuthPagePath } from '@/lib/actions/pages/page-frontend-actions'
import { DEFAULT_NEWSLETTER_DRIP_CONFIG } from '@/lib/actions/newsletters/send-windows'
import { isHubPlatformHostname, isReservedPlatformSubdomain } from '@/lib/utils/platform-host'
import { ensureCloudflareCustomDomainDns } from '@/lib/utils/cloudflare-dns'
import { UUID_REGEX } from '@/lib/utils/validation'

export interface Site {
  id: string
  user_id: string
  name: string
  subdomain: string
  custom_domain: string | null
  status: 'active' | 'inactive' | 'draft' | 'suspended'
  is_template: boolean
  settings: Record<string, any>
  created_at: string
  updated_at: string
}

export type SiteWithTheme = Site

// Maps Drizzle's camelCase output to the snake_case Site interface
function normalizeSite(row: Record<string, any>): Site {
  return {
    id: row.id,
    user_id: row.userId ?? row.user_id,
    name: row.name,
    subdomain: row.subdomain,
    custom_domain: row.customDomain ?? row.custom_domain ?? null,
    status: row.status,
    is_template: row.isTemplate ?? row.is_template ?? false,
    settings: row.settings ?? {},
    created_at: row.createdAt ?? row.created_at,
    updated_at: row.updatedAt ?? row.updated_at,
  }
}

export interface CreateSiteData {
  name: string
  subdomain?: string
  custom_domain?: string | null
  status?: 'active' | 'inactive' | 'draft'
  is_template?: boolean
  settings?: Record<string, any>
  site_tag?: string
  font_family?: string
  font_weights?: string[]
  secondary_font_family?: string
  secondary_font_weights?: string[]
  favicon?: string
  tracking_scripts?: string
  site_width?: 'full' | 'custom'
  custom_width?: number
  default_theme?: 'system' | 'light' | 'dark'
}

export interface CloneSiteData {
  name: string
  clone_settings?: boolean
  clone_pages?: boolean
}

const CUSTOM_DOMAIN_VERIFICATION_RECORD = '_site-verification'
const CUSTOM_DOMAIN_VERIFICATION_VALUE_PREFIX = 'site-verification'

function sanitizeSiteTag(input?: string | null): string | undefined {
  const tag = input?.trim()
  return tag ? tag.slice(0, 50) : undefined
}

function sanitizeCustomDomain(input?: string | null): string | null {
  if (!input) return null
  let d = String(input).trim().toLowerCase()
  if (!d) return null
  d = d.replace(/^https?:\/\//, '')
  d = d.replace(/^\/+/, '')
  d = d.split('/')[0].split('?')[0].split('#')[0]
  d = d.replace(/^www\./, '')
  if (!d) return null
  return d
}

function getCustomDomainAliases(domain: string) {
  const aliases = [domain]
  if (domain.split('.').length === 2) aliases.push(`www.${domain}`)
  return aliases
}

function getCustomDomainCoolifyFqdns(domain: string) {
  return getCustomDomainAliases(domain).map((alias) => `https://${alias}`)
}

function getTraefikHubService() {
  const explicitService = process.env.TRAEFIK_HUB_SERVICE?.trim()
  if (explicitService) return explicitService

  const appUuid = process.env.COOLIFY_HUB_APP_UUID?.trim()
  return appUuid ? `http-3-${appUuid}@docker` : null
}

function isValidTraefikService(service: string) {
  return /^[a-zA-Z0-9_.-]+(?:@[a-zA-Z0-9_.-]+)?$/.test(service)
}

function getTraefikRouteSlug(domain: string) {
  return createHash('sha256').update(domain).digest('hex').slice(0, 12)
}

function getTraefikDynamicConfig(domain: string) {
  const aliases = getCustomDomainAliases(domain)
  const routeSlug = getTraefikRouteSlug(domain)
  const routeName = `hub-custom-domain-${routeSlug}`
  const hostRule = aliases.map((alias) => `Host(\`${alias}\`)`).join(' || ')
  const service = getTraefikHubService()

  if (!service || !isValidTraefikService(service)) return null

  return {
    aliases,
    filename: `${routeName}.yml`,
    config: `http:
  routers:
    ${routeName}-http:
      entryPoints:
        - http
      rule: ${hostRule}
      middlewares:
        - ${routeName}-redirect
      service: ${service}

    ${routeName}-https:
      entryPoints:
        - https
      rule: ${hostRule}
      middlewares:
        - ${routeName}-gzip
      service: ${service}
      tls:
        certResolver: letsencrypt

  middlewares:
    ${routeName}-redirect:
      redirectScheme:
        scheme: https
    ${routeName}-gzip:
      compress: {}
`,
  }
}

async function wireCustomDomainInTraefik(domain: string): Promise<{ configured: boolean; error: string | null }> {
  const configDir = process.env.TRAEFIK_DYNAMIC_CONFIG_DIR?.trim()
  const endpoint = process.env.TRAEFIK_DYNAMIC_CONFIG_ENDPOINT?.trim().replace(/\/+$/, '')
  const token = process.env.TRAEFIK_DYNAMIC_CONFIG_TOKEN?.trim()

  if (!configDir && !endpoint) return { configured: false, error: null }

  const dynamicConfig = getTraefikDynamicConfig(domain)
  if (!dynamicConfig) {
    return { configured: true, error: 'Traefik domain wiring is misconfigured' }
  }

  try {
    if (configDir) {
      await mkdir(configDir, { recursive: true })
      const targetPath = join(configDir, dynamicConfig.filename)
      const tempPath = join(configDir, `${dynamicConfig.filename}.${Date.now()}.tmp`)
      await writeFile(tempPath, dynamicConfig.config, 'utf8')
      await rename(tempPath, targetPath)
      return { configured: true, error: null }
    }

    if (!token) {
      return { configured: true, error: 'Traefik domain wiring token is not configured' }
    }

    if (!endpoint) {
      return { configured: true, error: 'Traefik domain wiring endpoint is not configured' }
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ domain }),
      cache: 'no-store',
    })

    if (!response.ok) {
      return { configured: true, error: `Traefik rejected the custom domain route (${response.status})` }
    }
  } catch {
    return { configured: true, error: 'Failed to wire custom domain in Traefik' }
  }

  return { configured: true, error: null }
}

function getCoolifyApiBaseUrl() {
  const baseUrl = process.env.COOLIFY_BASE_URL?.trim().replace(/\/+$/, '')
  if (!baseUrl) return null
  if (baseUrl.endsWith('/api')) return `${baseUrl}/v1`
  return baseUrl.endsWith('/api/v1') ? baseUrl : `${baseUrl}/api/v1`
}

function parseCoolifyDomains(value: unknown) {
  if (typeof value !== 'string') return []
  return value.split(',').map((domain) => domain.trim()).filter(Boolean)
}

async function getCoolifyJson(url: string, token: string) {
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Coolify returned ${response.status}`)
  }

  return response.json() as Promise<{ fqdn?: string | null; data?: { fqdn?: string | null } }>
}

async function wireCustomDomainInCoolify(domain: string): Promise<string | null> {
  const baseUrl = getCoolifyApiBaseUrl()
  const token = process.env.COOLIFY_API_TOKEN?.trim()
  const appUuid = process.env.COOLIFY_HUB_APP_UUID?.trim()

  if (!baseUrl || !token || !appUuid) {
    return 'Coolify domain wiring is not configured'
  }

  try {
    new URL(baseUrl)
  } catch {
    return 'Coolify domain wiring is misconfigured'
  }

  try {
    const appUrl = `${baseUrl}/applications/${encodeURIComponent(appUuid)}`
    const app = await getCoolifyJson(appUrl, token)
    const currentFqdn = app.data?.fqdn ?? app.fqdn
    if (typeof currentFqdn !== 'string') {
      return 'Failed to read current Coolify domains'
    }

    const currentDomains = parseCoolifyDomains(currentFqdn)
    const nextDomains = Array.from(new Set([...currentDomains, ...getCustomDomainCoolifyFqdns(domain)]))

    if (nextDomains.length === currentDomains.length) return null

    const response = await fetch(appUrl, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ domains: nextDomains.join(',') }),
      cache: 'no-store',
    })

    if (!response.ok) {
      return `Coolify rejected the custom domain update (${response.status})`
    }
  } catch {
    return 'Failed to wire custom domain in Coolify'
  }

  return null
}

async function wireCustomDomain(domain: string): Promise<string | null> {
  const traefikResult = await wireCustomDomainInTraefik(domain)
  if (traefikResult.configured) return traefikResult.error

  return wireCustomDomainInCoolify(domain)
}

function getCustomDomainVerificationSecret() {
  return process.env.AUTH_SECRET
    || process.env.BETTER_AUTH_SECRET
    || process.env.INTEGRATION_ENCRYPTION_KEY
}

function getCustomDomainVerificationRecord(domain: string) {
  return `${CUSTOM_DOMAIN_VERIFICATION_RECORD}.${domain}`
}

function getCustomDomainVerificationValue(domain: string, userId: string) {
  const secret = getCustomDomainVerificationSecret()
  if (!secret) return null

  const token = createHmac('sha256', secret)
    .update(`${userId}:${domain}`)
    .digest('base64url')

  return `${CUSTOM_DOMAIN_VERIFICATION_VALUE_PREFIX}=${token}`
}

function isValidCustomDomain(domain: string) {
  return /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i.test(domain)
}

async function verifyCustomDomainDns(domain: string, userId: string) {
  const expected = getCustomDomainVerificationValue(domain, userId)
  if (!expected) return false

  try {
    const records = await resolveTxt(getCustomDomainVerificationRecord(domain))
    return records.some((record) => record.join('').trim() === expected)
  } catch {
    return false
  }
}

async function prepareCustomDomain(
  input: string | null | undefined,
  userId: string,
  currentSiteId?: string,
  canManageCloudflareDns = false
): Promise<{ domain: string | null; error: string | null }> {
  const domain = sanitizeCustomDomain(input)
  if (!domain) return { domain: null, error: null }

  if (!isValidCustomDomain(domain)) {
    return { domain: null, error: 'Invalid custom domain format' }
  }

  if (isHubPlatformHostname(domain)) {
    return { domain: null, error: 'The Hub platform domain cannot be assigned to a site' }
  }

  const existing = await db.query.sites.findFirst({
    where: currentSiteId
      ? and(inArray(sites.customDomain, getCustomDomainAliases(domain)), ne(sites.id, currentSiteId))
      : inArray(sites.customDomain, getCustomDomainAliases(domain)),
    columns: { id: true },
  })
  if (existing) {
    return { domain: null, error: 'Custom domain is already assigned to another site' }
  }

  const verificationValue = getCustomDomainVerificationValue(domain, userId)
  if (!verificationValue) {
    return { domain: null, error: 'Custom domain verification is not configured' }
  }

  if (canManageCloudflareDns) {
    const cloudflareError = await ensureCloudflareCustomDomainDns({
      domain,
      aliases: getCustomDomainAliases(domain),
      verificationName: getCustomDomainVerificationRecord(domain),
      verificationValue,
    })
    if (cloudflareError) return { domain: null, error: cloudflareError }
  }

  const verified = await verifyCustomDomainDns(domain, userId)
  if (!verified) {
    return {
      domain: null,
      error: `Add TXT record ${getCustomDomainVerificationRecord(domain)} with value ${verificationValue} before using this domain`,
    }
  }

  const wiringError = await wireCustomDomain(domain)
  if (wiringError) return { domain: null, error: wiringError }

  return { domain, error: null }
}

function buildSubdomain(input: string): string {
  const subdomain = input.toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  return subdomain || 'site'
}

// Duplicated sites need a fresh public slug because subdomains are globally unique.
async function getAvailableSubdomain(input: string): Promise<string> {
  const baseSubdomain = buildSubdomain(input)
  let subdomain = baseSubdomain
  let attempts = 0

  while (attempts < 10) {
    const existing = await db.query.sites.findFirst({
      where: eq(sites.subdomain, subdomain),
      columns: { id: true },
    })
    if (!existing && !isReservedPlatformSubdomain(subdomain)) return subdomain

    attempts++
    subdomain = `${baseSubdomain}-${attempts}`
  }

  return `${baseSubdomain}-${Date.now()}`
}

export async function getAllSitesAction(): Promise<{ data: Site[] | null; error: string | null }> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Authentication required' }

    const result = await db
      .select()
      .from(sites)
      .where(and(eq(sites.userId, user.id), eq(sites.isTemplate, false)))
      .orderBy(desc(sites.createdAt))

    return { data: result.map(normalizeSite), error: null }
  } catch (error) {
    return { data: null, error: `Server error: ${error instanceof Error ? error.message : String(error)}` }
  }
}

export async function createSiteAction(siteData: CreateSiteData): Promise<{ data: Site | null; error: string | null }> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'User not authenticated. Please log in first.' }

    let subdomain = siteData.subdomain || siteData.name.toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')

    let subdomainSuffix = ''
    let attempts = 0
    while (attempts < 10) {
      const testSubdomain = subdomain + subdomainSuffix
      const existing = await db.query.sites.findFirst({
        where: eq(sites.subdomain, testSubdomain),
        columns: { id: true },
      })
      if (!existing && !isReservedPlatformSubdomain(testSubdomain)) {
        subdomain = testSubdomain
        break
      }
      attempts++
      subdomainSuffix = `-${attempts}`
    }

    const customDomain = await prepareCustomDomain(siteData.custom_domain ?? null, user.id, undefined, user.role === 'super_admin')
    if (customDomain.error) return { data: null, error: customDomain.error }

    const settings = {
      ...(siteData.settings || {
        site_title: siteData.name,
        analytics_enabled: false,
        seo_enabled: true
      }),
      site_tag: sanitizeSiteTag(siteData.site_tag ?? siteData.settings?.site_tag),
      newsletter_drip_defaults: siteData.settings?.newsletter_drip_defaults || DEFAULT_NEWSLETTER_DRIP_CONFIG,
      font_family: siteData.font_family || 'playfair-display',
      font_weights: siteData.font_weights || ['400', '500', '600', '700', '800', '900'],
      secondary_font_family: siteData.secondary_font_family || 'inter',
      secondary_font_weights: siteData.secondary_font_weights || ['300', '400', '500', '600', '700'],
      favicon: siteData.favicon || null,
      default_theme: siteData.default_theme || 'system',
    }

    const [created] = await db
      .insert(sites)
      .values({
        name: siteData.name,
        userId: user.id,
        subdomain,
        status: siteData.status || 'draft',
        isTemplate: siteData.is_template || false,
        customDomain: customDomain.domain,
        settings,
      })
      .returning()

    if (!created) return { data: null, error: 'Failed to create site' }
    return { data: normalizeSite(created), error: null }
  } catch (error) {
    return { data: null, error: `Server error: ${error instanceof Error ? error.message : String(error)}` }
  }
}

export async function cloneSiteAction(
  sourceSiteId: string,
  cloneData: CloneSiteData
): Promise<{ data: Site | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(sourceSiteId)) return { data: null, error: 'Invalid site ID format' }

    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Authentication required' }

    const name = cloneData.name.trim()
    if (!name) return { data: null, error: 'Site name is required' }

    // Only real user-owned sites can be duplicated; templates stay managed by theme flows.
    const sourceSite = await db.query.sites.findFirst({
      where: and(eq(sites.id, sourceSiteId), eq(sites.userId, user.id), eq(sites.isTemplate, false)),
    })
    if (!sourceSite) return { data: null, error: 'Site not found or access denied' }

    const cloneSettings = cloneData.clone_settings !== false
    const clonePages = cloneData.clone_pages !== false
    const subdomain = await getAvailableSubdomain(name)
    const settings: Record<string, any> = cloneSettings
      ? { ...((sourceSite.settings || {}) as Record<string, any>), site_title: name }
      : {
        site_title: name,
        analytics_enabled: false,
        seo_enabled: true,
        newsletter_drip_defaults: DEFAULT_NEWSLETTER_DRIP_CONFIG,
        font_family: 'playfair-display',
        font_weights: ['400', '500', '600', '700', '800', '900'],
        secondary_font_family: 'inter',
        secondary_font_weights: ['300', '400', '500', '600', '700'],
        favicon: null,
        default_theme: 'system',
      }
    // A duplicate gets its own domain decisions, so do not inherit canonical-domain settings.
    delete settings.seo_canonical_domain

    // Create the draft site and copy pages in one transaction so clones are never partial.
    const cloned = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(sites)
        .values({
          name,
          userId: user.id,
          subdomain,
          status: 'draft',
          isTemplate: false,
          customDomain: null,
          settings,
        })
        .returning()

      if (!created) return null

      if (clonePages) {
        const sourcePages = await tx
          .select({
            title: pages.title,
            slug: pages.slug,
            metaDescription: pages.metaDescription,
            metaKeywords: pages.metaKeywords,
            template: pages.template,
            isHomepage: pages.isHomepage,
            isPublished: pages.isPublished,
            displayOrder: pages.displayOrder,
            contentBlocks: pages.contentBlocks,
          })
          .from(pages)
          .where(eq(pages.siteId, sourceSite.id))
          .orderBy(asc(pages.displayOrder))

        // Some site inserts create default pages automatically; replace them with source pages.
        await tx.delete(pages).where(eq(pages.siteId, created.id))

        if (sourcePages.length > 0) {
          await tx.insert(pages).values(sourcePages.map((page) => ({
            siteId: created.id,
            title: page.title,
            slug: page.slug,
            metaDescription: page.metaDescription,
            metaKeywords: page.metaKeywords,
            template: page.template,
            isHomepage: page.isHomepage,
            isPublished: page.isPublished,
            displayOrder: page.displayOrder,
            contentBlocks: page.contentBlocks || {},
          })))
        }
      }

      return created
    })

    if (!cloned) return { data: null, error: 'Failed to duplicate site' }

    // Refresh admin lists and public site lookup caches after the new draft exists.
    revalidateTag('site-lookup')
    revalidateTag('all')
    revalidatePath('/admin/sites')

    return { data: normalizeSite(cloned), error: null }
  } catch (error) {
    return { data: null, error: `Server error: ${error instanceof Error ? error.message : String(error)}` }
  }
}

export async function updateSiteAction(
  siteId: string,
  updates: Partial<CreateSiteData>
): Promise<{ data: Site | null; error: string | null }> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Authentication required' }

    const ownedSite = await db.query.sites.findFirst({
      where: and(eq(sites.id, siteId), eq(sites.userId, user.id)),
      columns: { id: true, customDomain: true },
    })
    if (!ownedSite) return { data: null, error: 'Site not found or access denied' }

    const finalUpdates: Record<string, any> = {}

    if (updates.name) finalUpdates.name = updates.name
    if (updates.status) finalUpdates.status = updates.status
    if (updates.settings) finalUpdates.settings = updates.settings
    if (updates.is_template !== undefined) finalUpdates.isTemplate = updates.is_template

    if (updates.name && !updates.subdomain) {
      let subdomain = updates.name.toLowerCase()
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '')

      let subdomainSuffix = ''
      let attempts = 0
      while (attempts < 10) {
        const testSubdomain = subdomain + subdomainSuffix
        const existing = await db.query.sites.findFirst({
          where: and(eq(sites.subdomain, testSubdomain), ne(sites.id, siteId)),
          columns: { id: true },
        })
        if (!existing && !isReservedPlatformSubdomain(testSubdomain)) {
          subdomain = testSubdomain
          break
        }
        attempts++
        subdomainSuffix = `-${attempts}`
      }
      finalUpdates.subdomain = subdomain
    } else if (updates.subdomain) {
      if (isReservedPlatformSubdomain(updates.subdomain)) {
        return { data: null, error: 'This subdomain is reserved for the platform' }
      }
      finalUpdates.subdomain = updates.subdomain
    }

    if (updates.hasOwnProperty('custom_domain')) {
      const requestedDomain = sanitizeCustomDomain(updates.custom_domain)
      if (requestedDomain !== (ownedSite.customDomain || null)) {
        const customDomain = await prepareCustomDomain(updates.custom_domain, user.id, siteId, user.role === 'super_admin')
        if (customDomain.error) return { data: null, error: customDomain.error }
        finalUpdates.customDomain = customDomain.domain
      }
    }

    finalUpdates.updatedAt = new Date()

    const [updated] = await db
      .update(sites)
      .set(finalUpdates)
      .where(eq(sites.id, siteId))
      .returning()

    if (!updated) return { data: null, error: 'Failed to update site' }

    revalidateTag('site-lookup')
    revalidateTag('all')
    revalidatePath('/', 'layout')

    return { data: normalizeSite(updated), error: null }
  } catch (error) {
    return { data: null, error: `Server error: ${error instanceof Error ? error.message : String(error)}` }
  }
}

export async function deleteSiteAction(siteId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!UUID_REGEX.test(siteId)) return { success: false, error: 'Invalid site ID format' }

    const user = await getAuthenticatedUser()
    if (!user) return { success: false, error: 'Authentication required' }

    const site = await db.query.sites.findFirst({
      where: and(eq(sites.id, siteId), eq(sites.userId, user.id)),
      columns: { id: true },
    })
    if (!site) return { success: false, error: 'Site not found or you do not have permission to delete it' }

    await db.delete(sites).where(and(eq(sites.id, siteId), eq(sites.userId, user.id)))

    return { success: true, error: null }
  } catch (error) {
    console.error('Failed to delete site', {
      siteId,
      error: error instanceof Error ? error.message : String(error),
    })
    return { success: false, error: 'Failed to delete site' }
  }
}

export async function getSiteByIdAction(siteId: string): Promise<{ data: Site | null; error: string | null }> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Authentication required' }

    const result = await db.query.sites.findFirst({
      where: and(eq(sites.id, siteId), eq(sites.userId, user.id)),
    })

    if (!result) return { data: null, error: 'Site not found or access denied' }
    return { data: normalizeSite(result), error: null }
  } catch (error) {
    return { data: null, error: `Server error: ${error instanceof Error ? error.message : String(error)}` }
  }
}

export async function checkSubdomainAvailabilityAction(subdomain: string): Promise<{ available: boolean; suggestion?: string; error: string | null }> {
  try {
    const existing = await db.query.sites.findFirst({
      where: eq(sites.subdomain, subdomain),
      columns: { id: true },
    })

    if (!existing && !isReservedPlatformSubdomain(subdomain)) return { available: true, error: null }

    let suggestion = subdomain
    let attempts = 1
    while (attempts <= 5) {
      const testSubdomain = `${subdomain}-${attempts}`
      const existingTest = await db.query.sites.findFirst({
        where: eq(sites.subdomain, testSubdomain),
        columns: { id: true },
      })
      if (!existingTest && !isReservedPlatformSubdomain(testSubdomain)) {
        suggestion = testSubdomain
        break
      }
      attempts++
    }

    return { available: false, suggestion, error: null }
  } catch (error) {
    return { available: false, error: `Server error: ${error instanceof Error ? error.message : String(error)}` }
  }
}

async function updateSiteChromeField(
  siteId: string,
  fieldName: 'navigation' | 'footer',
  data: Record<string, any>
): Promise<{ success: boolean; error: string | null }> {
  try {
    const user = await getAuthenticatedUser()
    if (!user) return { success: false, error: 'Authentication required' }

    const site = await db.query.sites.findFirst({
      where: and(eq(sites.id, siteId), eq(sites.userId, user.id)),
      columns: { id: true, settings: true },
    })
    if (!site) return { success: false, error: 'Site not found or access denied' }

    const currentSettings = (site.settings || {}) as Record<string, any>
    const updatedSettings = { ...currentSettings }

    if (data === null || data === undefined) {
      delete updatedSettings[fieldName]
    } else {
      const { path: publicAuthPagePath } = fieldName === 'navigation'
        ? await getPublicAuthPagePath(siteId)
        : { path: null }

      updatedSettings[fieldName] = fieldName === 'navigation'
        ? sanitizeNavigationSettings(data, { publicAuthPagePath })
        : sanitizeFooterSettings(data)
    }

    await db
      .update(sites)
      .set({ settings: updatedSettings })
      .where(eq(sites.id, siteId))

    revalidateTag('site-lookup')
    revalidateTag('all')
    revalidatePath('/', 'layout')

    return { success: true, error: null }
  } catch (error) {
    console.error('Failed to update site chrome field', {
      fieldName,
      siteId,
      error: error instanceof Error ? error.message : String(error),
    })
    return { success: false, error: 'Failed to save site settings' }
  }
}

export async function updateSiteNavigationAction(siteId: string, navigationData: Record<string, any>): Promise<{ success: boolean; error: string | null }> {
  return updateSiteChromeField(siteId, 'navigation', navigationData)
}

export async function updateSiteFooterAction(siteId: string, footerData: Record<string, any>): Promise<{ success: boolean; error: string | null }> {
  return updateSiteChromeField(siteId, 'footer', footerData)
}
