import { db } from '@/lib/db'
import { products } from '@/lib/db/schema/products'
import { posts } from '@/lib/db/schema/posts'
import { pages } from '@/lib/db/schema/pages'
import { categories } from '@/lib/db/schema/categories'
import { directories } from '@/lib/db/schema/directories'
import { events } from '@/lib/db/schema/events'
import { eq, and } from 'drizzle-orm'
import { getSiteFromHeaders } from '@/lib/utils/site-resolver'
import type { MetadataRoute } from 'next'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const { success, site } = await getSiteFromHeaders()

  if (!success || !site) return []

  const domain = (site as any).custom_domain || (site as any).customDomain
  const baseUrl = `https://${domain || `${site.subdomain}.systemeverything.com`}`

  // Query all published content in parallel
  const [productRows, postRows, pageRows, categoryRows, directoryRows, eventRows] = await Promise.all([
    db.select({ slug: products.slug, updatedAt: products.updatedAt })
      .from(products)
      .where(and(eq(products.siteId, site.id), eq(products.isPublished, true))),
    db.select({ slug: posts.slug, updatedAt: posts.updatedAt })
      .from(posts)
      .where(and(eq(posts.siteId, site.id), eq(posts.isPublished, true))),
    db.select({ slug: pages.slug, updatedAt: pages.updatedAt })
      .from(pages)
      .where(and(eq(pages.siteId, site.id), eq(pages.isPublished, true))),
    db.select({ slug: categories.slug, updatedAt: categories.updatedAt })
      .from(categories)
      .where(and(eq(categories.siteId, site.id), eq(categories.isPublished, true))),
    db.select({ slug: directories.slug, updatedAt: directories.updatedAt })
      .from(directories)
      .where(and(eq(directories.siteId, site.id), eq(directories.isPublished, true))),
    db.select({ slug: events.slug, updatedAt: events.updatedAt })
      .from(events)
      .where(and(eq(events.siteId, site.id), eq(events.isPublished, true))),
  ])

  const entries: MetadataRoute.Sitemap = [
    { url: baseUrl, lastModified: new Date(), changeFrequency: 'daily', priority: 1 },
  ]

  for (const row of productRows) {
    entries.push({ url: `${baseUrl}/products/${row.slug}`, lastModified: row.updatedAt, changeFrequency: 'weekly', priority: 0.8 })
  }

  for (const row of postRows) {
    entries.push({ url: `${baseUrl}/posts/${row.slug}`, lastModified: row.updatedAt, changeFrequency: 'weekly', priority: 0.7 })
  }

  for (const row of pageRows) {
    entries.push({ url: `${baseUrl}/pages/${row.slug}`, lastModified: row.updatedAt, changeFrequency: 'monthly', priority: 0.6 })
  }

  for (const row of categoryRows) {
    entries.push({ url: `${baseUrl}/categories/${row.slug}`, lastModified: row.updatedAt, changeFrequency: 'weekly', priority: 0.5 })
  }

  for (const row of directoryRows) {
    entries.push({ url: `${baseUrl}/directories/${row.slug}`, lastModified: row.updatedAt, changeFrequency: 'weekly', priority: 0.5 })
  }

  for (const row of eventRows) {
    entries.push({ url: `${baseUrl}/events/${row.slug}`, lastModified: row.updatedAt, changeFrequency: 'weekly', priority: 0.5 })
  }

  return entries
}
