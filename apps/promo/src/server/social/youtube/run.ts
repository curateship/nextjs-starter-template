import { and, desc, eq, isNotNull, ne, sql } from "drizzle-orm"

import { stopForBanPage } from "@/server/bans/browser"
import type { CommandTarget } from "@/server/browser/command"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import type { JobKind } from "@/lib/social/options"
import { VIDEO_NUMBERS_PER_READ } from "@/lib/social/youtube/options"

import type { QueuedJob } from "../jobs"
import { storeInboxReading } from "../phone-apps/inbox"
import { promoAccounts } from "../schema"
import { youtubeHealth, type YoutubeState } from "./calls"
import { promoYoutubePosts } from "./schema"
import { runYoutubeUpload } from "./uploads"

/**
 * YouTube's jobs, handed out by the browser program's runner (`../runner.ts`),
 * which has already found the channel's browser or phone. Kept beside
 * YouTube's code so the runner only learns that YouTube exists.
 */

type AccountRow = typeof promoAccounts.$inferSelect

/** YouTube's work as the channel itself, in its own browser or on its phone. Only a YouTube channel does these. */
export const YOUTUBE_ACCOUNT_KINDS: readonly JobKind[] = ["youtube_upload", "youtube_health"]

export async function runYoutubeAccountJob(job: QueuedJob, account: AccountRow, target: CommandTarget, db: CustomShellDb = defaultDb): Promise<void> {
  if (job.kind === "youtube_upload") {
    await runYoutubeUpload(job.userId, account, target, job.payload, job.id, db)
  } else if (job.kind === "youtube_health") {
    await recordYoutubeHealth(job.userId, account, target, db)
  } else {
    throw new Error(`There is no YouTube job called "${job.kind}".`)
  }
}

/**
 * The daily reading (part 8): subscribers, how many videos the channel has,
 * and the views, likes and comments of the videos Promo uploaded, newest
 * first. The same visit reads the newest comments under them (part 9, Tyler:
 * "Once a day"), which land on the Comments tab the way a phone's do. A
 * strike or terminated page stops the channel at once (part 2).
 */
export async function recordYoutubeHealth(
  userId: string,
  account: AccountRow,
  target: CommandTarget,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<void> {
  const videos = await db
    .select({ id: promoYoutubePosts.id, postUrl: promoYoutubePosts.postUrl })
    .from(promoYoutubePosts)
    .where(and(eq(promoYoutubePosts.accountId, account.id), eq(promoYoutubePosts.status, "posted"), ne(promoYoutubePosts.postUrl, "")))
    .orderBy(desc(promoYoutubePosts.postedAt))
    .limit(VIDEO_NUMBERS_PER_READ)
  const reading = await youtubeHealth(target, { videoUrls: videos.map((video) => video.postUrl) })
  if (reading.banScreen) {
    await stopForBanPage(account, reading.banScreen, db, now)
    return
  }
  await db
    .update(promoAccounts)
    .set({
      ...(reading.handle ? { handle: reading.handle } : {}),
      ...(reading.subscribers !== null ? { followers: reading.subscribers } : {}),
      ...(reading.videos !== null ? { postCount: reading.videos } : {}),
      appHealthReadAt: now,
      updatedAt: now,
    })
    .where(eq(promoAccounts.id, account.id))
  const byUrl = new Map(videos.map((video) => [video.postUrl, video.id]))
  for (const numbers of reading.numbers) {
    const id = byUrl.get(numbers.url)
    if (!id) continue
    await db
      .update(promoYoutubePosts)
      .set({ views: numbers.views, likes: numbers.likes, comments: numbers.comments, numbersReadAt: now })
      .where(eq(promoYoutubePosts.id, id))
  }
  if (reading.comments.length) {
    await storeInboxReading(userId, account, { conversations: [], comments: reading.comments }, db, now)
  }
}

/**
 * Writes who a YouTube channel is signed in as, from one look. A look that
 * was not taken on a YouTube page changes nothing. A strike, terminated or
 * "verify it's you" page stops the channel at once (part 2) through the same
 * stop every browser network uses, and the stop stays until a person lets the
 * channel run again, whatever a later look says.
 */
export async function saveYoutubeSignIn(
  account: { id: string; userId: string; handle: string },
  state: YoutubeState,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<string | null> {
  if (!state.checked) return null
  if (state.banScreen) await stopForBanPage(account, state.banScreen, db, now)
  await db
    .update(promoAccounts)
    .set({
      handle: state.handle ?? "",
      blocked: sql`CASE WHEN ${promoAccounts.banScreenAt} IS NULL THEN ${state.blocked} ELSE true END`,
      blockedReason: sql`CASE WHEN ${promoAccounts.banScreenAt} IS NULL THEN ${state.blocked ? state.reason : ""} ELSE ${promoAccounts.blockedReason} END`,
      stateReadAt: now,
      signedInAt: state.handle ? sql`coalesce(${promoAccounts.signedInAt}, ${now.toISOString()}::timestamptz)` : null,
    })
    .where(eq(promoAccounts.id, account.id))
  return !account.handle && state.handle ? state.handle : null
}

/** The channels whose daily reading is due: signed in, in use, not stopped. Read by the upkeep. */
export const READABLE_CHANNEL = and(
  eq(promoAccounts.platform, "youtube"),
  ne(promoAccounts.handle, ""),
  sql`${promoAccounts.retiredAt} IS NULL`,
  sql`${promoAccounts.banScreenAt} IS NULL`,
  sql`(${promoAccounts.profileId} IS NOT NULL OR ${promoAccounts.phoneId} IS NOT NULL)`,
  isNotNull(promoAccounts.userId)
)
