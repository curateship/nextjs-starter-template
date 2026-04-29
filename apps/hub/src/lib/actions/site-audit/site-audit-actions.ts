'use server'

import { db } from '@/lib/db'
import { sites, pages, posts, products, categories, directories, events } from '@/lib/db/schema'
import { eq, and, sql, asc, desc } from 'drizzle-orm'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import type { SiteSeoSettings } from '@/lib/db/schema/sites'

// ============================================================
// Types
// ============================================================

interface ContentAuditItem {
  id: string
  title: string
  slug: string
  type: string
  meta_description: string | null
  featured_image: string | null
  status: 'draft' | 'published'
  created_at: string | null
  updated_at: string | null
}

interface InternalLink {
  sourceSlug: string
  sourceType: string
  sourceTitle: string
  href: string
  isInternal: boolean
  targetExists: boolean
}

interface InternalLinkAnalysis {
  orphanContent: { slug: string; type: string; title: string }[]
  brokenLinks: { sourceSlug: string; sourceType: string; sourceTitle: string; href: string }[]
  totalLinks: number
  avgLinksPerPage: number
  orphanCount: number
  brokenLinkCount: number
}

const DIRECTORY_AUDIT_BATCH_SIZE = 2000

async function getPublishedDirectoryAuditRows(siteId: string) {
  const rows: Array<{
    id: string
    title: string
    slug: string
    metaDescription: string | null
    status: 'draft' | 'published'
    createdAt: Date
    updatedAt: Date
  }> = []

  let offset = 0

  while (true) {
    const batch = await db.select({
      id: directories.id,
      title: directories.title,
      slug: directories.slug,
      metaDescription: directories.metaDescription,
      status: directories.status,
      createdAt: directories.createdAt,
      updatedAt: directories.updatedAt,
    })
      .from(directories)
      .where(and(eq(directories.siteId, siteId), eq(directories.status, 'published')))
      .orderBy(asc(directories.displayOrder), desc(directories.createdAt), asc(directories.id))
      .limit(DIRECTORY_AUDIT_BATCH_SIZE)
      .offset(offset)

    if (batch.length === 0) break

    rows.push(...batch)

    if (batch.length < DIRECTORY_AUDIT_BATCH_SIZE) break
    offset += batch.length
  }

  return rows
}

async function getPublishedDirectoryLinkRows(siteId: string) {
  const rows: Array<{ title: string; slug: string; contentBlocks: unknown }> = []
  let offset = 0

  while (true) {
    const batch = await db.select({
      title: directories.title,
      slug: directories.slug,
      contentBlocks: directories.contentBlocks,
    })
      .from(directories)
      .where(and(eq(directories.siteId, siteId), eq(directories.status, 'published')))
      .orderBy(asc(directories.displayOrder), desc(directories.createdAt), asc(directories.id))
      .limit(DIRECTORY_AUDIT_BATCH_SIZE)
      .offset(offset)

    if (batch.length === 0) break

    rows.push(...batch)

    if (batch.length < DIRECTORY_AUDIT_BATCH_SIZE) break
    offset += batch.length
  }

  return rows
}

// ============================================================
// getSiteAuditData — fetches all published content with metadata fields
// ============================================================

