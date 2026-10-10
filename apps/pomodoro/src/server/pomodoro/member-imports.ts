import { and, desc, eq, gte, isNull, lt, or, sql } from "drizzle-orm"

import { db } from "@/server/db"
import { cleanTags } from "@/server/pomodoro/admin-catalog"
import { loadAppSettings } from "@/server/pomodoro/app-settings"
import {
  assertCanUpload,
  deletePomodoroUpload,
  detectUploadType,
  storePomodoroUpload,
  validatePomodoroUpload,
} from "@/server/pomodoro/media-uploads"
import {
  downloadPixabayFile,
  fetchPixabayImage,
  fetchPixabayVideo,
  pickPixabayRendition,
  PixabayKeyRefusedError,
  PixabayNotFoundError,
  PixabayRateLimitedError,
} from "@/server/pomodoro/pixabay"
import { readPixabayKey } from "@/server/pomodoro/pixabay-key"
import {
  pomodoroMediaUploads,
  pomodoroMemberImports,
  type PomodoroMemberImport,
} from "@/server/pomodoro/schema"
import { checkStorageWarning } from "@/server/pomodoro/storage-warning"
import { formatBytes, uploadLimitBytes } from "@/lib/pomodoro/media-limits"
import {
  MEMBER_IMPORT_MAX_LINKS,
  readMemberPixabayLink,
} from "@/lib/pomodoro/member-imports"

/**
 * "From a Pixabay link" in the upload window (task 06, part 8). A member
 * pastes Pixabay picture or film links; each becomes a row here, the
 * `pomodoro-pixabay-imports` worker fetches it with the site's Pixabay key,
 * and the file becomes the member's own upload, counted against their space
 * and credited to the Pixabay author. See "From a Pixabay link" in
 * `workspace/docs/own-media-uploads.md`.
 */

/** Longer than the slowest film: 100 MB on a slow line, then the bucket. */
const CLAIM_TIMEOUT_MS = 12 * 60 * 1000
const MAX_ATTEMPTS = 3
/** The daily limit counts the last 24 hours. */
const DAY_MS = 24 * 60 * 60 * 1000

export type MemberImportResult = {
  added: number
  refused: { line: number; reason: string }[]
}

/**
 * Queue a member's pasted links. Pro only, like uploading, and refused
 * outright when their space is already full or the site has no Pixabay key.
 * Each refused link says why, by its line; a link past the daily limit is
 * one of those.
 */
export async function requestMemberImports(
  userId: string,
  links: readonly string[]
): Promise<MemberImportResult> {
  // Pro and not already full. The real size is checked again once the file
  // has arrived, against the space left then.
  await assertCanUpload(userId, 0)
  if (!(await readPixabayKey().catch(() => null)))
    throw new Error("PIXABAY_IMPORTS_OFF")

  const settings = await loadAppSettings()
  const limit = settings["uploads.pixabayDailyLimit"]

  const refused: MemberImportResult["refused"] = []
  const wanted: { line: number; id: string; family: "image" | "video"; pageUrl: string; name: string }[] = []
  const seen = new Set<string>()
  links.slice(0, MEMBER_IMPORT_MAX_LINKS).forEach((raw, index) => {
    const line = index + 1
    const link = readMemberPixabayLink(raw)
    if (!link.ok) {
      refused.push({ line, reason: link.reason })
      return
    }
    const key = `${link.family}:${link.id}`
    if (seen.has(key)) {
      refused.push({ line, reason: "is the same item as a line above" })
      return
    }
    seen.add(key)
    wanted.push({ line, ...link })
  })

  const added = await db.transaction(async (tx) => {
    // One member's imports at a time, so two tabs pasting at once cannot
    // both read "9 today" and both go over the limit.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`pomodoro-import:${userId}`}))`)
    const [{ today }] = await tx
      .select({ today: sql<number>`count(*)::int` })
      .from(pomodoroMemberImports)
      .where(
        and(
          eq(pomodoroMemberImports.userId, userId),
          gte(pomodoroMemberImports.createdAt, new Date(Date.now() - DAY_MS))
        )
      )
    const room = Math.max(0, limit - today)
    const accepted = wanted.slice(0, room)
    for (const over of wanted.slice(room))
      refused.push({ line: over.line, reason: `is over today's limit of ${limit}` })
    if (accepted.length)
      await tx.insert(pomodoroMemberImports).values(
        accepted.map((link) => ({
          userId,
          url: link.pageUrl,
          family: link.family,
          pixabayId: link.id,
          name: link.name.slice(0, 80),
        }))
      )
    return accepted.length
  })

  refused.sort((a, b) => a.line - b.line)
  return { added, refused }
}

