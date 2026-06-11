import { and, desc, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { sites } from '@/lib/db/schema'
import { getAuthenticatedUser, type AuthUser } from '@/lib/db/helpers'
import { generateSlug } from '@/lib/utils/slug'
import { RESERVED_SLUGS, SLUG_FORMAT_REGEX, UUID_REGEX } from '@/lib/utils/validation'

/**
 * Shared fast-fail preambles and slug utilities for the per-content-type
 * server actions (posts, products, pages, events, ...). Follows the
 * template-action-helpers convention: every 'use server' action still calls
 * these explicitly at its top, so each action keeps its own auth + ownership
 * verification — the helpers just remove the copy-pasted bodies.
 */

/** Minimal structural shape of a content table used by the helpers */
type ContentTable = {
  id: any
  siteId: any
  slug: any
  displayOrder: any
}

type OwnedSiteResult =
  | { ok: true; user: AuthUser }
  | { ok: false; error: string }

/**
 * List-action preamble: validate the site ID, require an authenticated user,
 * and verify the user owns the site. Fast-fails with the standard messages.
 */
export async function requireOwnedSite(siteId: string): Promise<OwnedSiteResult> {
  if (!UUID_REGEX.test(siteId)) {
    return { ok: false, error: 'Invalid site ID format' }
  }

  const user = await getAuthenticatedUser()
  if (!user) {
    return { ok: false, error: 'User not authenticated. Please log in first.' }
  }

  const [site] = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, user.id)))

  if (!site) {
    return { ok: false, error: 'Site not found or access denied' }
  }

  return { ok: true, user }
}

type OwnedRowResult<TRow> =
  | { ok: true; user: AuthUser; row: TRow }
  | { ok: false; error: string }

/**
 * Row-action preamble: validate the content ID, require an authenticated user,
 * load the row, and verify the user owns the row's site.
 * entityLabel feeds the standard error strings ("Post not found", ...).
 */
export async function requireOwnedContentRow<TRow extends { siteId: string }>(
  table: ContentTable,
  contentId: string,
  entityLabel: string
): Promise<OwnedRowResult<TRow>> {
  if (!UUID_REGEX.test(contentId)) {
    return { ok: false, error: `Invalid ${entityLabel.toLowerCase()} ID format` }
  }

  const user = await getAuthenticatedUser()
  if (!user) {
    return { ok: false, error: 'User not authenticated. Please log in first.' }
  }

  const [row] = await db
    .select()
    .from(table as any)
    .where(eq(table.id, contentId))

  if (!row) {
    return { ok: false, error: `${entityLabel} not found` }
  }

  const [site] = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.id, (row as TRow).siteId), eq(sites.userId, user.id)))

  if (!site) {
    return { ok: false, error: 'Site not found or access denied' }
  }

  return { ok: true, user, row: row as TRow }
}

type SlugUpdateResult =
  | { ok: true; slug: string }
  | { ok: false; error: string }

/**
 * Validate a slug being set through an update action: format, reserved list,
 * and uniqueness within the site (excluding the row being updated).
 */
export async function validateContentSlugUpdate(
  table: ContentTable,
  siteId: string,
  contentId: string,
  rawSlug: string,
  entityLabel: string
): Promise<SlugUpdateResult> {
  const slug = rawSlug.trim()

  if (!SLUG_FORMAT_REGEX.test(slug)) {
    return { ok: false, error: 'Invalid slug format. Use only letters, numbers, hyphens, and underscores.' }
  }

  if (RESERVED_SLUGS.includes(slug.toLowerCase())) {
    return { ok: false, error: 'This slug is reserved and cannot be used.' }
  }

  const [existing] = await db
    .select({ id: table.id })
    .from(table as any)
    .where(and(eq(table.siteId, siteId), eq(table.slug, slug)))

  if (existing && existing.id !== contentId) {
    const label = entityLabel.toLowerCase()
    const article = /^[aeiou]/.test(label) ? 'An' : 'A'
    return { ok: false, error: `${article} ${label} with the slug "${slug}" already exists. Please choose a different slug.` }
  }

  return { ok: true, slug }
}

/**
 * Duplicate-action slug: slugified title, suffixed with a counter until unique
 * within the site.
 */
export async function generateUniqueContentSlug(table: ContentTable, siteId: string, title: string): Promise<string> {
  // Canonical slugify (lowercase, hyphenate, 100-char cap)
  const baseSlug = generateSlug(title)

  let slug = baseSlug
  let counter = 1

  while (true) {
    const [existing] = await db
      .select({ id: table.id })
      .from(table as any)
      .where(and(eq(table.siteId, siteId), eq(table.slug, slug)))

    if (!existing) break

    slug = `${baseSlug}-${counter}`
    counter++
  }

  return slug
}

/** Next display_order value for a new row within a site */
export async function getNextContentDisplayOrder(table: ContentTable, siteId: string): Promise<number> {
  const [orderData] = await db
    .select({ displayOrder: table.displayOrder })
    .from(table as any)
    .where(eq(table.siteId, siteId))
    .orderBy(desc(table.displayOrder))
    .limit(1)

  return orderData ? orderData.displayOrder + 1 : 1
}

/**
 * Keys of content_blocks that are settings rather than blocks: primitive
 * values (e.g. show_featured_image) and objects without the block shape
 * (no id/type/content). Used when replacing a row's blocks wholesale.
 */
export function preserveNonBlockSettings(currentContentBlocks: Record<string, any> | null | undefined): Record<string, any> {
  const preservedSettings: Record<string, any> = {}

  Object.entries(currentContentBlocks || {}).forEach(([key, value]) => {
    if (typeof value !== 'object' || value === null) {
      preservedSettings[key] = value
    } else if (!('id' in value && 'type' in value && 'content' in value)) {
      preservedSettings[key] = value
    }
  })

  return preservedSettings
}
