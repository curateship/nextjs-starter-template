import { and, eq } from "drizzle-orm"

import { db } from "@/server/db"
import { requireAppOrigin } from "@/server/origin"
import { aiVideoCreators, aiVideoViralVideos } from "@/server/schema"
import { now, requireUser } from "@/server/security"
import { listRecentUploads, type ViralPlatform } from "@/server/video-download"
import { ingestViralVideoForUser } from "@/server/viral-videos"

// Watched creators: a timer (or the manual Sync button) lists each watched
// creator's recent uploads and ingests the ones not in the archive yet.

// How many recent uploads to list per profile, and how many NEW reels may be
// ingested per creator per run (each ingest costs a download + analysis).
const PROFILE_LIST_LIMIT = 10
const MAX_INGESTS_PER_CREATOR = 3

const WATCH_SYNC_INTERVAL_MS = 6 * 60 * 60_000

export type WatchSyncResult = {
  checked: number
  added: number
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

// Manual "Sync now": lists watched creators' recent uploads for the current
// user and ingests the new ones.
export async function syncCreatorWatchForCurrentUser(): Promise<WatchSyncResult> {
  requireAppOrigin()
  const user = await requireUser()
  return syncWatchedCreators(user.id)
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

// In-process scheduler, opt-in via AI_VIDEO_WATCH_ENABLED=1 so local dev
// doesn't scrape on a timer (the manual Sync button always works). The
// globalThis flag survives dev-server module reloads.
const SCHEDULER_FLAG = "__aiVideoWatchScheduler"

export function registerWatchScheduler() {
  if (process.env.AI_VIDEO_WATCH_ENABLED !== "1") return
  const globals = globalThis as Record<string, unknown>
  if (globals[SCHEDULER_FLAG]) return
  globals[SCHEDULER_FLAG] = true

  // unref: the timer must never keep the process alive on shutdown.
  setInterval(() => {
    syncWatchedCreators().catch((error) =>
      console.error("Scheduled creator watch sync failed", error)
    )
  }, WATCH_SYNC_INTERVAL_MS).unref()
}
