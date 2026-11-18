import { and, asc, count, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm"

import {
  LINK_IMPORT_ALREADY_HERE,
  LINK_IMPORT_BAD_LINK,
  LINK_IMPORT_NONE,
  LINK_IMPORT_NOT_FOUND,
  LINK_IMPORT_PER_PASTE,
  LINK_IMPORT_PLATFORM_NAMES,
  LINK_IMPORT_TOO_BIG,
  LINK_IMPORT_TOO_MANY,
  splitPastedLinks,
  type LinkImportItem,
  type LinkImportSource,
  type LinkImportStartResult,
} from "@/lib/video/link-imports"
import type { SavedVideoPlatform } from "@/lib/video/saved-video"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import {
  discardGeneratedAsset,
  saveGeneratedAsset,
} from "@/server/video/asset-factories/media"
import { requireOwnedCollection } from "@/server/video/media-collections"
import { getOwnedProject } from "@/server/video/projects"
import {
  videoLinkImports,
  videoMediaCollectionItems,
  videoProjectMedia,
  type VideoLinkImportRow,
} from "@/server/video/schema"
import {
  downloadViralVideo,
  parseVideoLink,
  YT_DLP_MISSING_MESSAGE,
} from "@/server/video/viral/download"

/**
 * Import from a link (`workspace/docs/import-from-a-link.md`).
 *
 * A pasted TikTok, Instagram or YouTube link becomes a `waiting` row. The
 * background worker downloads it with yt-dlp, stores the file in the media
 * library as the person's own upload, puts it on the project's shelf and in
 * the collection picked, and marks the row `done`. Closing the tab does
 * nothing to it, and a restart puts an interrupted row back to `waiting`.
 *
 * `parseVideoLink` is the guard that keeps every other address away from
 * yt-dlp. It runs when the link is pasted and again inside the download.
 */

/** Downloads one person may have running at once. The rest wait their turn. */
export const LINK_IMPORT_PER_PERSON = 5

/**
 * Downloads running on the server at once, for everybody. Each one holds a
 * file of up to 100MB in memory and on disk while it is stored.
 */
export const LINK_IMPORT_RUNNING = 4

/**
 * How long one claim lasts. yt-dlp gives up after 3 minutes and storing the
 * file takes seconds, so a claim still held after 10 minutes belongs to a
 * worker that went away.
 */
const JOB_LEASE_MS = 10 * 60 * 1000

// ---------------------------------------------------------------------------
// What the Media panel asks for.

/**
 * Starts one download per good line of a paste. A line that is not a video
 * link, or a video already in this project, is left out and named with the
 * reason; the good lines still start.
 */
export async function startLinkImports(
  userId: string,
  projectId: string,
  text: string,
  collectionId: string | null
): Promise<LinkImportStartResult> {
  const links = splitPastedLinks(text)
  if (!links.length) throw new Error(LINK_IMPORT_NONE)
  if (links.length > LINK_IMPORT_PER_PASTE) throw new Error(LINK_IMPORT_TOO_MANY)
  await getOwnedProject(userId, projectId)
  if (collectionId) await requireOwnedCollection(userId, collectionId, db)

  const result: LinkImportStartResult = { started: 0, skipped: [] }
  // Two lines can be two addresses for one video (a youtu.be link and a
  // /shorts/ link), which the set of lines above cannot see.
  const seen = new Set<string>()
  for (const link of links) {
    let parsed: { platform: SavedVideoPlatform; platformVideoId: string }
    try {
      parsed = parseVideoLink(link)
    } catch {
      result.skipped.push({ link, reason: LINK_IMPORT_BAD_LINK })
      continue
    }
    const key = `${parsed.platform}:${parsed.platformVideoId}`
    if (seen.has(key)) {
      result.skipped.push({ link, reason: LINK_IMPORT_ALREADY_HERE })
      continue
    }
    seen.add(key)
    if (await queueOne(userId, projectId, link, parsed, collectionId)) {
      result.started += 1
    } else {
      result.skipped.push({ link, reason: LINK_IMPORT_ALREADY_HERE })
    }
  }
  return result
}

/**
 * Puts one video in the queue, or says it is already here. A failed import
 * of the same video is started again rather than refused, and a finished one
 * whose file was taken off this project's shelf goes back on it without a
 * second download. False means the video is already in the project.
 */
async function queueOne(
  userId: string,
  projectId: string,
  link: string,
  parsed: { platform: SavedVideoPlatform; platformVideoId: string },
  collectionId: string | null
): Promise<boolean> {
  const at = now()
  const [inserted] = await db
    .insert(videoLinkImports)
    .values({
      id: uuid(),
      userId,
      projectId,
      sourceUrl: link,
      platform: parsed.platform,
      platformVideoId: parsed.platformVideoId,
      collectionId,
      status: "waiting",
      createdAt: at,
      updatedAt: at,
    })
    .onConflictDoNothing()
    .returning({ id: videoLinkImports.id })
  if (inserted) return true

  const [existing] = await db
    .select()
    .from(videoLinkImports)
    .where(
      and(
        eq(videoLinkImports.projectId, projectId),
        eq(videoLinkImports.platform, parsed.platform),
        eq(videoLinkImports.platformVideoId, parsed.platformVideoId)
      )
    )
    .limit(1)
  if (!existing) return false

  if (existing.status === "failed") {
    await db
      .update(videoLinkImports)
      .set({
        status: "waiting",
        error: null,
        sourceUrl: link,
        collectionId,
        leaseToken: null,
        leaseExpiresAt: null,
        createdAt: at,
        updatedAt: at,
      })
      .where(and(eq(videoLinkImports.id, existing.id), eq(videoLinkImports.status, "failed")))
    return true
  }

  if (existing.status === "done" && existing.mediaId) {
    const putBack = await db
      .insert(videoProjectMedia)
      .values({ projectId, mediaId: existing.mediaId, createdAt: at })
      .onConflictDoNothing()
      .returning({ mediaId: videoProjectMedia.mediaId })
    if (putBack.length) {
      if (collectionId) await addToCollection(collectionId, existing.mediaId)
      return true
    }
  }
  return false
}

/** The imports on this project still on their way, and the ones that failed, newest first. */
export async function listLinkImports(
  userId: string,
  projectId: string
): Promise<LinkImportItem[]> {
  await getOwnedProject(userId, projectId)
  const rows = await db
    .select()
    .from(videoLinkImports)
    .where(
      and(
        eq(videoLinkImports.userId, userId),
        eq(videoLinkImports.projectId, projectId),
        ne(videoLinkImports.status, "done")
      )
    )
    .orderBy(sql`${videoLinkImports.createdAt} desc`)
  return rows.map((row) => ({
    id: row.id,
    status: row.status as LinkImportItem["status"],
    error: row.error,
    platform: row.platform as SavedVideoPlatform,
    title: row.title,
    source_url: row.sourceUrl,
  }))
}

/** Try again on a failed tile: back in the queue with its reason cleared. */
export async function retryLinkImport(userId: string, id: string) {
  const [row] = await db
    .update(videoLinkImports)
    .set({
      status: "waiting",
      error: null,
      leaseToken: null,
      leaseExpiresAt: null,
      updatedAt: now(),
    })
    .where(
      and(
        eq(videoLinkImports.id, id),
        eq(videoLinkImports.userId, userId),
        eq(videoLinkImports.status, "failed")
      )
    )
    .returning({ id: videoLinkImports.id })
  if (!row) throw new Error(LINK_IMPORT_NOT_FOUND)
}

/**
 * Remove on a tile: the row goes. A download already running finds its row
 * gone when it finishes and throws its file away (`runLinkImport`). A
 * finished import is its file, which is deleted from the file's own menu.
 */
export async function removeLinkImport(userId: string, id: string) {
  const removed = await db
    .delete(videoLinkImports)
    .where(
      and(
        eq(videoLinkImports.id, id),
        eq(videoLinkImports.userId, userId),
        ne(videoLinkImports.status, "done")
      )
    )
    .returning({ id: videoLinkImports.id })
  if (!removed.length) throw new Error(LINK_IMPORT_NOT_FOUND)
}

/** Where each imported file came from, for the files given. */
export async function linkSourcesByMedia(
  mediaIds: string[],
  database: CustomShellDb = db
): Promise<Map<string, LinkImportSource>> {
  if (!mediaIds.length) return new Map()
  const rows = await database
    .select({
      mediaId: videoLinkImports.mediaId,
      url: videoLinkImports.sourceUrl,
      handle: videoLinkImports.handle,
    })
    .from(videoLinkImports)
    .where(inArray(videoLinkImports.mediaId, mediaIds))
  return new Map(
    rows.flatMap((row) =>
      row.mediaId ? [[row.mediaId, { url: row.url, handle: row.handle }]] : []
    )
  )
}

// ---------------------------------------------------------------------------
// The worker.

type ClaimedImport = VideoLinkImportRow & { leaseToken: string }

/**
 * One pass: put back the rows a restart left mid-download, claim what may
 * start now, and set each one going. The pass does not wait for them, so a
 * three-minute download never holds up the app's other background work; the
 * claim is what stops the next pass taking the same row.
 */
export async function linkImportTick(): Promise<void> {
  await releaseAbandoned()
  const claimed = await claimLinkImports()
  for (const job of claimed) {
    void runLinkImport(job).catch((error) =>
      console.error("Link import failed to finish", job.id, error)
    )
  }
}

async function releaseAbandoned(): Promise<void> {
  const at = now()
  await db
    .update(videoLinkImports)
    .set({ status: "waiting", leaseToken: null, leaseExpiresAt: null, updatedAt: at })
    .where(
      and(
        eq(videoLinkImports.status, "downloading"),
        or(isNull(videoLinkImports.leaseExpiresAt), lt(videoLinkImports.leaseExpiresAt, at))
      )
    )
}

/**
 * Claims waiting rows, oldest first, while the server is under
 * `LINK_IMPORT_RUNNING` and each person under `LINK_IMPORT_PER_PERSON`.
 */
export async function claimLinkImports(): Promise<ClaimedImport[]> {
  const [{ running }] = await db
    .select({ running: count() })
    .from(videoLinkImports)
    .where(eq(videoLinkImports.status, "downloading"))
  const claimed: ClaimedImport[] = []
  for (let slot = running; slot < LINK_IMPORT_RUNNING; slot += 1) {
    const [waiting] = await db
      .select({ id: videoLinkImports.id })
      .from(videoLinkImports)
      .where(
        and(
          eq(videoLinkImports.status, "waiting"),
          sql`(select count(*) from video_link_imports busy where busy.user_id = ${videoLinkImports.userId} and busy.status = 'downloading') < ${LINK_IMPORT_PER_PERSON}`
        )
      )
      .orderBy(asc(videoLinkImports.createdAt))
      .limit(1)
    if (!waiting) break
    const leaseToken = uuid()
    const at = now()
    const [row] = await db
      .update(videoLinkImports)
      .set({
        status: "downloading",
        leaseToken,
        leaseExpiresAt: new Date(at.getTime() + JOB_LEASE_MS),
        updatedAt: at,
      })
      // Only one pass can win this, so two workers never fetch one video twice.
      .where(and(eq(videoLinkImports.id, waiting.id), eq(videoLinkImports.status, "waiting")))
      .returning()
    if (row) claimed.push({ ...row, leaseToken })
  }
  return claimed
}

/** Downloads one claimed row and puts the file on its project's shelf. */
export async function runLinkImport(job: ClaimedImport): Promise<void> {
  try {
    const downloaded = await downloadViralVideo(job.sourceUrl)

    // A short TikTok link only says which video it is once downloaded. When
    // that video is already in the project, this row is the second copy.
    const realId = downloaded.platformVideoId
    const renamed = realId !== null && realId !== job.platformVideoId
    if (renamed) {
      const [twin] = await db
        .select({ id: videoLinkImports.id })
        .from(videoLinkImports)
        .where(
          and(
            eq(videoLinkImports.projectId, job.projectId),
            eq(videoLinkImports.platform, job.platform),
            eq(videoLinkImports.platformVideoId, realId)
          )
        )
        .limit(1)
      if (twin) throw new Error(LINK_IMPORT_ALREADY_HERE)
    }

    const handle = downloaded.channelName
      ? `@${downloaded.channelName.replace(/^@/, "").slice(0, 98)}`
      : null
    const asset = await saveGeneratedAsset({
      userId: job.userId,
      bytes: downloaded.bytes,
      mimeType: downloaded.mimeType,
      fileType: "video",
      name: importedFileName(job.platform as SavedVideoPlatform, downloaded.title, job.createdAt),
    })

    const landed = await db.transaction(async (tx) => {
      const at = now()
      const [moved] = await tx
        .update(videoLinkImports)
        .set({
          status: "done",
          mediaId: asset.id,
          title: downloaded.title,
          handle,
          ...(renamed ? { platformVideoId: realId } : {}),
          error: null,
          leaseToken: null,
          leaseExpiresAt: null,
          updatedAt: at,
        })
        .where(and(eq(videoLinkImports.id, job.id), eq(videoLinkImports.leaseToken, job.leaseToken)))
        .returning({ collectionId: videoLinkImports.collectionId })
      if (!moved) return false
      await tx
        .insert(videoProjectMedia)
        .values({ projectId: job.projectId, mediaId: asset.id, createdAt: at })
        .onConflictDoNothing()
      if (moved.collectionId) {
        await tx
          .insert(videoMediaCollectionItems)
          .values({ collectionId: moved.collectionId, mediaId: asset.id, createdAt: at })
          .onConflictDoNothing()
      }
      return true
    })
    // Removed while it downloaded, or another worker took it over: the file
    // just stored belongs to nothing, so it goes rather than sitting in the
    // library unasked for.
    if (!landed) await discardGeneratedAsset(asset)
  } catch (error) {
    await db
      .update(videoLinkImports)
      .set({
        status: "failed",
        error: importErrorMessage(error),
        leaseToken: null,
        leaseExpiresAt: null,
        updatedAt: now(),
      })
      .where(and(eq(videoLinkImports.id, job.id), eq(videoLinkImports.leaseToken, job.leaseToken)))
  }
}

async function addToCollection(collectionId: string, mediaId: string) {
  await db
    .insert(videoMediaCollectionItems)
    .values({ collectionId, mediaId, createdAt: now() })
    .onConflictDoNothing()
}

/**
 * The post's title as the file's name: hashtags, apostrophes and anything
 * the library would not keep taken out, and cut to 80 characters. With no title, or one that is
 * only hashtags, the platform and the day it was pasted, "TikTok 18 Nov".
 */
export function importedFileName(
  platform: SavedVideoPlatform,
  title: string | null,
  pastedAt: Date
): string {
  const cleaned = (title ?? "")
    .replace(/#[^\s#]+/g, " ")
    .replace(/['’]/g, "")
    .replace(/[^a-zA-Z0-9 ._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80)
    .trim()
  if (cleaned) return cleaned
  const day = pastedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
  return `${LINK_IMPORT_PLATFORM_NAMES[platform]} ${day}`
}

/** What a failed tile says, in plain words rather than yt-dlp's. */
export function importErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : ""
  if (message === LINK_IMPORT_ALREADY_HERE) return message
  if (message === YT_DLP_MISSING_MESSAGE) {
    return "The download tool is not installed on this server."
  }
  if (/larger than|too large|file is too big|exceeds/i.test(message)) return LINK_IMPORT_TOO_BIG
  if (/private/i.test(message)) return "This post is private."
  if (/login|log in|sign in|rate.?limit|cookies/i.test(message)) {
    return "The platform wants a sign-in before it hands this post over. Try again later."
  }
  if (/not available|unavailable|removed|deleted|does not exist|404/i.test(message)) {
    return "This post is gone or can't be watched."
  }
  if (/no video|there is no video|unsupported url/i.test(message)) {
    return "This post has no video in it."
  }
  if (/format the library cannot hold|came back empty/i.test(message)) return message
  return "The video could not be downloaded. Try again in a minute."
}