export async function getSiteAuditData(siteId: string): Promise<ContentAuditItem[]> {
  const user = await getAuthenticatedUser()
  if (!user) return []

  // Verify ownership
  const [site] = await db.select({ id: sites.id }).from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, user.id)))
    .limit(1)
  if (!site) return []

  // Query all published content across all types in parallel
  const [pageRows, postRows, productRows, categoryRows, directoryRows, eventRows] = await Promise.all([
    db.select({
      id: pages.id, title: pages.title, slug: pages.slug,
      metaDescription: pages.metaDescription, isPublished: pages.isPublished,
      createdAt: pages.createdAt, updatedAt: pages.updatedAt,
    }).from(pages).where(and(eq(pages.siteId, siteId), eq(pages.isPublished, true))),

    db.select({
      id: posts.id, title: posts.title, slug: posts.slug,
      metaDescription: posts.metaDescription, featuredImage: posts.featuredImage,
      isPublished: posts.isPublished, createdAt: posts.createdAt, updatedAt: posts.updatedAt,
    }).from(posts).where(and(eq(posts.siteId, siteId), eq(posts.isPublished, true))),

    db.select({
      id: products.id, title: products.title, slug: products.slug,
      metaDescription: products.metaDescription, featuredImage: products.featuredImage, isPublished: products.isPublished,
      createdAt: products.createdAt, updatedAt: products.updatedAt,
    }).from(products).where(and(eq(products.siteId, siteId), eq(products.isPublished, true))),

    db.select({
      id: categories.id, title: categories.title, slug: categories.slug,
      metaDescription: categories.metaDescription, description: categories.description,
      isPublished: categories.isPublished, createdAt: categories.createdAt, updatedAt: categories.updatedAt,
    }).from(categories).where(and(eq(categories.siteId, siteId), eq(categories.isPublished, true))),
    getPublishedDirectoryAuditRows(siteId),

    db.select({
      id: events.id, title: events.title, slug: events.slug,
      metaDescription: events.metaDescription, description: events.description,
      isPublished: events.isPublished, createdAt: events.createdAt, updatedAt: events.updatedAt,
    }).from(events).where(and(eq(events.siteId, siteId), eq(events.isPublished, true))),
  ])

  // Normalize all content into a single array
  const allContent: ContentAuditItem[] = [
    ...pageRows.map(r => ({
      id: r.id, title: r.title, slug: r.slug, type: 'page',
      meta_description: r.metaDescription || null,
      featured_image: null,
      status: 'published' as const,
      created_at: r.createdAt?.toISOString() || null,
      updated_at: r.updatedAt?.toISOString() || null,
    })),
    ...postRows.map(r => ({
      id: r.id, title: r.title, slug: r.slug, type: 'post',
      meta_description: r.metaDescription || null,
      featured_image: r.featuredImage || null,
      status: 'published' as const,
      created_at: r.createdAt?.toISOString() || null,
      updated_at: r.updatedAt?.toISOString() || null,
    })),
    ...productRows.map(r => ({
      id: r.id, title: r.title, slug: r.slug, type: 'product',
      meta_description: r.metaDescription || null,
      featured_image: r.featuredImage || null,
      status: 'published' as const,
      created_at: r.createdAt?.toISOString() || null,
      updated_at: r.updatedAt?.toISOString() || null,
    })),
    ...categoryRows.map(r => ({
      id: r.id, title: r.title, slug: r.slug, type: 'category',
      meta_description: r.metaDescription || (r as any).description || null,
      featured_image: null,
      status: 'published' as const,
      created_at: r.createdAt?.toISOString() || null,
      updated_at: r.updatedAt?.toISOString() || null,
    })),
    ...directoryRows.map(r => ({
      id: r.id, title: r.title, slug: r.slug, type: 'directory',
      meta_description: r.metaDescription || null,
      featured_image: null,
      status: r.status,
      created_at: r.createdAt?.toISOString() || null,
      updated_at: r.updatedAt?.toISOString() || null,
    })),
    ...eventRows.map(r => ({
      id: r.id, title: r.title, slug: r.slug, type: 'event',
      meta_description: r.metaDescription || (r as any).description || null,
      featured_image: null,
      status: 'published' as const,
      created_at: r.createdAt?.toISOString() || null,
      updated_at: r.updatedAt?.toISOString() || null,
    })),
  ]

  return allContent
}

// ============================================================
// getInternalLinkAnalysis — scans content HTML for internal links
// ============================================================

