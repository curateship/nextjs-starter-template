'use server'

import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { directories } from '@/lib/db/schema'
import { requireSiteOwnership } from '@/lib/db/helpers'
import { getGoogleMapsConfig } from '@/lib/actions/integrations/config-helpers'
import { revalidateTag } from '@/lib/cache'
import { UUID_REGEX } from '@/lib/utils/validation'
import { planCoordinateSync } from './directory-map-core'
import { geocodeDirectoryAddress } from './directory-geocoding'

// Bounded geocodes per backfill call to stay well inside API quotas; the editor
// reports the remaining count so the admin can run it again.
const BACKFILL_BATCH_SIZE = 20
// Hard bound on listings examined per call; sites beyond this run the backfill repeatedly.
const BACKFILL_SCAN_LIMIT = 500

/**
 * Public map configuration for the listing-views map mode. The Maps key is already
 * exposed on public listing pages via the embed iframe URL, so returning it here
 * grants nothing new.
 */
export async function getDirectoryMapConfigAction(siteId: string): Promise<{ apiKey: string | null }> {
  if (!UUID_REGEX.test(siteId)) return { apiKey: null }
  try {
    const config = await getGoogleMapsConfig(siteId)
    return { apiKey: config?.apiKey ?? null }
  } catch {
    return { apiKey: null }
  }
}

export interface DirectoryCoordinateStats {
  hasApiKey: boolean
  totalPublished: number
  withCoordinates: number
  needingGeocode: number
}

/** Owner-facing stats for the listing-views block editor's map panel. */
export async function getDirectoryCoordinateStatsAction(siteId: string): Promise<{
  data: DirectoryCoordinateStats | null
  error: string | null
}> {
  try {
    await requireSiteOwnership(siteId)
    const [config, rows] = await Promise.all([
      getGoogleMapsConfig(siteId),
      db
        .select({
          latitude: directories.latitude,
          longitude: directories.longitude,
          geocodedAddress: directories.geocodedAddress,
          contentBlocks: directories.contentBlocks,
        })
        .from(directories)
        .where(and(eq(directories.siteId, siteId), eq(directories.status, 'published')))
        .limit(BACKFILL_SCAN_LIMIT),
    ])

    let withCoordinates = 0
    let needingGeocode = 0
    for (const row of rows) {
      if (row.latitude != null && row.longitude != null) withCoordinates++
      const plan = planCoordinateSync(
        { latitude: row.latitude, longitude: row.longitude, geocodedAddress: row.geocodedAddress },
        row.contentBlocks
      )
      if (plan.action === 'geocode') needingGeocode++
    }

    return {
      data: {
        hasApiKey: Boolean(config?.apiKey),
        totalPublished: rows.length,
        withCoordinates,
        needingGeocode,
      },
      error: null,
    }
  } catch (error) {
    console.error('getDirectoryCoordinateStatsAction error:', error)
    return { data: null, error: 'Failed to load map coordinate stats' }
  }
}

/**
 * Geocode published listings whose address has no (or stale) coordinates.
 * Processes a bounded batch per call; run again while `remaining` > 0.
 */
export async function backfillDirectoryCoordinatesAction(siteId: string): Promise<{
  data: { geocoded: number; failed: number; remaining: number } | null
  error: string | null
}> {
  try {
    await requireSiteOwnership(siteId)
    const config = await getGoogleMapsConfig(siteId)
    if (!config?.apiKey) {
      return { data: null, error: 'Google Maps integration is not configured for this site' }
    }

    const rows = await db
      .select({
        id: directories.id,
        latitude: directories.latitude,
        longitude: directories.longitude,
        geocodedAddress: directories.geocodedAddress,
        contentBlocks: directories.contentBlocks,
      })
      .from(directories)
      .where(and(eq(directories.siteId, siteId), eq(directories.status, 'published')))
      .limit(BACKFILL_SCAN_LIMIT)

    const candidates = rows.flatMap((row) => {
      const plan = planCoordinateSync(
        { latitude: row.latitude, longitude: row.longitude, geocodedAddress: row.geocodedAddress },
        row.contentBlocks
      )
      return plan.action === 'geocode' ? [{ id: row.id, address: plan.address }] : []
    })

    let geocoded = 0
    let failed = 0
    for (const candidate of candidates.slice(0, BACKFILL_BATCH_SIZE)) {
      const point = await geocodeDirectoryAddress(candidate.address, config.apiKey)
      if (!point) {
        failed++
        continue
      }
      await db
        .update(directories)
        .set({
          latitude: point.latitude,
          longitude: point.longitude,
          geocodedAddress: candidate.address,
          updatedAt: new Date(),
        })
        .where(eq(directories.id, candidate.id))
      geocoded++
    }

    if (geocoded > 0) {
      revalidateTag('listing-views')
      revalidateTag('directory')
      revalidateTag(`site-${siteId}`)
    }

    return {
      data: {
        geocoded,
        failed,
        remaining: Math.max(0, candidates.length - geocoded - failed),
      },
      error: null,
    }
  } catch (error) {
    console.error('backfillDirectoryCoordinatesAction error:', error)
    return { data: null, error: 'Failed to geocode listings' }
  }
}
