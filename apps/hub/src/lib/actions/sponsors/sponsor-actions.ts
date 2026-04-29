'use server'

import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm'
import { revalidatePath, revalidateTag } from 'next/cache'
import { db } from '@/lib/db'
import { sites, sponsors } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { isSafeUrl } from '@/lib/utils/url-validator'

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export interface Sponsor {
  id: string
  site_id: string
  title: string
  description: string | null
  image_url: string | null
  url: string
  is_active: boolean
  display_order: number
  created_at: string
  updated_at: string
}

export type SponsorPublic = Pick<Sponsor, 'id' | 'title' | 'description' | 'image_url' | 'url'>

export interface SponsorInput {
  site_id: string
  title: string
  description?: string | null
  image_url?: string | null
  url: string
  is_active?: boolean
}

export interface SponsorUpdateInput {
  title?: string
  description?: string | null
  image_url?: string | null
  url?: string
  is_active?: boolean
}

function rowToSponsor(row: typeof sponsors.$inferSelect): Sponsor {
  return {
    id: row.id,
    site_id: row.siteId,
    title: row.title,
    description: row.description,
    image_url: row.imageUrl,
    url: row.url,
    is_active: row.isActive,
    display_order: row.displayOrder,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

function cleanOptionalText(value?: string | null) {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed || null
}

function validateSponsorUrl(url?: string | null) {
  const trimmed = typeof url === 'string' ? url.trim() : ''
  if (!trimmed) return 'Sponsor URL is required'
  if (!isSafeUrl(trimmed)) return 'Sponsor URL is not safe'
  return null
}

function validateOptionalSafeUrl(url?: string | null, label = 'URL') {
  const trimmed = typeof url === 'string' ? url.trim() : ''
  if (!trimmed) return null
  if (!isSafeUrl(trimmed)) return `${label} is not safe`
  return null
}

async function verifySiteOwnership(siteId: string) {
  if (!UUID_REGEX.test(siteId)) return null

  const user = await getAuthenticatedUser()
  if (!user) return null

  if (user.role === 'super_admin') {
    const [site] = await db.select({ id: sites.id }).from(sites).where(eq(sites.id, siteId)).limit(1)
    return site ?? null
  }

  const [site] = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, user.id)))
    .limit(1)

  return site ?? null
}

async function getSponsorForUser(sponsorId: string) {
  if (!UUID_REGEX.test(sponsorId)) return null

  const [sponsor] = await db.select().from(sponsors).where(eq(sponsors.id, sponsorId)).limit(1)
  if (!sponsor) return null

  const site = await verifySiteOwnership(sponsor.siteId)
  if (!site) return null

  return sponsor
}

function revalidateSponsors() {
  revalidatePath('/admin/sponsors')
  revalidateTag('sponsors')
}

export async function getSiteSponsorsAction(siteId: string): Promise<{ data: Sponsor[] | null; error: string | null }> {
  try {
    const site = await verifySiteOwnership(siteId)
    if (!site) return { data: null, error: 'Site not found or access denied' }

    const rows = await db
      .select()
      .from(sponsors)
      .where(eq(sponsors.siteId, siteId))
      .orderBy(asc(sponsors.displayOrder), desc(sponsors.createdAt))

    return { data: rows.map(rowToSponsor), error: null }
  } catch {
    return { data: null, error: 'Failed to load sponsors' }
  }
}

export async function getActiveSponsorsForPickerAction(siteId: string): Promise<{ data: SponsorPublic[]; error: string | null }> {
  try {
    const site = await verifySiteOwnership(siteId)
    if (!site) return { data: [], error: 'Site not found or access denied' }

    const rows = await db
      .select({
        id: sponsors.id,
        title: sponsors.title,
        description: sponsors.description,
        image_url: sponsors.imageUrl,
        url: sponsors.url,
      })
      .from(sponsors)
      .where(and(eq(sponsors.siteId, siteId), eq(sponsors.isActive, true)))
      .orderBy(asc(sponsors.displayOrder), desc(sponsors.createdAt))

    return { data: rows, error: null }
  } catch {
    return { data: [], error: 'Failed to load sponsors' }
  }
}

export async function getActiveSponsorsByIdsAction(siteId: string, sponsorIds: string[]): Promise<Record<string, SponsorPublic>> {
  const rawIds = Array.isArray(sponsorIds) ? sponsorIds.slice(0, 50) : []
  const ids = Array.from(new Set(rawIds.filter((id): id is string => typeof id === 'string' && UUID_REGEX.test(id))))
  if (!UUID_REGEX.test(siteId) || ids.length === 0) return {}

  const rows = await db
    .select({
      id: sponsors.id,
      title: sponsors.title,
      description: sponsors.description,
      image_url: sponsors.imageUrl,
      url: sponsors.url,
    })
    .from(sponsors)
    .where(and(
      eq(sponsors.siteId, siteId),
      eq(sponsors.isActive, true),
      inArray(sponsors.id, ids)
    ))

  return Object.fromEntries(rows.map((sponsor) => [sponsor.id, sponsor]))
}