export async function getInternalLinkAnalysis(siteId: string): Promise<InternalLinkAnalysis> {
  const user = await getAuthenticatedUser()
  if (!user) return { orphanContent: [], brokenLinks: [], totalLinks: 0, avgLinksPerPage: 0, orphanCount: 0, brokenLinkCount: 0 }

  // Verify ownership
  const [site] = await db.select({ id: sites.id }).from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, user.id)))
    .limit(1)
  if (!site) return { orphanContent: [], brokenLinks: [], totalLinks: 0, avgLinksPerPage: 0, orphanCount: 0, brokenLinkCount: 0 }

  // Get all published content with their content blocks (HTML source)
  const [pageRows, postRows, productRows, categoryRows, directoryRows, eventRows] = await Promise.all([
    db.select({ title: pages.title, slug: pages.slug, contentBlocks: pages.contentBlocks })
      .from(pages).where(and(eq(pages.siteId, siteId), eq(pages.isPublished, true))),
    db.select({ title: posts.title, slug: posts.slug, content: posts.content, contentBlocks: posts.contentBlocks })
      .from(posts).where(and(eq(posts.siteId, siteId), eq(posts.isPublished, true))),
    db.select({ title: products.title, slug: products.slug, contentBlocks: products.contentBlocks })
      .from(products).where(and(eq(products.siteId, siteId), eq(products.isPublished, true))),
    db.select({ title: categories.title, slug: categories.slug, contentBlocks: categories.contentBlocks })
      .from(categories).where(and(eq(categories.siteId, siteId), eq(categories.isPublished, true))),
    getPublishedDirectoryLinkRows(siteId),
    db.select({ title: events.title, slug: events.slug, contentBlocks: events.contentBlocks })
      .from(events).where(and(eq(events.siteId, siteId), eq(events.isPublished, true))),
  ])

  // Build a set of all known slugs for each content type
  const knownSlugs = new Set<string>()
  const addSlugs = (rows: { slug: string }[], prefix: string) => {
    for (const row of rows) {
      knownSlugs.add(`/${prefix}/${row.slug}`)
    }
  }
  // Home page
  knownSlugs.add('/')
  addSlugs(pageRows, 'pages')
  addSlugs(postRows, 'posts')
  addSlugs(productRows, 'products')
  addSlugs(categoryRows, 'categories')
  addSlugs(directoryRows, 'directories')
  addSlugs(eventRows, 'events')

  // Extract links from content blocks
  const allLinks: InternalLink[] = []
  const incomingLinkCounts = new Map<string, number>()

  // Initialize all slugs with 0 incoming
  for (const slug of knownSlugs) {
    incomingLinkCounts.set(slug, 0)
  }

  const allRows = [
    ...pageRows.map(r => ({ ...r, type: 'page' })),
    ...postRows.map(r => ({ ...r, type: 'post' })),
    ...productRows.map(r => ({ ...r, type: 'product' })),
    ...categoryRows.map(r => ({ ...r, type: 'category' })),
    ...directoryRows.map(r => ({ ...r, type: 'directory' })),
    ...eventRows.map(r => ({ ...r, type: 'event' })),
  ]

  // Regex to find href attributes in HTML content
  const hrefRegex = /href=["']([^"']+)["']/g

  for (const row of allRows) {
    // Serialize content blocks to string to search for links
    const contentStr = JSON.stringify(row.contentBlocks || {}) + ((row as any).content || '')

    let match
    while ((match = hrefRegex.exec(contentStr)) !== null) {
      const href = match[1]

      // Check if internal link (relative path or matches known patterns)
      const isInternal = href.startsWith('/') && !href.startsWith('//') && !href.startsWith('/api')

      if (isInternal) {
        // Normalize the path
        const normalizedHref = href.split('?')[0].split('#')[0].replace(/\/$/, '') || '/'
        const targetExists = knownSlugs.has(normalizedHref)

        allLinks.push({
          sourceSlug: row.slug,
          sourceType: row.type,
          sourceTitle: row.title,
          href: normalizedHref,
          isInternal: true,
          targetExists,
        })

        // Track incoming links
        if (targetExists) {
          incomingLinkCounts.set(normalizedHref, (incomingLinkCounts.get(normalizedHref) || 0) + 1)
        }
      }
    }
  }

  // Find orphan content (0 incoming links, excluding homepage)
  const orphanContent: { slug: string; type: string; title: string }[] = []
  for (const row of allRows) {
    const typePrefix = row.type === 'post' ? 'posts' : row.type === 'product' ? 'products' : row.type === 'category' ? 'categories' : row.type === 'directory' ? 'directories' : row.type === 'event' ? 'events' : 'pages'
    const fullSlug = `/${typePrefix}/${row.slug}`
    const incoming = incomingLinkCounts.get(fullSlug) || 0
    if (incoming === 0) {
      orphanContent.push({ slug: row.slug, type: row.type, title: row.title })
    }
  }

  // Find broken internal links
  const brokenLinks = allLinks
    .filter(l => l.isInternal && !l.targetExists)
    .map(l => ({ sourceSlug: l.sourceSlug, sourceType: l.sourceType, sourceTitle: l.sourceTitle, href: l.href }))

  return {
    orphanContent,
    brokenLinks,
    totalLinks: allLinks.length,
    avgLinksPerPage: allRows.length > 0 ? Math.round((allLinks.length / allRows.length) * 10) / 10 : 0,
    orphanCount: orphanContent.length,
    brokenLinkCount: brokenLinks.length,
  }
}

// ============================================================
// saveSiteAuditSettings — updates site audit/metadata settings
// ============================================================

export async function saveSiteAuditSettings(siteId: string, seoSettings: SiteSeoSettings) {
  const user = await getAuthenticatedUser()
  if (!user) return { error: 'Authentication required' }

  // Verify ownership
  const [site] = await db.select({ id: sites.id, settings: sites.settings }).from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, user.id)))
    .limit(1)
  if (!site) return { error: 'Site not found' }

  // Validate google verification code format
  if (seoSettings.seo_google_verification && !/^[a-zA-Z0-9_-]+$/.test(seoSettings.seo_google_verification)) {
    return { error: 'Invalid Google verification code format' }
  }

  // Merge settings into existing settings
  const currentSettings = (site.settings as any) || {}
  const updatedSettings = {
    ...currentSettings,
    ...seoSettings,
  }

  await db.update(sites)
    .set({ settings: updatedSettings, updatedAt: new Date() })
    .where(eq(sites.id, siteId))

  return { success: true }
}

// ============================================================
// getSiteForAudit — lightweight site fetch for site audit dashboard
// ============================================================

export async function getSiteForAudit(siteId: string) {
  const user = await getAuthenticatedUser()
  if (!user) return null

  const [site] = await db.select({
    id: sites.id,
    name: sites.name,
    subdomain: sites.subdomain,
    customDomain: sites.customDomain,
    settings: sites.settings,
  }).from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, user.id)))
    .limit(1)

  if (!site) return null

  return {
    id: site.id,
    name: site.name,
    subdomain: site.subdomain,
    custom_domain: site.customDomain,
    settings: site.settings as any,
  }
}
