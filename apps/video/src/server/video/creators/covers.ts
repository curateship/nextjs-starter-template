import { and, desc, eq, inArray, isNull, lt, or } from "drizzle-orm"

import { now } from "@/server/auth/security"
import { db } from "@/server/db"
import { getPublicMediaUrl } from "@/server/media/storage"
import { videoCreatorPosts } from "@/server/video/schema"
import { storePicture } from "@/server/video/creators/creators"
import { runYtDlp } from "@/server/video/viral/download"

/**
 * Keeping a copy of each followed creator's video covers.
 *
 * TikTok and Instagram hand out cover addresses that stop working after a set
 * date: one saved on 2 Oct 2026 stopped on 15 Oct, and the card went blank.
 * This keeps the picture itself, which needs no video download and no AI:
 * first from the address already saved, and when that has expired, from a
 * fresh address yt-dlp reads off the post's page without downloading it
 * (measured 17 Oct 2026: 2 seconds, one 151 KB picture).
 *
 * YouTube covers never expire, so YouTube posts are left alone.
 */

/** How many covers one pass of the worker keeps. */
const COVERS_PER_TICK = 5

/** A cover that could not be had is tried again after this long. */
const RETRY_AFTER_MS = 24 * 60 * 60 * 1000

export async function creatorCoverTick(): Promise<number> {
  const at = now()
  const due = await db
    .select()
    .from(videoCreatorPosts)
    .where(
      and(
        inArray(videoCreatorPosts.platform, ["tiktok", "instagram"]),
        isNull(videoCreatorPosts.thumbnailStoragePath),
        or(
          isNull(videoCreatorPosts.coverCheckedAt),
          lt(videoCreatorPosts.coverCheckedAt, new Date(at.getTime() - RETRY_AFTER_MS))
        )
      )
    )
    .orderBy(desc(videoCreatorPosts.firstSeenAt))
    .limit(COVERS_PER_TICK)
  if (!due.length) return 0

  // Marked first, so a pass that dies halfway does not retry the same posts
  // on every tick.
  await db
    .update(videoCreatorPosts)
    .set({ coverCheckedAt: at })
    .where(inArray(videoCreatorPosts.id, due.map((post) => post.id)))

  let kept = 0
  for (const post of due) {
    if (await keepCover(post)) kept += 1
  }
  return kept
}

async function keepCover(post: typeof videoCreatorPosts.$inferSelect) {
  const storagePath = `video-creator-covers/${post.ownerId}/${post.id}.img`
  let stored = post.thumbnailUrl
    ? await storePicture(post.thumbnailUrl, storagePath)
    : null
  let freshUrl: string | null = null
  if (!stored) {
    freshUrl = await freshCoverAddress(post.url)
    stored = freshUrl ? await storePicture(freshUrl, storagePath) : null
  }
  if (!stored) return false
  await db
    .update(videoCreatorPosts)
    .set({
      thumbnailStoragePath: stored,
      ...(freshUrl ? { thumbnailUrl: freshUrl } : {}),
    })
    .where(eq(videoCreatorPosts.id, post.id))
  return true
}

/**
 * The post's cover address as its page gives it today. yt-dlp only reads the
 * page; `--skip-download` keeps the video where it is.
 */
async function freshCoverAddress(postUrl: string): Promise<string | null> {
  try {
    const printed = await runYtDlp([
      "--impersonate",
      "chrome",
      "--skip-download",
      "--no-warnings",
      "--print",
      "thumbnail",
      postUrl,
    ])
    const address = printed.trim().split("\n").at(-1) ?? ""
    return address.startsWith("https://") ? address : null
  } catch (error) {
    console.error("A cover address could not be read", error)
    return null
  }
}

/**
 * The address a card shows: the app's own copy when it has one, else the
 * platform's, which may have expired.
 */
export async function coverUrl(post: {
  thumbnailStoragePath: string | null
  thumbnailUrl: string | null
}): Promise<string | null> {
  return post.thumbnailStoragePath
    ? getPublicMediaUrl(post.thumbnailStoragePath)
    : post.thumbnailUrl
}
