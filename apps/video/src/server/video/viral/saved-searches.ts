import { and, count, desc, eq, inArray, sql } from "drizzle-orm"

import {
  type ViralPlatform,
  type ViralSearchSummary,
  type ViralShort,
} from "@/lib/video/viral"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import {
  videoViralResults,
  videoViralSearches,
  type VideoViralResultRow,
  type VideoViralSearchRow,
} from "@/server/video/schema"
import {
  searchYoutubeShorts,
  type ViralSearchInput,
} from "@/server/video/viral/youtube"

/**
 * Every search is kept with its results, so looking at yesterday's keyword
 * costs nothing — YouTube only allows about 100 free searches a day. The same
 * keyword searched again updates its row and replaces its results (matched
 * ignoring case, the way YouTube matches), so the list never piles up copies.
 * Every read and write proves ownership first.
 */

/**
 * Runs one YouTube search and saves it. The search happens before anything is
 * written, so a failed YouTube call saves nothing; the row and its results
 * land in one transaction, so a crash between the two cannot leave a search
 * with yesterday's videos under today's date.
 */
export async function runAndSaveViralSearch(
  ownerId: string,
  input: ViralSearchInput,
  apiKey: string,
  fetchFn: typeof fetch = fetch,
  database: CustomShellDb = db
): Promise<{ search: ViralSearchSummary; results: ViralShort[] }> {
  const results = await searchYoutubeShorts(input, apiKey, fetchFn)
  // The search itself is 100 units; finding anything adds the two batch
  // calls for video numbers and channel counts, 1 unit each.
  const unitsSpent = results.length ? 102 : 100
  const platform: ViralPlatform = "youtube"
  const timestamp = now()

  const searchId = await database.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: videoViralSearches.id })
      .from(videoViralSearches)
      .where(
        and(
          eq(videoViralSearches.ownerId, ownerId),
          eq(videoViralSearches.platform, platform),
          sql`lower(${videoViralSearches.keyword}) = lower(${input.keyword})`
        )
      )
      .limit(1)

    let id = existing?.id
    if (id) {
      await tx
        .update(videoViralSearches)
        .set({
          keyword: input.keyword,
          days: input.days,
          minViews: input.minViews,
          ranAt: timestamp,
          unitsSpent,
        })
        .where(eq(videoViralSearches.id, id))
      await tx
        .delete(videoViralResults)
        .where(eq(videoViralResults.searchId, id))
    } else {
      id = uuid()
      await tx.insert(videoViralSearches).values({
        id,
        ownerId,
        keyword: input.keyword,
        platform,
        days: input.days,
        minViews: input.minViews,
        ranAt: timestamp,
        unitsSpent,
        createdAt: timestamp,
      })
    }

    if (results.length) {
      await tx.insert(videoViralResults).values(
        results.map((result) => ({
          id: uuid(),
          searchId: id,
          platform,
          platformVideoId: result.id,
          url: result.url,
          title: result.title,
          channelId: result.channelId,
          channelName: result.channelTitle,
          subscribers: result.subscribers,
          views: result.views,
          likes: result.likes,
          comments: result.comments,
          postedAt: asDate(result.publishedAt),
          durationSeconds: result.durationSeconds,
          thumbnailUrl: result.thumbnailUrl,
        }))
      )
    }
    return id
  })

  const search = summarize(
    {
      id: searchId,
      ownerId,
      keyword: input.keyword,
      platform,
      days: input.days,
      minViews: input.minViews,
      ranAt: timestamp,
      unitsSpent,
      createdAt: timestamp,
    },
    results.length
  )
  return { search, results }
}

/** The person's saved searches, the one that ran last first. */
export async function listOwnedViralSearches(
  ownerId: string,
  database: CustomShellDb = db
): Promise<ViralSearchSummary[]> {
  const rows = await database
    .select({
      search: videoViralSearches,
      resultCount: count(videoViralResults.id),
    })
    .from(videoViralSearches)
    .leftJoin(
      videoViralResults,
      eq(videoViralResults.searchId, videoViralSearches.id)
    )
    .where(eq(videoViralSearches.ownerId, ownerId))
    .groupBy(videoViralSearches.id)
    .orderBy(desc(videoViralSearches.ranAt))
  return rows.map((row) => summarize(row.search, row.resultCount))
}

/**
 * One saved search with its results, views first, or null when it does not
 * exist or belongs to somebody else — the two look the same on purpose.
 */
export async function getOwnedViralSearch(
  ownerId: string,
  searchId: string,
  database: CustomShellDb = db
): Promise<{ search: ViralSearchSummary; results: ViralShort[] } | null> {
  const [row] = await database
    .select()
    .from(videoViralSearches)
    .where(
      and(
        eq(videoViralSearches.id, searchId),
        eq(videoViralSearches.ownerId, ownerId)
      )
    )
    .limit(1)
  if (!row) return null

  const resultRows = await database
    .select()
    .from(videoViralResults)
    .where(eq(videoViralResults.searchId, row.id))
    .orderBy(desc(videoViralResults.views))
  return {
    search: summarize(row, resultRows.length),
    results: resultRows.map(asShort),
  }
}

/**
 * Deletes the person's saved searches; their result rows go with them through
 * the foreign key. Ids that are not theirs are left alone and not reported —
 * the answer is which ones actually went.
 */
export async function deleteOwnedViralSearches(
  ownerId: string,
  searchIds: string[],
  database: CustomShellDb = db
): Promise<string[]> {
  if (!searchIds.length) return []
  const deleted = await database
    .delete(videoViralSearches)
    .where(
      and(
        eq(videoViralSearches.ownerId, ownerId),
        inArray(videoViralSearches.id, searchIds)
      )
    )
    .returning({ id: videoViralSearches.id })
  return deleted.map((row) => row.id)
}

function summarize(
  row: VideoViralSearchRow,
  resultCount: number
): ViralSearchSummary {
  return {
    id: row.id,
    keyword: row.keyword,
    platform: row.platform as ViralPlatform,
    days: row.days as ViralSearchSummary["days"],
    min_views: row.minViews,
    ran_at: row.ranAt.toISOString(),
    result_count: resultCount,
  }
}

function asShort(row: VideoViralResultRow): ViralShort {
  return {
    id: row.platformVideoId,
    url: row.url,
    title: row.title,
    channelId: row.channelId,
    channelTitle: row.channelName,
    publishedAt: row.postedAt ? row.postedAt.toISOString() : "",
    thumbnailUrl: row.thumbnailUrl,
    durationSeconds: row.durationSeconds,
    views: row.views,
    likes: row.likes,
    comments: row.comments,
    subscribers: row.subscribers,
  }
}

/** A date YouTube sent as text, or null when it sent nothing readable. */
function asDate(value: string): Date | null {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}
