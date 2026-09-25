import { and, asc, eq, lt, or, sql } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { now, uuid } from "@/server/auth/security"
import {
  cleanOriginalName,
  loadAccountStorage,
  storedFilename,
} from "@/server/media/library"
import {
  deleteFromR2,
  getPublicMediaUrl,
  uploadToR2,
} from "@/server/media/storage"
import { loadPomodoroEntitlements } from "@/server/pomodoro/entitlements"
import {
  pomodoroMediaUploads,
  userPreferences,
  type PomodoroMediaUpload,
} from "@/server/pomodoro/schema"
import { customShellMedia } from "@/server/schema"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"
import {
  POMODORO_UPLOAD_TYPES,
  uploadLimitBytes,
  type PomodoroUploadKind,
  type PomodoroUploadPurpose,
} from "@/lib/pomodoro/media-limits"

/**
 * A Pro member's own backgrounds and sound loops.
 *
 * The file goes where every other file in this app goes: the shell's media
 * library row and its R2 bucket. This module owns the parts the shell has no
 * opinion about — the pomodoro size limits, the "is this really a PNG" check,
 * the per-person cap, and the queue the worker re-encodes from.
 *
 * Limits and the byte sniffing are ported from the old app
 * (`apps/pomoder/src/server/pomoder-media.ts`) so a file it accepted is still
 * accepted and one it refused is still refused.
 */

/** A worker pass that dies leaves a claim behind; this is when to retry it. */
const CLAIM_TIMEOUT_MS = 5 * 60 * 1000

/** How many times a re-encode is tried before the upload is called failed. */
const MAX_ATTEMPTS = 3

export type UploadRefusal =
  | "PRO_REQUIRED"
  | "FILE_TOO_LARGE"
  | "INVALID_FILE_CONTENT"
  | "WRONG_KIND_FOR_PURPOSE"
  | "STORAGE_QUOTA_EXCEEDED"
  | "CONTENT_LENGTH_REQUIRED"

/**
 * What the first bytes say this file really is.
 *
 * The browser's `file.type` is whatever the operating system guessed from the
 * extension, so it is a claim and not evidence. A file is accepted only when
 * the bytes and the claim agree, which is what stops an .exe renamed to .png.
 */
export function detectUploadType(bytes: Uint8Array) {
  const starts = (...values: number[]) =>
    values.every((value, index) => bytes[index] === value)
  const text = (start: number, length: number) =>
    String.fromCharCode(...bytes.slice(start, start + length))

  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) {
    return POMODORO_UPLOAD_TYPES.png
  }
  if (starts(0xff, 0xd8, 0xff)) return POMODORO_UPLOAD_TYPES.jpeg
  if (text(0, 4) === "RIFF" && text(8, 4) === "WEBP") {
    return POMODORO_UPLOAD_TYPES.webp
  }
  if (
    text(0, 3) === "ID3" ||
    (bytes[0] === 0xff && [0xfb, 0xf3, 0xf2].includes(bytes[1] ?? -1))
  ) {
    return POMODORO_UPLOAD_TYPES.mp3
  }
  if (text(0, 4) === "RIFF" && text(8, 4) === "WAVE") {
    return POMODORO_UPLOAD_TYPES.wav
  }
  if (text(0, 4) === "OggS") return POMODORO_UPLOAD_TYPES.ogg
  if (text(4, 4) === "ftyp") return POMODORO_UPLOAD_TYPES.mp4
  if (starts(0x1a, 0x45, 0xdf, 0xa3)) return POMODORO_UPLOAD_TYPES.webm
  return null
}

/**
 * The claimed length of an upload request.
 *
 * A chunked request arrives with no length at all, which means the size cannot
 * be refused before the whole body has been read into memory. Those are turned
 * away rather than trusted, exactly as the old app turned them away.
 */
export function validateUploadContentLength(value: string | null) {
  if (value === null) throw new Error("CONTENT_LENGTH_REQUIRED")
  const length = Number(value)
  if (!Number.isSafeInteger(length) || length <= 0) {
    throw new Error("CONTENT_LENGTH_REQUIRED")
  }
  // One megabyte of slack over the largest single file, for the form's own
  // framing. Anything past that is refused before a byte is read.
  if (length > uploadLimitBytes("video") + 1024 * 1024) {
    throw new Error("FILE_TOO_LARGE")
  }
  return length
}

/**
 * The bytes, the claimed type and the purpose all have to agree.
 *
 * Returns what the file really is. Throws one of the refusal codes, which
 * `getPomodoroUploadErrorMessage` turns into a sentence for the member.
 */
