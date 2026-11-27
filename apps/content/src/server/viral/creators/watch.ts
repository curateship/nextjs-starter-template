import { and, asc, eq, inArray, isNull, lt, or } from "drizzle-orm"

import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { publishNotificationCreated } from "@/server/notifications/events"
import { customShellNotifications } from "@/server/schema"
import { getYoutubeApiKey } from "@/server/viral/settings"
import { viralCreatorPosts, viralCreators, viralProjectCreators, viralProjects } from "@/server/viral/schema"
import {
  refreshCreatorProfile,
} from "@/server/viral/creators/creators"
import { listRecentUploads } from "@/server/viral/creators/uploads"
import { recordYoutubeUnits, youtubeUnitsLeftToday } from "@/server/viral/youtube-units"
import { readSocials } from "@/lib/viral/socials"
import { MANUAL_UNITS_RESERVE } from "@/lib/viral/viral"
import { isCreatorPlatform } from "@/lib/viral/creators"
import { recordViews } from "@/server/viral/view-history"

/**
 * The watch timer: the one thing in this app that goes looking on its own.
 *
 * It does exactly one job. For each creator being watched it reads the ten
 * newest uploads, writes down the ones it has not seen, and tells the person
 * once. **It never downloads a file and never calls AI** — those cost money and
 * disk, and they only ever happen when somebody presses the button.
 *
 * Off unless `VIRAL_WATCH_ENABLED=1`, so a developer's machine and a review
 * deployment never quietly start scraping.
 */

/** How long before a creator is due another look. */
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000

/** How many of each creator's newest posts one check reads. */
const UPLOADS_PER_CHECK = 10

/**
 * How many creators one tick gets through. The tick runs often; doing a few
 * each time spreads the platform requests out rather than firing thirty at
 * once and being rate-limited for it.
 */
const CREATORS_PER_TICK = 5

export function creatorWatchEnabled(): boolean {
  return process.env.VIRAL_WATCH_ENABLED === "1"
}

export async function creatorWatchTick(): Promise<void> {
  if (!creatorWatchEnabled()) return

  const due = await claimDueCreators()
  if (due.length === 0) return

  // Read once for the whole tick rather than per creator. No key means the
  // YouTube creators are skipped and said so, not that the tick fails.
  const youtubeApiKey = await getYoutubeApiKey().catch(() => null)
  let warnedNoKey = false

  /** How many new videos each person got, so each is told once. */
  const freshPerOwner = new Map<string, { videos: number; creators: number }>()

  const active = await creatorsInActiveProjects(due.map((creator) => creator.id))

  for (const creator of due) {
    if (!isCreatorPlatform(creator.platform)) continue
    // A creator whose every project has paused their social, or archived
    // itself, waits until one of them resumes.
    if (!active.has(creator.id)) continue
    if (creator.platform === "youtube" && (await youtubeUnitsLeftToday()) < MANUAL_UNITS_RESERVE + 2) continue
    if (creator.platform === "youtube" && !youtubeApiKey) {
      if (!warnedNoKey) {
        console.warn(
          "Creator watch skipped the YouTube creators: no key is saved in Settings → YouTube."
        )
        warnedNoKey = true
      }
      continue
    }

    try {
      const found = await listRecentUploads({
        platform: creator.platform,
        handle: creator.handle,
        channelId: creator.platformChannelId,
        howMany: UPLOADS_PER_CHECK,
        youtubeApiKey,
      })

      if (creator.platform === "youtube") {
        // Reading the uploads list is one unit and their numbers one more.
        await recordYoutubeUnits(2, "creator_watch")
      }
      const written = await recordUploads(creator, found.uploads)
      if (found.profile) {
        await refreshCreatorProfile(creator.id, found.profile)
      }
      if (written > 0) {
        const running = freshPerOwner.get(creator.ownerId) ?? {
          videos: 0,
          creators: 0,
        }
        freshPerOwner.set(creator.ownerId, {
          videos: running.videos + written,
          creators: running.creators + 1,
        })
      }
    } catch (error) {
      // One creator's platform being unreachable must not stop the rest. The
      // check time was already moved, so this creator waits for the next turn
      // rather than being retried in a tight loop.
      console.error(
        `Creator watch could not read @${creator.handle} on ${creator.platform}`,
        error
      )
    }
  }

  for (const [ownerId, fresh] of freshPerOwner) {
    await tellOnce(ownerId, fresh)
  }
}

