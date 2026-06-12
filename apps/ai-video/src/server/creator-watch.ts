import { and, eq, sql } from "drizzle-orm"

import { db } from "@/server/db"
import { requireAppOrigin } from "@/server/origin"
import {
  aiVideoCreators,
  aiVideoViralVideos,
  aiVideoViralVideoStats,
} from "@/server/schema"
import { findCurrentUser, now, uuid } from "@/server/security"
import {
  fetchViralVideoStats,
  listRecentUploads,
  type ViralPlatform,
} from "@/server/video-download"
import { ingestViralVideoForUser } from "@/server/viral-videos"

// Watched creators: a timer (or the manual Sync button) lists each watched
// creator's recent uploads and ingests the ones not in the archive yet, then
// re-captures engagement stats so the archive can sort by trending velocity.

// How many recent uploads to list per profile, and how many NEW reels may be
// ingested per creator per run (each ingest costs a download + analysis).
const PROFILE_LIST_LIMIT = 10
const MAX_INGESTS_PER_CREATOR = 3
// Stats re-sync batch size per run (one yt-dlp call per video).
const STATS_BATCH_SIZE = 20

const WATCH_SYNC_INTERVAL_MS = 6 * 60 * 60_000
const STATS_SYNC_INTERVAL_MS = 12 * 60 * 60_000

export type WatchSyncResult = {
  checked: number
  added: number
  statsUpdated: number
}

async function requireUser() {
  const user = await findCurrentUser()
  if (!user) {
    throw new Error("Missing AI Video session")
  }
  return user
}

// Toggle auto-ingestion for one creator.
export async function setCreatorWatchForCurrentUser(
  creatorId: string,
  watch: boolean
): Promise<{ creatorId: string; watch: boolean }> {
  requireAppOrigin()
  const user = await requireUser()

  const [row] = await db
    .update(aiVideoCreators)
    .set({ watch, updatedAt: now() })
    .where(
      and(
        eq(aiVideoCreators.id, creatorId),
        eq(aiVideoCreators.userId, user.id)
      )
    )
    .returning()
  if (!row) {
    throw new Error("Creator not found")
  }
  return { creatorId: row.id, watch: row.watch }
}

// Manual "Sync now": runs both passes for the current user and reports counts.
export async function syncCreatorWatchForCurrentUser(): Promise<WatchSyncResult> {
  requireAppOrigin()
  const user = await requireUser()
  const { checked, added } = await syncWatchedCreators(user.id)
  const statsUpdated = await syncEngagementStats(user.id)
  return { checked, added, statsUpdated }
}

// Stable identity for dedupe: platform URLs for the same reel can differ by
// query params / trailing slash, so compare host+path only.
function normalizeReelUrl(url: string) {
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase().replace(/^www\./, "")
    const path = parsed.pathname.replace(/\/+$/, "").toLowerCase()
    return `${host}${path}`
  } catch {
    return url
  }
}

// Pass 1: list watched creators' recent uploads and ingest new ones.
// Per-creator failures are non-fatal (Instagram profile listings often need
// login); last_checked_at advances either way.
export async function syncWatchedCreators(
  userId?: string
): Promise<{ checked: number; added: number }> {
  const watched = await db
    .select()
    .from(aiVideoCreators)
    .where(
      userId
        ? and(eq(aiVideoCreators.watch, true), eq(aiVideoCreators.userId, userId))
        : eq(aiVideoCreators.watch, true)
    )

  let added = 0
  // Existing reel URLs per user, fetched once per run.
  const existingByUser = new Map<string, Set<string>>()

  for (const creator of watched) {
    try {
      const urls = await listRecentUploads(
        creator.platform as ViralPlatform,
        creator.username,
        PROFILE_LIST_LIMIT
      )

      let existing = existingByUser.get(creator.userId)
      if (!existing) {
        const rows = await db
          .select({ sourceUrl: aiVideoViralVideos.sourceUrl })
          .from(aiVideoViralVideos)
          .where(eq(aiVideoViralVideos.userId, creator.userId))
        existing = new Set(rows.map((row) => normalizeReelUrl(row.sourceUrl)))
        existingByUser.set(creator.userId, existing)
      }

      const fresh = urls
        .filter((url) => !existing.has(normalizeReelUrl(url)))
        .slice(0, MAX_INGESTS_PER_CREATOR)

      for (const url of fresh) {
        await ingestViralVideoForUser(creator.userId, url)
        existing.add(normalizeReelUrl(url))
        added += 1
      }
    } catch (error) {
      // Non-fatal: log and move on to the next creator.
      console.error("Creator watch sync failed", creator.username, error)
    } finally {
      await db
        .update(aiVideoCreators)
        .set({ lastCheckedAt: now() })
        .where(eq(aiVideoCreators.id, creator.id))
        .catch(() => undefined)
    }
  }

  return { checked: watched.length, added }
}

// Pass 2: append a fresh engagement snapshot for ready videos, oldest-synced
// first, capped per run. Two snapshots unlock the trending velocity.
export async function syncEngagementStats(userId?: string): Promise<number> {
  const videos = await db
    .select({
      id: aiVideoViralVideos.id,
      sourceUrl: aiVideoViralVideos.sourceUrl,
    })
    .from(aiVideoViralVideos)
    .leftJoin(
      aiVideoViralVideoStats,
      eq(aiVideoViralVideoStats.videoId, aiVideoViralVideos.id)
    )
    .where(
      userId
        ? and(
            eq(aiVideoViralVideos.status, "ready"),
            eq(aiVideoViralVideos.userId, userId)
          )
        : eq(aiVideoViralVideos.status, "ready")
    )
    .groupBy(aiVideoViralVideos.id)
    .orderBy(sql`max(${aiVideoViralVideoStats.capturedAt}) asc nulls first`)
    .limit(STATS_BATCH_SIZE)

  let updated = 0
  for (const video of videos) {
    try {
      const stats = await fetchViralVideoStats(video.sourceUrl)
      // An all-null snapshot carries no signal — skip it rather than bury the
      // last real numbers in the history.
      if (stats.views == null && stats.likes == null && stats.comments == null) {
        continue
      }
      await db.insert(aiVideoViralVideoStats).values({
        id: uuid(),
        videoId: video.id,
        capturedAt: now(),
        views: stats.views,
        likes: stats.likes,
        comments: stats.comments,
      })
      updated += 1
    } catch (error) {
      console.error("Stats re-sync failed", video.sourceUrl, error)
    }
  }
  return updated
}

// In-process scheduler, opt-in via AI_VIDEO_WATCH_ENABLED=1 so local dev
// doesn't scrape on a timer (the manual Sync button always works). The
// globalThis flag survives dev-server module reloads.
const SCHEDULER_FLAG = "__aiVideoWatchScheduler"

export function registerWatchScheduler() {
  if (process.env.AI_VIDEO_WATCH_ENABLED !== "1") return
  const globals = globalThis as Record<string, unknown>
  if (globals[SCHEDULER_FLAG]) return
  globals[SCHEDULER_FLAG] = true

  // unref: the timers must never keep the process alive on shutdown.
  setInterval(() => {
    syncWatchedCreators().catch((error) =>
      console.error("Scheduled creator watch sync failed", error)
    )
  }, WATCH_SYNC_INTERVAL_MS).unref()
  setInterval(() => {
    syncEngagementStats().catch((error) =>
      console.error("Scheduled stats sync failed", error)
    )
  }, STATS_SYNC_INTERVAL_MS).unref()
}