export type MemberImportRow = {
  id: string
  name: string
  url: string
  status: string
  failureReason: string | null
  createdAt: Date
}

/** The member's own recent imports, newest first, for the window's list. */
export async function listMemberImports(userId: string): Promise<MemberImportRow[]> {
  return db
    .select({
      id: pomodoroMemberImports.id,
      name: pomodoroMemberImports.name,
      url: pomodoroMemberImports.url,
      status: pomodoroMemberImports.status,
      failureReason: pomodoroMemberImports.failureReason,
      createdAt: pomodoroMemberImports.createdAt,
    })
    .from(pomodoroMemberImports)
    .where(eq(pomodoroMemberImports.userId, userId))
    .orderBy(desc(pomodoroMemberImports.createdAt))
    .limit(MEMBER_IMPORT_MAX_LINKS)
}

/**
 * Take the oldest waiting import, in one statement, the same way the other
 * workers claim: the claim is the update, so two passes never get one row,
 * and a claim older than the timeout is fair game again.
 */
export async function claimNextMemberImport(): Promise<PomodoroMemberImport | null> {
  const staleBefore = new Date(Date.now() - CLAIM_TIMEOUT_MS)
  const [claimed] = await db
    .update(pomodoroMemberImports)
    .set({
      status: "running",
      claimedAt: new Date(),
      attempts: sql`${pomodoroMemberImports.attempts} + 1`,
      updatedAt: new Date(),
    })
    .where(
      eq(
        pomodoroMemberImports.id,
        sql`(
          select ${pomodoroMemberImports.id} from ${pomodoroMemberImports}
          where ${or(
            eq(pomodoroMemberImports.status, "queued"),
            and(
              eq(pomodoroMemberImports.status, "running"),
              lt(pomodoroMemberImports.claimedAt, staleBefore)
            )
          )}
          order by ${pomodoroMemberImports.createdAt}
          limit 1
          for update skip locked
        )`
      )
    )
    .returning()
  return claimed ?? null
}

/** Something about this item that trying again will not change. */
class ImportRefusal extends Error {}

/**
 * One member import per pass of the Pixabay worker. A throttled minute puts
 * the row back without using up a try; anything else gets three tries before
 * the row says why it failed. Returns whether a row was looked at.
 */
export async function processNextMemberImport() {
  const job = await claimNextMemberImport()
  if (!job) return false
  try {
    await importOne(job)
  } catch (error) {
    if (error instanceof PixabayRateLimitedError) {
      await settle(job, { status: "queued", attempts: Math.max(0, job.attempts - 1) })
    } else if (error instanceof ImportRefusal) {
      await settle(job, { status: "failed", failureReason: error.message })
    } else if (job.attempts >= MAX_ATTEMPTS) {
      await settle(job, { status: "failed", failureReason: memberReason(error) })
    } else {
      // Only the message: a fetch error can carry the address, and the key
      // is in it.
      console.error(
        "member pixabay import failed",
        job.id,
        error instanceof Error ? error.message : "unknown error"
      )
      await settle(job, { status: "queued" })
    }
  }
  return true
}