export async function createSponsorAction(input: SponsorInput): Promise<{ data: Sponsor | null; error: string | null }> {
  try {
    const title = input.title?.trim()
    if (!title) return { data: null, error: 'Sponsor title is required' }

    const urlError = validateSponsorUrl(input.url)
    if (urlError) return { data: null, error: urlError }

    const imageUrlError = validateOptionalSafeUrl(input.image_url, 'Sponsor image URL')
    if (imageUrlError) return { data: null, error: imageUrlError }

    const site = await verifySiteOwnership(input.site_id)
    if (!site) return { data: null, error: 'Site not found or access denied' }

    const [orderRow] = await db
      .select({ displayOrder: sql<number>`coalesce(max(${sponsors.displayOrder}), 0)::int` })
      .from(sponsors)
      .where(eq(sponsors.siteId, input.site_id))

    const [created] = await db
      .insert(sponsors)
      .values({
        siteId: input.site_id,
        title,
        description: cleanOptionalText(input.description),
        imageUrl: cleanOptionalText(input.image_url),
        url: input.url.trim(),
        isActive: input.is_active !== false,
        displayOrder: (orderRow?.displayOrder ?? 0) + 1,
      })
      .returning()

    revalidateSponsors()

    return { data: rowToSponsor(created), error: null }
  } catch {
    return { data: null, error: 'Failed to create sponsor' }
  }
}

export async function updateSponsorAction(sponsorId: string, input: SponsorUpdateInput): Promise<{ data: Sponsor | null; error: string | null }> {
  try {
    const sponsor = await getSponsorForUser(sponsorId)
    if (!sponsor) return { data: null, error: 'Sponsor not found or access denied' }

    const updates: Partial<typeof sponsors.$inferInsert> = {
      updatedAt: new Date(),
    }

    if (input.title !== undefined) {
      const title = input.title.trim()
      if (!title) return { data: null, error: 'Sponsor title is required' }
      updates.title = title
    }

    if (input.url !== undefined) {
      const urlError = validateSponsorUrl(input.url)
      if (urlError) return { data: null, error: urlError }
      updates.url = input.url.trim()
    }

    if (input.image_url !== undefined) {
      const imageUrlError = validateOptionalSafeUrl(input.image_url, 'Sponsor image URL')
      if (imageUrlError) return { data: null, error: imageUrlError }
      updates.imageUrl = cleanOptionalText(input.image_url)
    }

    if (input.description !== undefined) updates.description = cleanOptionalText(input.description)
    if (input.is_active !== undefined) updates.isActive = input.is_active

    const [updated] = await db
      .update(sponsors)
      .set(updates)
      .where(eq(sponsors.id, sponsorId))
      .returning()

    revalidateSponsors()

    return { data: rowToSponsor(updated), error: null }
  } catch {
    return { data: null, error: 'Failed to update sponsor' }
  }
}

export async function deleteSponsorAction(sponsorId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    const sponsor = await getSponsorForUser(sponsorId)
    if (!sponsor) return { success: false, error: 'Sponsor not found or access denied' }

    await db.delete(sponsors).where(eq(sponsors.id, sponsorId))
    revalidateSponsors()

    return { success: true, error: null }
  } catch {
    return { success: false, error: 'Failed to delete sponsor' }
  }
}

export async function deleteSponsorsAction(sponsorIds: string[]): Promise<{ success: boolean; error: string | null }> {
  try {
    const ids = Array.from(new Set(sponsorIds))
    if (ids.length === 0) return { success: false, error: 'No sponsors selected' }
    if (ids.some((id) => !UUID_REGEX.test(id))) return { success: false, error: 'Invalid sponsor ID format' }

    const rows = await db
      .select({ id: sponsors.id, siteId: sponsors.siteId })
      .from(sponsors)
      .where(inArray(sponsors.id, ids))

    if (rows.length === 0) return { success: false, error: 'Sponsors not found' }

    const siteIds = Array.from(new Set(rows.map((row) => row.siteId)))
    for (const siteId of siteIds) {
      const site = await verifySiteOwnership(siteId)
      if (!site) return { success: false, error: 'Access denied to one or more sponsors' }
    }

    await db.delete(sponsors).where(inArray(sponsors.id, ids))
    revalidateSponsors()

    return { success: true, error: null }
  } catch {
    return { success: false, error: 'Failed to delete sponsors' }
  }
}
