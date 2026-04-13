import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { categories } from '@/lib/db/schema/categories'
import { directories } from '@/lib/db/schema/directories'
import { events } from '@/lib/db/schema/events'
import { pages } from '@/lib/db/schema/pages'
import { posts } from '@/lib/db/schema/posts'
import { products } from '@/lib/db/schema/products'

export const DIRECTORY_SITEMAP_BATCH_SIZE = 10000

interface SitemapUrlEntry {
  loc: string
  lastModified?: Date | null
  changeFrequency?: 'daily' | 'weekly' | 'monthly'
  priority?: number
}

export function getSitemapBaseUrl(site: { subdomain: string; custom_domain?: string | null; customDomain?: string | null }) {
  const domain = site.custom_domain || site.customDomain
  return `https://${domain || `${site.subdomain}.systemeverything.com`}`
}

export function createSitemapXmlResponse(xml: string) {
  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=86400',
    },
  })
}

function escapeXml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

export function renderUrlSet(entries: SitemapUrlEntry[]) {
  const body = entries.map((entry) => {
    const lastModified = entry.lastModified ? `<lastmod>${entry.lastModified.toISOString()}</lastmod>` : ''
    const changeFrequency = entry.changeFrequency ? `<changefreq>${entry.changeFrequency}</changefreq>` : ''
    const priority = entry.priority !== undefined ? `<priority>${entry.priority.toFixed(1)}</priority>` : ''

    return `<url><loc>${escapeXml(entry.loc)}</loc>${lastModified}${changeFrequency}${priority}</url>`
  }).join('')

  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</urlset>`
}

export function renderSitemapIndex(urls: string[]) {
  const body = urls.map((url) => `<sitemap><loc>${escapeXml(url)}</loc></sitemap>`).join('')
  return `<?xml version="1.0" encoding="UTF-8"?><sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${body}</sitemapindex>`
}

export async function getPublishedDirectorySitemapCount(siteId: string) {
  const [result] = await db.select({ count: sql<number>`count(*)::int` })
    .from(directories)
    .where(and(eq(directories.siteId, siteId), eq(directories.status, 'published')))

  return result?.count ?? 0
}

export async function getContentSitemapEntries(siteId: string, baseUrl: string): Promise<SitemapUrlEntry[]> {
  const [productRows, postRows, pageRows, categoryRows, eventRows] = await Promise.all([
    db.select({ slug: products.slug, updatedAt: products.updatedAt })
      .from(products)
      .where(and(eq(products.siteId, siteId), eq(products.isPublished, true))),
    db.select({ slug: posts.slug, updatedAt: posts.updatedAt })
      .from(posts)
      .where(and(eq(posts.siteId, siteId), eq(posts.isPublished, true))),
    db.select({ slug: pages.slug, updatedAt: pages.updatedAt })
      .from(pages)
      .where(and(eq(pages.siteId, siteId), eq(pages.isPublished, true))),
    db.select({ slug: categories.slug, updatedAt: categories.updatedAt })
      .from(categories)
      .where(and(eq(categories.siteId, siteId), eq(categories.isPublished, true))),
    db.select({ slug: events.slug, updatedAt: events.updatedAt })
      .from(events)
      .where(and(eq(events.siteId, siteId), eq(events.isPublished, true))),
  ])

  return [
    { loc: baseUrl, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
    ...productRows.map((row) => ({ loc: `${baseUrl}/products/${row.slug}`, lastModified: row.updatedAt, changeFrequency: 'weekly' as const, priority: 0.8 })),
    ...postRows.map((row) => ({ loc: `${baseUrl}/posts/${row.slug}`, lastModified: row.updatedAt, changeFrequency: 'weekly' as const, priority: 0.7 })),
    ...pageRows.map((row) => ({ loc: `${baseUrl}/pages/${row.slug}`, lastModified: row.updatedAt, changeFrequency: 'monthly' as const, priority: 0.6 })),
    ...categoryRows.map((row) => ({ loc: `${baseUrl}/categories/${row.slug}`, lastModified: row.updatedAt, changeFrequency: 'weekly' as const, priority: 0.5 })),
    ...eventRows.map((row) => ({ loc: `${baseUrl}/events/${row.slug}`, lastModified: row.updatedAt, changeFrequency: 'weekly' as const, priority: 0.5 })),
  ]
}

export async function getDirectorySitemapEntries(siteId: string, baseUrl: string, chunk: number): Promise<SitemapUrlEntry[]> {
  const offset = chunk * DIRECTORY_SITEMAP_BATCH_SIZE

  const rows = await db.select({ slug: directories.slug, updatedAt: directories.updatedAt })
    .from(directories)
    .where(and(eq(directories.siteId, siteId), eq(directories.status, 'published')))
    .orderBy(asc(directories.displayOrder), desc(directories.createdAt), asc(directories.id))
    .limit(DIRECTORY_SITEMAP_BATCH_SIZE)
    .offset(offset)

  return rows.map((row) => ({
    loc: `${baseUrl}/directories/${row.slug}`,
    lastModified: row.updatedAt,
    changeFrequency: 'weekly',
    priority: 0.5,
  }))
}