/** The creators among `ids` in at least one live project that has not paused their social. */
async function creatorsInActiveProjects(ids: string[]): Promise<Set<string>> {
  if (!ids.length) return new Set()
  const rows = await db
    .select({ creatorId: viralProjectCreators.creatorId, platform: viralCreators.platform, paused: viralProjects.pausedSocials })
    .from(viralProjectCreators)
    .innerJoin(viralProjects, eq(viralProjects.id, viralProjectCreators.projectId))
    .innerJoin(viralCreators, eq(viralCreators.id, viralProjectCreators.creatorId))
    .where(and(inArray(viralProjectCreators.creatorId, ids), isNull(viralProjects.archivedAt)))
  return new Set(
    rows.filter((row) => !readSocials(row.paused).some((social) => social === row.platform)).map((row) => row.creatorId)
  )
}

/**
 * Takes the creators due a look and marks them checked up front.
 *
 * Marking first rather than after is deliberate: if the tick dies halfway, the
 * creators it had started on wait for their next turn instead of being
 * hammered every tick.
 */
async function claimDueCreators() {
  const at = now()
  const due = await db
    .select()
    .from(viralCreators)
    .where(
      and(
        eq(viralCreators.watch, true),
        or(
          isNull(viralCreators.lastCheckedAt),
          lt(viralCreators.lastCheckedAt, new Date(at.getTime() - CHECK_EVERY_MS))
        )
      )
    )
    .orderBy(asc(viralCreators.lastCheckedAt))
    .limit(CREATORS_PER_TICK)

  for (const creator of due) {
    await db
      .update(viralCreators)
      .set({ lastCheckedAt: at })
      .where(eq(viralCreators.id, creator.id))
  }
  return due
}

/**
 * Writes down the uploads this creator has that we had not seen, and answers
 * how many were new.
 *
 * A video already saved updates its numbers instead of adding a second
 * row, so views and likes stay current without the list piling up copies. The
 * unique index is what makes "new" mean new: a row that was already there is
 * not counted, so nobody is told twice about the same video.
 */
export async function recordUploads(
  creator: typeof viralCreators.$inferSelect,
  uploads: Awaited<ReturnType<typeof listRecentUploads>>["uploads"]
): Promise<number> {
  if (uploads.length === 0) return 0
  const at = now()
  let written = 0

  for (const upload of uploads) {
    const [inserted] = await db
      .insert(viralCreatorPosts)
      .values({
        id: uuid(),
        ownerId: creator.ownerId,
        creatorId: creator.id,
        platform: creator.platform,
        platformVideoId: upload.platformVideoId,
        url: upload.url,
        title: upload.title,
        thumbnailUrl: upload.thumbnailUrl,
        durationSeconds: upload.durationSeconds,
        views: upload.views,
        likes: upload.likes,
        comments: upload.comments,
        postedAt: upload.postedAt,
        soundName: upload.soundName ?? null,
        soundArtist: upload.soundArtist ?? null,
        firstSeenAt: at,
      })
      .onConflictDoUpdate({
        target: [
          viralCreatorPosts.ownerId,
          viralCreatorPosts.platform,
          viralCreatorPosts.platformVideoId,
        ],
        set: {
          views: upload.views,
          likes: upload.likes,
          comments: upload.comments,
          title: upload.title,
          thumbnailUrl: upload.thumbnailUrl,
          // A read that didn't say the sound keeps the one already known.
          ...(upload.soundName ? { soundName: upload.soundName, soundArtist: upload.soundArtist ?? null } : {}),
        },
      })
      .returning({
        id: viralCreatorPosts.id,
        firstSeenAt: viralCreatorPosts.firstSeenAt,
      })
    // Only a row written by this very insert is new; an updated one came back
    // with the first-seen time it already had.
    if (inserted && inserted.firstSeenAt.getTime() === at.getTime()) {
      written += 1
    }
  }

  // Today's views figure for each post, for Rising fast.
  await recordViews(
    uploads.map((upload) => ({ platform: creator.platform, platformVideoId: upload.platformVideoId, views: upload.views })),
    at
  ).catch((error) => console.error("The views figures were not kept", error))

  return written
}

/**
 * One notice per person per tick, however many creators posted. Thirty
 * creators posting overnight is one line in the tray, not thirty.
 *
 * It goes out as the shell's `app_activity` kind, which is the door an app
 * writes its own words through — and which each person can switch off in
 * Settings → Notifications like any other kind.
 */
async function tellOnce(
  ownerId: string,
  fresh: { videos: number; creators: number }
): Promise<void> {
  try {
    const videos =
      fresh.videos === 1 ? "1 new video" : `${fresh.videos} new videos`
    const creators =
      fresh.creators === 1 ? "1 creator" : `${fresh.creators} creators`

    await db.insert(customShellNotifications).values({
      id: uuid(),
      recipientUserId: ownerId,
      type: "app_activity",
      message: `${videos} from ${creators} you follow`,
      detail: "Open their project in Viral to watch them.",
      createdAt: now(),
    })
    await publishNotificationCreated(ownerId)
  } catch (error) {
    // Nothing found is worth losing over a tray notice that would not write.
    console.error("A creator-watch notice was not recorded", error)
  }
}