export function validatePomodoroUpload({
  bytes,
  mimeType,
  fileSize,
  purpose,
}: {
  bytes: Uint8Array
  mimeType: string
  fileSize: number
  purpose: PomodoroUploadPurpose
}) {
  const detected = detectUploadType(bytes)
  if (!detected || detected.mimeType !== mimeType) {
    throw new Error("INVALID_FILE_CONTENT")
  }
  // A sound loop cannot be a photograph, and a background cannot be an mp3.
  const allowed: PomodoroUploadKind[] =
    purpose === "sound" ? ["audio"] : ["image", "video"]
  if (!allowed.includes(detected.kind))
    throw new Error("WRONG_KIND_FOR_PURPOSE")
  if (fileSize <= 0 || fileSize > uploadLimitBytes(detected.kind)) {
    throw new Error("FILE_TOO_LARGE")
  }
  return detected
}

/**
 * May this person upload this many more bytes?
 *
 * The cap is the whole account's files, not just the pomodoro ones, because
 * every file a member owns sits in one bucket and one library and the number
 * they are shown has to be the number that runs out.
 */
export async function assertCanUpload(userId: string, incomingBytes: number) {
  const entitlements = await loadPomodoroEntitlements(userId)
  if (!entitlements.canUploadMedia) throw new Error("PRO_REQUIRED")
  const storage = await loadAccountStorage(userId)
  if (storage.bytes + incomingBytes > entitlements.storageLimitBytes) {
    throw new Error("STORAGE_QUOTA_EXCEEDED")
  }
  return { used: storage.bytes, limit: entitlements.storageLimitBytes }
}

export type StoredUpload = {
  mediaId: string
  purpose: PomodoroUploadPurpose
  kind: PomodoroUploadKind
  status: string
  name: string
  fileSize: number
  mimeType: string
  failureReason: string | null
  createdAt: Date
  /**
   * Where the browser fetches it. Straight from the bucket, which is how the
   * shell serves every other file it stores. Empty while the re-encode is
   * still running, because the address changes when the file is replaced.
   */
  url: string
}

/**
 * Put the file in the bucket, then write both rows.
 *
 * The bucket first, because a row pointing at a file that was never written is
 * worse than a file no row points at: the second is swept up by the storage
 * page's orphan scan, the first shows the member a broken picture. If either
 * row fails the object is removed again.
 */