async function importOne(job: PomodoroMemberImport) {
  const key = await readPixabayKey().catch(() => null)
  if (!key) throw new ImportRefusal("Importing from Pixabay is not switched on right now.")

  let bytes: Uint8Array
  let credit: { user: string; pageURL: string; tags: string }
  try {
    if (job.family === "video") {
      const video = await fetchPixabayVideo(key, job.pixabayId)
      const limitBytes = uploadLimitBytes("video")
      const rendition = pickPixabayRendition(video, limitBytes)
      if (!rendition)
        throw new ImportRefusal(
          `Pixabay's film is over ${formatBytes(limitBytes)} in every size it offers.`
        )
      bytes = await downloadPixabayFile(rendition.url, limitBytes)
      credit = video
    } else {
      const image = await fetchPixabayImage(key, job.pixabayId)
      bytes = await downloadPixabayFile(image.largeImageURL, uploadLimitBytes("image"))
      credit = image
    }
  } catch (error) {
    if (error instanceof PixabayNotFoundError)
      throw new ImportRefusal("Pixabay has no item at that link.")
    if (error instanceof PixabayKeyRefusedError)
      throw new ImportRefusal("Importing from Pixabay is not working right now.")
    if (error instanceof Error && error.message === "FILE_TOO_LARGE")
      throw new ImportRefusal("That file is bigger than an upload may be.")
    throw error
  }

  const detected = detectUploadType(bytes)
  if (!detected) throw new ImportRefusal("Pixabay sent a file that is not a picture or a film.")
  try {
    validatePomodoroUpload({
      bytes,
      mimeType: detected.mimeType,
      fileSize: bytes.byteLength,
      purpose: "background",
    })
    // The space left now, against the file that actually arrived. A made-up
    // account's file is the admin's, so neither Pro nor space applies.
    if (!job.madeUpShare) await assertCanUpload(job.userId, bytes.byteLength)
  } catch (error) {
    throw new ImportRefusal(
      error instanceof Error && error.message === "STORAGE_QUOTA_EXCEEDED"
        ? "Your space is full. Delete something, then import it again."
        : error instanceof Error && error.message === "PRO_REQUIRED"
          ? "Importing is a Pro perk."
          : "Pixabay sent a file that cannot be used as a background."
    )
  }

  const stored = await storePomodoroUpload({
    userId: job.userId,
    purpose: "background",
    file: { name: `${job.name}.${detected.extension}` },
    bytes,
    detected,
    labels: {
      name: job.name,
      tags: cleanTags(credit.tags.split(",")),
      shared: false,
      trim: null,
    },
  })

  // Only the pass that still holds this job may finish it. A pass that ran
  // past the claim timeout finds the job taken over and removes its copy, so
  // a slow film is never stored twice (audit, 10 Oct 2026).
  const finished = await db.transaction(async (tx) => {
    const [mine] = await tx
      .update(pomodoroMemberImports)
      .set({
        status: "ready",
        mediaId: stored.mediaId,
        failureReason: null,
        claimedAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(pomodoroMemberImports.id, job.id),
          eq(pomodoroMemberImports.status, "running"),
          job.claimedAt
            ? eq(pomodoroMemberImports.claimedAt, job.claimedAt)
            : isNull(pomodoroMemberImports.claimedAt)
        )
      )
      .returning({ id: pomodoroMemberImports.id })
    if (!mine) return false
    // The credit follows the file wherever it is shown or shared.
    await tx
      .update(pomodoroMediaUploads)
      .set({
        sourceAuthor: credit.user.slice(0, 160) || null,
        sourcePageUrl: (credit.pageURL || job.url).slice(0, 500),
        // A made-up member's file goes out at once: Pixabay files are free
        // to use and the admin chose it (task 05, part 9).
        ...(job.madeUpShare ? madeUpShareColumns(new Date()) : {}),
      })
      .where(eq(pomodoroMediaUploads.mediaId, stored.mediaId))
    return true
  })
  if (!finished) {
    await deletePomodoroUpload(job.userId, stored.mediaId).catch(() => undefined)
    return
  }
  await checkStorageWarning(job.userId)
}

function memberReason(error: unknown) {
  return error instanceof Error && error.message === "PIXABAY_DOWNLOAD_FAILED"
    ? "Pixabay's file could not be fetched."
    : "That import did not work. Try the link again later."
}

async function settle(
  job: PomodoroMemberImport,
  change: { status: "queued" | "failed"; failureReason?: string; attempts?: number }
) {
  await db
    .update(pomodoroMemberImports)
    .set({
      status: change.status,
      failureReason: change.failureReason?.slice(0, 200) ?? null,
      ...(change.attempts !== undefined ? { attempts: change.attempts } : {}),
      claimedAt: null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(pomodoroMemberImports.id, job.id),
        eq(pomodoroMemberImports.status, "running")
      )
    )
}

/** The share columns a made-up member's imported file is stored with. */
function madeUpShareColumns(now: Date) {
  return {
    shared: true,
    sharedAt: now,
    shareConfirmedAt: now,
    shareWaitingSince: null,
  }
}