export async function storePomodoroUpload({
  userId,
  purpose,
  file,
  bytes,
  detected,
}: {
  userId: string
  purpose: PomodoroUploadPurpose
  file: { name: string; size: number }
  bytes: Uint8Array
  detected: { kind: PomodoroUploadKind; mimeType: string }
}): Promise<StoredUpload> {
  const originalName = cleanOriginalName(file.name)
  const filename = storedFilename(originalName, detected.mimeType)
  const storagePath = `${userId}/${filename}`
  const workspaceId = await workspaceIdForRequest(userId)

  await uploadToR2(storagePath, bytes, detected.mimeType)

  const mediaId = uuid()
  const timestamp = now()
  // An image is finished the moment it lands. Sound and video wait for the
  // worker, so the picker can say "Getting it ready" instead of offering a
  // 100 MB original that would stutter behind the timer.
  const status = detected.kind === "image" ? "ready" : "queued"

  try {
    await db.transaction(async (tx) => {
      await tx.insert(customShellMedia).values({
        id: mediaId,
        workspaceId,
        userId,
        filename,
        originalName,
        altText: null,
        fileSize: bytes.byteLength,
        mimeType: detected.mimeType,
        fileType: detected.kind,
        storagePath,
        emailProtectedAt: null,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      await tx.insert(pomodoroMediaUploads).values({
        mediaId,
        userId,
        purpose,
        kind: detected.kind,
        status,
        originalBytes: bytes.byteLength,
      })
    })
  } catch (error) {
    await deleteFromR2(storagePath).catch(() => undefined)
    throw error
  }

  return {
    mediaId,
    purpose,
    kind: detected.kind,
    status,
    name: originalName,
    fileSize: bytes.byteLength,
    mimeType: detected.mimeType,
    failureReason: null,
    createdAt: new Date(timestamp),
    url: status === "ready" ? await getPublicMediaUrl(storagePath) : "",
  }
}

/** This person's own uploads for one picker, newest first. */
export async function listPomodoroUploads(
  userId: string,
  purpose: PomodoroUploadPurpose
): Promise<StoredUpload[]> {
  const rows = await db
    .select({
      mediaId: pomodoroMediaUploads.mediaId,
      purpose: pomodoroMediaUploads.purpose,
      kind: pomodoroMediaUploads.kind,
      status: pomodoroMediaUploads.status,
      failureReason: pomodoroMediaUploads.failureReason,
      createdAt: pomodoroMediaUploads.createdAt,
      name: customShellMedia.originalName,
      fileSize: customShellMedia.fileSize,
      mimeType: customShellMedia.mimeType,
      storagePath: customShellMedia.storagePath,
    })
    .from(pomodoroMediaUploads)
    .innerJoin(
      customShellMedia,
      eq(customShellMedia.id, pomodoroMediaUploads.mediaId)
    )
    .where(
      and(
        eq(pomodoroMediaUploads.userId, userId),
        eq(pomodoroMediaUploads.purpose, purpose)
      )
    )
    .orderBy(asc(pomodoroMediaUploads.createdAt))

  return Promise.all(
    rows.map(async ({ storagePath, ...row }) => ({
      ...row,
      purpose: row.purpose as PomodoroUploadPurpose,
      kind: row.kind as PomodoroUploadKind,
      // Only a finished upload gets an address: the re-encode replaces the
      // file, so one handed out early would point at a file about to vanish.
      url: row.status === "ready" ? await getPublicMediaUrl(storagePath) : "",
    }))
  )
}

/**
 * The address for one upload the caller already owns, for the two preference
 * loaders. Returns null when the id is not theirs or is not finished, which is
 * what makes a stale preference fall back to the default instead of drawing a
 * broken picture.
 */
export async function resolveUploadUrl(userId: string, mediaId: string) {
  const [row] = await db
    .select({
      storagePath: customShellMedia.storagePath,
      kind: pomodoroMediaUploads.kind,
      status: pomodoroMediaUploads.status,
    })
    .from(pomodoroMediaUploads)
    .innerJoin(
      customShellMedia,
      eq(customShellMedia.id, pomodoroMediaUploads.mediaId)
    )
    .where(
      and(
        eq(pomodoroMediaUploads.mediaId, mediaId),
        eq(pomodoroMediaUploads.userId, userId)
      )
    )
    .limit(1)

  if (!row || row.status !== "ready") return null
  return {
    url: await getPublicMediaUrl(row.storagePath),
    kind: row.kind as PomodoroUploadKind,
  }
}

/**
 * The check every "use this one" needs: the upload is this person's, it is
 * finished, and it is the right kind for where they are putting it.
 *
 * Without this a member could save somebody else's media id as their
 * background. The file itself would still refuse to load, but the preference
 * would have taken a value that is not theirs.
 */
export async function assertUploadUsable(
  userId: string,
  mediaId: string,
  purpose: PomodoroUploadPurpose
) {
  const [row] = await db
    .select({
      kind: pomodoroMediaUploads.kind,
      status: pomodoroMediaUploads.status,
    })
    .from(pomodoroMediaUploads)
    .where(
      and(
        eq(pomodoroMediaUploads.mediaId, mediaId),
        eq(pomodoroMediaUploads.userId, userId),
        eq(pomodoroMediaUploads.purpose, purpose)
      )
    )
    .limit(1)

  if (!row) throw new Error("UPLOAD_NOT_FOUND")
  if (row.status !== "ready") throw new Error("UPLOAD_NOT_READY")
  return row.kind as PomodoroUploadKind
}

/**
 * Remove an upload: the file, both rows, and any preference pointing at it.
 *
 * The preference is cleared in the same transaction as the rows, because a
 * member whose chosen background has just been deleted should come back to the
 * default rather than to a blank screen waiting on a 404.
 */
export async function deletePomodoroUpload(userId: string, mediaId: string) {
  const [row] = await db
    .select({ storagePath: customShellMedia.storagePath })
    .from(pomodoroMediaUploads)
    .innerJoin(
      customShellMedia,
      eq(customShellMedia.id, pomodoroMediaUploads.mediaId)
    )
    .where(
      and(
        eq(pomodoroMediaUploads.mediaId, mediaId),
        eq(pomodoroMediaUploads.userId, userId)
      )
    )
    .limit(1)

  if (!row) throw new Error("UPLOAD_NOT_FOUND")

  const reference = `media:${mediaId}`
  await db.transaction(async (tx) => {
    await tx
      .update(userPreferences)
      .set({ selectedBackground: null, updatedAt: new Date() })
      .where(
        and(
          eq(userPreferences.userId, userId),
          eq(userPreferences.selectedBackground, reference)
        )
      )
    await tx
      .update(userPreferences)
      .set({ selectedSound: null, updatedAt: new Date() })
      .where(
        and(
          eq(userPreferences.userId, userId),
          eq(userPreferences.selectedSound, reference)
        )
      )
    // The library row goes, and the job row follows it through the cascade.
    await tx.delete(customShellMedia).where(eq(customShellMedia.id, mediaId))
  })

  // After the rows, so a bucket that refuses the delete leaves an orphan the
  // storage page can sweep rather than a row pointing at a file that is gone.
  await deleteFromR2(row.storagePath).catch(() => undefined)
}

/**
 * Take the oldest job nobody is working on, in one statement.
 *
 * Two overlapping worker passes are harmless because the claim is the update
 * itself: whichever pass wins the row gets a row back, the other gets nothing.
 * A claim older than the timeout is fair game again, which is what un-sticks a
 * job whose process died holding it.
 */
export async function claimNextUploadJob(
  database: CustomShellDb = db
): Promise<PomodoroMediaUpload | null> {
  const staleBefore = new Date(Date.now() - CLAIM_TIMEOUT_MS)
  const [claimed] = await database
    .update(pomodoroMediaUploads)
    .set({
      status: "processing",
      claimedAt: new Date(),
      attempts: sql`${pomodoroMediaUploads.attempts} + 1`,
      updatedAt: new Date(),
    })
    .where(
      eq(
        pomodoroMediaUploads.mediaId,
        sql`(
          select ${pomodoroMediaUploads.mediaId} from ${pomodoroMediaUploads}
          where ${or(
            eq(pomodoroMediaUploads.status, "queued"),
            and(
              eq(pomodoroMediaUploads.status, "processing"),
              lt(pomodoroMediaUploads.claimedAt, staleBefore)
            )
          )}
          order by ${pomodoroMediaUploads.createdAt}
          limit 1
          for update skip locked
        )`
      )
    )
    .returning()

  return claimed ?? null
}

/** The re-encode worked: point the library row at the new file. */
export async function finishUploadJob({
  mediaId,
  storagePath,
  mimeType,
  fileSize,
  previousStoragePath,
}: {
  mediaId: string
  storagePath: string
  mimeType: string
  fileSize: number
  previousStoragePath: string
}) {
  await db.transaction(async (tx) => {
    await tx
      .update(customShellMedia)
      .set({ storagePath, mimeType, fileSize, updatedAt: now() })
      .where(eq(customShellMedia.id, mediaId))
    await tx
      .update(pomodoroMediaUploads)
      .set({
        status: "ready",
        failureReason: null,
        claimedAt: null,
        updatedAt: new Date(),
      })
      .where(eq(pomodoroMediaUploads.mediaId, mediaId))
  })

  if (previousStoragePath !== storagePath) {
    await deleteFromR2(previousStoragePath).catch(() => undefined)
  }
}

/**
 * The re-encode did not work.
 *
 * The first couple of attempts go back in the queue, because the usual cause is
 * a machine that was busy. After that the upload is called failed and says so
 * in the picker, so a member is never left watching a spinner that will not
 * finish.
 */
export async function failUploadJob(
  job: PomodoroMediaUpload,
  reason: string,
  /** `retry: false` for a failure no amount of trying again can fix. */
  { retry = true }: { retry?: boolean } = {}
) {
  const giveUp = !retry || job.attempts >= MAX_ATTEMPTS
  await db
    .update(pomodoroMediaUploads)
    .set({
      status: giveUp ? "failed" : "queued",
      failureReason: reason.slice(0, 200),
      claimedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(pomodoroMediaUploads.mediaId, job.mediaId))
}

/**
 * Mark a job done without touching the library row, for the one case where
 * there is nothing to re-encode. An image is stored ready and never queued, so
 * a queued one is a row made by hand or by an older version — writing a made-up
 * type over the library row to close it would be worse than leaving it alone.
 */
export async function markUploadReady(mediaId: string) {
  await db
    .update(pomodoroMediaUploads)
    .set({
      status: "ready",
      failureReason: null,
      claimedAt: null,
      updatedAt: new Date(),
    })
    .where(eq(pomodoroMediaUploads.mediaId, mediaId))
}

/** Where the job's file is now, so the worker can read it and replace it. */
export async function loadJobFile(mediaId: string) {
  const [row] = await db
    .select({
      storagePath: customShellMedia.storagePath,
      originalName: customShellMedia.originalName,
    })
    .from(customShellMedia)
    .where(eq(customShellMedia.id, mediaId))
    .limit(1)
  return row ?? null
}
