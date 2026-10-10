import {
  and,
  asc,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import { db, type CustomShellDb } from "@/server/db"
import { now, uuid } from "@/server/auth/security"
import {
  cleanOriginalName,
  loadAccountStorage,
  storedFilename,
} from "@/server/media/library"
import {
  deleteFromR2,
  getFromR2,
  getPublicMediaUrl,
  uploadToR2,
} from "@/server/media/storage"
import { loadPomodoroEntitlements } from "@/server/pomodoro/entitlements"
import { writeNotices } from "@/server/pomodoro/notices"
import {
  findPickableSharedMedia,
  resolveSharedMedia,
  shareChangeFor,
  shareStateOf,
} from "@/server/pomodoro/shared-media"
import {
  MEDIA_PAGE,
  mediaFailedMessage,
  mediaReadyMessage,
} from "@/lib/pomodoro/notices"
import {
  pomodoroCatalogItems,
  pomodoroGenerations,
  pomodoroMediaUploads,
  pomodoroPersonalRooms,
  pomodoroProfiles,
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
import {
  UPLOAD_NAME_MAX,
  checkUploadLabels,
  isValidTrim,
  type UploadTrim,
} from "@/lib/pomodoro/upload-labels"
import type { MediaCredit, ShareState } from "@/lib/pomodoro/shared-media"

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

/**
 * A worker pass that dies leaves a claim behind; this is when to retry it.
 *
 * Longer than the longest a live job can take: FFmpeg gets four minutes, and a
 * 100 MB video has to come down from the bucket and go back up around it. Five
 * minutes left almost no slack for the transfer, so a slow-but-alive job could
 * have its claim stolen and be re-encoded twice.
 */
const CLAIM_TIMEOUT_MS = 15 * 60 * 1000

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

/** What the member typed in the upload window, checked by the server. */
export type UploadLabels = {
  name: string
  tags: string[]
  shared: boolean
  /** The "I have the right to share this" tick under Share. */
  confirmRights?: boolean
  trim: UploadTrim | null
}

/**
 * The window's name, tags and trim, checked again here because the browser's
 * check is a courtesy. Throws one of the refusal codes, which
 * `getPomodoroUploadErrorMessage` turns into the window's own sentence.
 */
export function validateUploadLabels(
  input: UploadLabels,
  kind: PomodoroUploadKind
): UploadLabels {
  const checked = checkUploadLabels(input)
  if (!checked.ok) throw new Error(checked.problem)
  // A picture has no length to cut, so a trim on one is a request the window
  // never makes.
  if (input.trim && (kind === "image" || !isValidTrim(input.trim))) {
    throw new Error("INVALID_TRIM")
  }
  return {
    name: checked.name,
    tags: checked.tags,
    shared: input.shared,
    confirmRights: input.confirmRights === true,
    trim: input.trim,
  }
}

/**
 * Whether an upload's library row holds a finished file that can be played.
 * A first prepare still running cannot. A re-trim still running can, because
 * the old cut stays in place until the new one is ready, and that is the only
 * time `sourceMediaId` is set on an unfinished row.
 */
export function uploadIsShowable(row: {
  status: string
  sourceMediaId: string | null
}) {
  return row.status === "ready" || row.sourceMediaId !== null
}

export type StoredUpload = {
  mediaId: string
  purpose: PomodoroUploadPurpose
  kind: PomodoroUploadKind
  status: string
  /** What the member called it, or the file name for an older upload. */
  name: string
  tags: string[]
  /** The owner's Share tick. Whether others see it is `shareState`. */
  shared: boolean
  /** Not shared, waiting for an admin's first check, shared, or taken off. */
  shareState: ShareState
  /** Why an admin took it off sharing, for the owner's own card. */
  takenDownReason: string | null
  /**
   * Where the kept part starts and ends in the original, for the cog's trim
   * handles. Null when nothing was cut or the original is not kept.
   */
  trim: UploadTrim | null
  /**
   * The file the cog's trim handles cover: the kept original, or the finished
   * file itself for an upload from before originals were kept. Empty while
   * nothing finished exists yet.
   */
  sourceUrl: string
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
  /** Made by AI rather than uploaded. */
  generated: boolean
  /** In the owner's personal room, or their profile banner. */
  inUse: boolean
  /** A video's middle frame, or empty until the worker has taken it. */
  stillUrl: string
  /** In the bin since then; null for a file in use. */
  deletedAt: Date | null
  /** The Pixabay author of a file imported from a Pixabay link, else null. */
  sourceAuthor: string | null
}

/** What My uploads lists: one kind's files, or the bin with both kinds. */
export type UploadView = PomodoroUploadPurpose | "bin"

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
  alreadyProcessed = false,
  labels,
}: {
  userId: string
  purpose: PomodoroUploadPurpose
  file: { name: string }
  bytes: Uint8Array
  detected: { kind: PomodoroUploadKind; mimeType: string }
  /**
   * What the member typed in the upload window, already checked by
   * `validateUploadLabels`. AI generation has none, so its upload is named
   * after the file it was given.
   */
  labels?: UploadLabels
  /**
   * These bytes have already been through FFmpeg, so the file is finished and
   * must not be queued for a re-encode. AI generation passes this: its worker
   * re-encodes before storing, and queueing it again would run FFmpeg twice
   * over the same file and hand the member a second wait.
   */
  alreadyProcessed?: boolean
}): Promise<StoredUpload> {
  const originalName = cleanOriginalName(file.name)
  const name = labels?.name ?? originalName.slice(0, UPLOAD_NAME_MAX)
  const tags = labels?.tags ?? []
  // The share rules are checked before a byte goes to the bucket, so a file
  // over the daily limit is refused whole rather than stored half-shared.
  const share = labels?.shared
    ? await shareChangeFor(db, {
        userId,
        mediaId: null,
        current: { shared: false, adminUnsharedAt: null },
        wanted: true,
        confirmRights: labels.confirmRights === true,
      })
    : {}
  const filename = bucketFilename(originalName, detected.mimeType)
  const storagePath = `${userId}/${filename}`
  const workspaceId = await workspaceIdForRequest(userId)

  await uploadToR2(storagePath, bytes, detected.mimeType)

  const mediaId = uuid()
  const timestamp = now()
  // An image is finished the moment it lands, and so is anything already
  // re-encoded. Sound and video otherwise wait for the worker, so the picker
  // can say "Getting it ready" instead of offering a 100 MB original that
  // would stutter behind the timer.
  const status =
    alreadyProcessed || detected.kind === "image" ? "ready" : "queued"

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
        name,
        tags,
        shared: false,
        ...share,
        trimStartMs: labels?.trim?.startMs ?? null,
        trimEndMs: labels?.trim?.endMs ?? null,
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
    name,
    tags,
    shared: share.shared === true,
    shareState: shareStateOf({
      shared: share.shared === true,
      shareWaitingSince: share.shareWaitingSince ?? null,
      adminUnsharedAt: null,
    }),
    takenDownReason: null,
    trim: labels?.trim ?? null,
    sourceUrl: "",
    generated: false,
    inUse: false,
    stillUrl: "",
    deletedAt: null,
    sourceAuthor: null,
    fileSize: bytes.byteLength,
    mimeType: detected.mimeType,
    failureReason: null,
    createdAt: new Date(timestamp),
    url: status === "ready" ? await getPublicMediaUrl(storagePath) : "",
  }
}

/**
 * The name a member's file is stored under in the bucket: a random id and its
 * extension, never the member's own file name. A shared file's address is
 * public, so "Sarah_Jones_vlog.mp4" must not ride along in it after its owner
 * renamed it (audit, 10 Oct 2026). The library row still keeps the original
 * name for the member's own lists and downloads.
 */
export function bucketFilename(originalName: string, mimeType: string) {
  const extension = /\.([a-z0-9]{1,8})$/i.exec(originalName)?.[1]
  return storedFilename(extension ? `file.${extension}` : "file", mimeType)
}

/** The kept original's library row, joined beside the upload's own. */
const sourceMedia = alias(customShellMedia, "source_media")

/**
 * Not in the bin: every place a member picks, plays, edits or is offered a
 * file. Only the bin's own list and the final delete see the others.
 */
const notInBin = isNull(pomodoroMediaUploads.deletedAt)

/** The `media:<id>` a choice stores, compared in SQL against this row's file. */
const mediaReference = sql<string>`'media:' || ${pomodoroMediaUploads.mediaId}`

/**
 * This person's own files for one tab of My uploads: one kind's, oldest
 * first, or the bin's of both kinds, most recently deleted first.
 */
export async function listPomodoroUploads(
  userId: string,
  view: UploadView
): Promise<StoredUpload[]> {
  const rows = await db
    .select({
      mediaId: pomodoroMediaUploads.mediaId,
      purpose: pomodoroMediaUploads.purpose,
      kind: pomodoroMediaUploads.kind,
      status: pomodoroMediaUploads.status,
      failureReason: pomodoroMediaUploads.failureReason,
      createdAt: pomodoroMediaUploads.createdAt,
      // A row written by a server still on older code has no name yet.
      name: sql<string>`coalesce(${pomodoroMediaUploads.name}, ${customShellMedia.originalName})`,
      tags: pomodoroMediaUploads.tags,
      shared: pomodoroMediaUploads.shared,
      shareWaitingSince: pomodoroMediaUploads.shareWaitingSince,
      adminUnsharedAt: pomodoroMediaUploads.adminUnsharedAt,
      takenDownReason: pomodoroMediaUploads.adminUnshareReason,
      trimStartMs: pomodoroMediaUploads.trimStartMs,
      trimEndMs: pomodoroMediaUploads.trimEndMs,
      sourceMediaId: pomodoroMediaUploads.sourceMediaId,
      sourcePath: sourceMedia.storagePath,
      fileSize: customShellMedia.fileSize,
      mimeType: customShellMedia.mimeType,
      storagePath: customShellMedia.storagePath,
      stillPath: pomodoroMediaUploads.stillPath,
      deletedAt: pomodoroMediaUploads.deletedAt,
      sourceAuthor: pomodoroMediaUploads.sourceAuthor,
      generated: sql<boolean>`exists (
        select 1 from ${pomodoroGenerations}
        where ${pomodoroGenerations.mediaId} = ${pomodoroMediaUploads.mediaId})`,
      inUse: sql<boolean>`exists (
        select 1 from ${pomodoroPersonalRooms}
        where ${pomodoroPersonalRooms.userId} = ${pomodoroMediaUploads.userId}
          and ${mediaReference} in (${pomodoroPersonalRooms.background}, ${pomodoroPersonalRooms.sound})
      ) or exists (
        select 1 from ${pomodoroProfiles}
        where ${pomodoroProfiles.userId} = ${pomodoroMediaUploads.userId}
          and ${pomodoroProfiles.bannerRef} = ${mediaReference})`,
    })
    .from(pomodoroMediaUploads)
    .innerJoin(
      customShellMedia,
      eq(customShellMedia.id, pomodoroMediaUploads.mediaId)
    )
    .leftJoin(
      sourceMedia,
      eq(sourceMedia.id, pomodoroMediaUploads.sourceMediaId)
    )
    .where(
      view === "bin"
        ? and(
            eq(pomodoroMediaUploads.userId, userId),
            isNotNull(pomodoroMediaUploads.deletedAt)
          )
        : and(
            eq(pomodoroMediaUploads.userId, userId),
            eq(pomodoroMediaUploads.purpose, view),
            notInBin
          )
    )
    .orderBy(
      view === "bin"
        ? desc(pomodoroMediaUploads.deletedAt)
        : asc(pomodoroMediaUploads.createdAt)
    )

  return Promise.all(
    rows.map(
      async ({
        storagePath,
        sourcePath,
        sourceMediaId,
        stillPath,
        trimStartMs,
        trimEndMs,
        shareWaitingSince,
        adminUnsharedAt,
        ...row
      }) => {
        // Only a finished file gets an address: a first re-encode replaces
        // the raw original, so one handed out early would point at a file
        // about to vanish.
        const url = uploadIsShowable({ status: row.status, sourceMediaId })
          ? await getPublicMediaUrl(storagePath)
          : ""
        return {
          ...row,
          shareState: shareStateOf({
            shared: row.shared,
            shareWaitingSince,
            adminUnsharedAt,
          }),
          purpose: row.purpose as PomodoroUploadPurpose,
          kind: row.kind as PomodoroUploadKind,
          url,
          sourceUrl: sourcePath ? await getPublicMediaUrl(sourcePath) : url,
          stillUrl: stillPath ? await getPublicMediaUrl(stillPath) : "",
          // A trim only means something against the original it was cut from.
          trim:
            sourcePath && trimStartMs !== null && trimEndMs !== null
              ? { startMs: trimStartMs, endMs: trimEndMs }
              : null,
        }
      }
    )
  )
}

/**
 * The cog on an upload's card: a new name, tags and Share tick, and for a
 * sound or clip a new trim. Tyler, 10 Oct 2026: "I should be able to reclip
 * the file too".
 *
 * A new trim is cut from the kept original by the worker, like a first
 * upload. The old cut stays in use until the new one is ready. An upload from
 * before originals were kept, or one made by AI, has its finished file copied
 * to be the original first, so it can only be cut shorter.
 */
export async function editPomodoroUpload(
  userId: string,
  mediaId: string,
  input: {
    name: string
    tags: string[]
    shared: boolean
    /** The "I have the right to share this" tick, needed to switch Share on. */
    confirmRights?: boolean
    /** Left out to keep the trim; null to keep the whole original. */
    trim?: UploadTrim | null
  }
) {
  const checked = checkUploadLabels(input)
  if (!checked.ok) throw new Error(checked.problem)
  const retrim = input.trim !== undefined
  if (input.trim && !isValidTrim(input.trim)) throw new Error("INVALID_TRIM")

  const current = await loadOwnUpload(db, userId, mediaId)
  if (retrim) {
    assertCanRetrim(current)
    // A cut is a Pro thing, like the upload it comes from. An upload with no
    // kept original is copied first, and the copy takes space.
    await assertCanUpload(
      userId,
      current.sourceMediaId ? 0 : current.media.fileSize
    )
  }

  // The copy is made before the transaction, because a bucket write cannot
  // be rolled back. The library allows one row per bucket file, so the
  // original has to be a file of its own.
  let copyPath: string | null = null
  if (retrim && !current.sourceMediaId) {
    const object = await getFromR2(current.media.storagePath)
    const body = object.Body
    if (!body || typeof body.transformToByteArray !== "function")
      throw new Error("UPLOAD_NOT_READY")
    // Named for what it holds, the finished cut, not the file first sent.
    const extension = current.media.storagePath.split(".").pop() ?? "bin"
    const bare = current.media.originalName.replace(/\.[^.]+$/, "")
    copyPath = `${userId}/${bucketFilename(`${bare}.${extension}`, current.media.mimeType)}`
    await uploadToR2(
      copyPath,
      await body.transformToByteArray(),
      current.media.mimeType
    )
  }

  try {
    return await db.transaction(async (tx) => {
      // Read again under a lock, so two saves at once cannot both start a cut.
      const row = await loadOwnUpload(tx, userId, mediaId, true)
      let sourceMediaId = row.sourceMediaId
      if (retrim) {
        assertCanRetrim(row)
        if (!sourceMediaId && copyPath)
          sourceMediaId = await keepAsSource(tx, row.media, copyPath)
      }
      const share = await shareChangeFor(tx, {
        userId,
        mediaId,
        current: row,
        wanted: input.shared,
        confirmRights: input.confirmRights === true,
      })
      await tx
        .update(pomodoroMediaUploads)
        .set({
          name: checked.name,
          tags: checked.tags,
          ...share,
          ...(retrim
            ? {
                trimStartMs: input.trim?.startMs ?? null,
                trimEndMs: input.trim?.endMs ?? null,
                sourceMediaId,
                status: "queued",
                queuedAt: new Date(),
                attempts: 0,
                failureReason: null,
                claimedAt: null,
              }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(pomodoroMediaUploads.mediaId, mediaId))
      // A copy another save beat this one to is not needed.
      if (copyPath && sourceMediaId !== null && row.sourceMediaId !== null)
        await deleteFromR2(copyPath).catch(() => undefined)
      const shared = share.shared ?? row.shared
      return {
        name: checked.name,
        tags: checked.tags,
        shared,
        /** This save put the file in the admins' waiting list. */
        startedWaiting: share.shareWaitingSince instanceof Date,
        shareState: shareStateOf({
          shared,
          shareWaitingSince:
            share.shareWaitingSince !== undefined
              ? share.shareWaitingSince
              : row.shareWaitingSince,
          adminUnsharedAt: row.adminUnsharedAt,
        }),
      }
    })
  } catch (error) {
    if (copyPath) await deleteFromR2(copyPath).catch(() => undefined)
    throw error
  }
}

type Db = CustomShellDb | Parameters<Parameters<typeof db.transaction>[0]>[0]

/** One of this member's uploads with its library row, or UPLOAD_NOT_FOUND. */
async function loadOwnUpload(
  database: Db,
  userId: string,
  mediaId: string,
  lock = false
) {
  const query = database
    .select({
      kind: pomodoroMediaUploads.kind,
      status: pomodoroMediaUploads.status,
      sourceMediaId: pomodoroMediaUploads.sourceMediaId,
      shared: pomodoroMediaUploads.shared,
      shareWaitingSince: pomodoroMediaUploads.shareWaitingSince,
      adminUnsharedAt: pomodoroMediaUploads.adminUnsharedAt,
      sharedAt: pomodoroMediaUploads.sharedAt,
      shareAnnouncedAt: pomodoroMediaUploads.shareAnnouncedAt,
      media: customShellMedia,
    })
    .from(pomodoroMediaUploads)
    .innerJoin(
      customShellMedia,
      eq(customShellMedia.id, pomodoroMediaUploads.mediaId)
    )
    .where(
      and(
        eq(pomodoroMediaUploads.mediaId, mediaId),
        eq(pomodoroMediaUploads.userId, userId),
        notInBin
      )
    )
    .limit(1)
  const [row] = await (lock ? query.for("update", { of: pomodoroMediaUploads }) : query)
  if (!row) throw new Error("UPLOAD_NOT_FOUND")
  return row
}

/** A trim needs a sound or clip with a finished file and no cut under way. */
function assertCanRetrim(row: {
  kind: string
  status: string
  sourceMediaId: string | null
}) {
  if (row.kind === "image") throw new Error("INVALID_TRIM")
  if (row.status === "queued" || row.status === "processing")
    throw new Error("UPLOAD_NOT_READY")
  // A first prepare that failed has nothing finished to cut from.
  if (!uploadIsShowable(row)) throw new Error("UPLOAD_NOT_READY")
}

/**
 * A library row for a kept original, beside the upload's own: its own row so
 * it counts toward the member's space and the storage page's orphan sweep
 * sees it. Returns the new row's id.
 */
async function keepAsSource(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  media: typeof customShellMedia.$inferSelect,
  storagePath: string
) {
  const id = uuid()
  const timestamp = now()
  await tx.insert(customShellMedia).values({
    ...media,
    id,
    storagePath,
    filename: storagePath.slice(storagePath.lastIndexOf("/") + 1),
    emailProtectedAt: null,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  return id
}

/**
 * How many sounds and clips the worker will prepare before this one: every
 * member's, because the worker takes them oldest first, one per pass. The
 * window turns the number into a rough wait.
 */
export async function countUploadsAhead(mediaId: string) {
  const [row] = await db
    .select({ ahead: count() })
    .from(pomodoroMediaUploads)
    .where(
      and(
        inArray(pomodoroMediaUploads.status, ["queued", "processing"]),
        notInBin,
        lt(
          pomodoroMediaUploads.queuedAt,
          sql`(select ${pomodoroMediaUploads.queuedAt} from ${pomodoroMediaUploads} where ${pomodoroMediaUploads.mediaId} = ${mediaId})`
        )
      )
    )
  return row?.ahead ?? 0
}

/**
 * The tags the window offers: those on Live catalogue items of the same kind,
 * then the member's own, so the same word is not spelled three ways.
 */
export async function loadUploadTagSuggestions(
  userId: string,
  purpose: PomodoroUploadPurpose
) {
  const [catalog, own] = await Promise.all([
    db
      .select({
        tag: sql<string>`jsonb_array_elements_text(${pomodoroCatalogItems.tags})`,
      })
      .from(pomodoroCatalogItems)
      .where(
        and(
          eq(pomodoroCatalogItems.kind, purpose === "sound" ? "sound" : "theme"),
          eq(pomodoroCatalogItems.status, "live")
        )
      ),
    db
      .select({
        tag: sql<string>`jsonb_array_elements_text(${pomodoroMediaUploads.tags})`,
      })
      .from(pomodoroMediaUploads)
      .where(
        and(
          eq(pomodoroMediaUploads.userId, userId),
          eq(pomodoroMediaUploads.purpose, purpose),
          notInBin
        )
      ),
  ])
  return [
    ...new Set([
      ...catalog.map((row) => row.tag).sort(),
      ...own.map((row) => row.tag).sort(),
    ]),
  ]
}

/**
 * The address for one upload the caller owns, or one somebody shared with
 * them, for the two preference loaders. Someone else's file carries its
 * credit. Returns null when it is not theirs and not shared with them, or
 * not finished, which is what makes a stale preference fall back to the
 * default instead of drawing a broken picture.
 */
export async function resolveUploadUrl(
  userId: string,
  mediaId: string,
  { shared = true }: { shared?: boolean } = {}
): Promise<{
  url: string
  kind: PomodoroUploadKind
  name: string
  credit: MediaCredit | null
} | null> {
  const [row] = await db
    .select({
      storagePath: customShellMedia.storagePath,
      kind: pomodoroMediaUploads.kind,
      name: sql<string>`coalesce(${pomodoroMediaUploads.name}, ${customShellMedia.originalName})`,
      status: pomodoroMediaUploads.status,
      sourceMediaId: pomodoroMediaUploads.sourceMediaId,
    })
    .from(pomodoroMediaUploads)
    .innerJoin(
      customShellMedia,
      eq(customShellMedia.id, pomodoroMediaUploads.mediaId)
    )
    .where(
      and(
        eq(pomodoroMediaUploads.mediaId, mediaId),
        eq(pomodoroMediaUploads.userId, userId),
        notInBin
      )
    )
    .limit(1)

  if (!row) {
    if (!shared) return null
    const other = await resolveSharedMedia(userId, mediaId)
    return other
      ? { url: other.url, kind: other.kind, name: other.name, credit: other.credit }
      : null
  }
  if (!uploadIsShowable(row)) return null
  return {
    url: await getPublicMediaUrl(row.storagePath),
    kind: row.kind as PomodoroUploadKind,
    name: row.name,
    credit: null,
  }
}

/**
 * The file a member's Download button sends: the finished file they play,
 * named after the upload's name, for an upload that is theirs, not in the
 * bin, and finished. Null otherwise, which the route answers as not found.
 */
export async function loadUploadDownload(userId: string, mediaId: string) {
  const [row] = await db
    .select({
      storagePath: customShellMedia.storagePath,
      mimeType: customShellMedia.mimeType,
      name: sql<string>`coalesce(${pomodoroMediaUploads.name}, ${customShellMedia.originalName})`,
      status: pomodoroMediaUploads.status,
      sourceMediaId: pomodoroMediaUploads.sourceMediaId,
    })
    .from(pomodoroMediaUploads)
    .innerJoin(
      customShellMedia,
      eq(customShellMedia.id, pomodoroMediaUploads.mediaId)
    )
    .where(
      and(
        eq(pomodoroMediaUploads.mediaId, mediaId),
        eq(pomodoroMediaUploads.userId, userId),
        notInBin
      )
    )
    .limit(1)
  if (!row || !uploadIsShowable(row)) return null
  const extension = row.storagePath.split(".").pop() ?? "bin"
  return {
    storagePath: row.storagePath,
    mimeType: row.mimeType,
    filename: `${row.name}.${extension}`,
  }
}

/**
 * The check every "use this one" needs: the upload is this person's, or
 * someone shared it with them, it is finished, and it is the right kind for
 * where they are putting it. Returns who owns it, so a pick of someone
 * else's file can be counted for its owner.
 *
 * Without this a member could save somebody else's private media id as their
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
      sourceMediaId: pomodoroMediaUploads.sourceMediaId,
    })
    .from(pomodoroMediaUploads)
    .where(
      and(
        eq(pomodoroMediaUploads.mediaId, mediaId),
        eq(pomodoroMediaUploads.userId, userId),
        eq(pomodoroMediaUploads.purpose, purpose),
        notInBin
      )
    )
    .limit(1)

  if (!row) {
    const other = await findPickableSharedMedia(userId, mediaId, purpose)
    if (!other) throw new Error("UPLOAD_NOT_FOUND")
    return { kind: other.kind, ownerUserId: other.ownerUserId }
  }
  if (!uploadIsShowable(row)) throw new Error("UPLOAD_NOT_READY")
  return { kind: row.kind as PomodoroUploadKind, ownerUserId: userId }
}

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * Wherever these files are chosen, puts back what an empty choice gives: a
 * personal room's background to the default scene, its sound to silence, the
 * profile banner to none, so nobody comes back to a picture or a sound that
 * 404s. Moving a file to the bin, the member's final delete and the admin's
 * delete all use it.
 */
export async function clearUploadChoices(tx: Transaction, mediaIds: string[]) {
  if (!mediaIds.length) return
  const references = mediaIds.map((id) => `media:${id}`)
  const changedAt = new Date()
  await tx
    .update(pomodoroPersonalRooms)
    .set({ background: null, updatedAt: changedAt })
    .where(inArray(pomodoroPersonalRooms.background, references))
  await tx
    .update(pomodoroPersonalRooms)
    .set({ sound: null, updatedAt: changedAt })
    .where(inArray(pomodoroPersonalRooms.sound, references))
  await tx
    .update(pomodoroProfiles)
    .set({ bannerRef: null, updatedAt: changedAt })
    .where(inArray(pomodoroProfiles.bannerRef, references))
}

/**
 * Remove an upload: the file, both rows, and any preference pointing at it.
 *
 * The preference is cleared in the same transaction as the rows, because a
 * member whose chosen background has just been deleted should come back to the
 * default rather than to a blank screen waiting on a 404.
 */
export async function deletePomodoroUpload(
  userId: string,
  mediaId: string,
  /**
   * Only while it is still in the bin. Emptying the bin and the 30-day
   * clear-out pass this, so a file brought back while they run is kept.
   */
  { fromBin = false }: { fromBin?: boolean } = {}
) {
  const paths = await db.transaction(async (tx) => {
    // Read under the upload row's lock, so a first prepare or a re-trim
    // finishing at the same moment has either added the kept original
    // already, and it goes too, or waits and finds the row gone.
    const [row] = await tx
      .select({
        storagePath: customShellMedia.storagePath,
        sourcePath: sourceMedia.storagePath,
      })
      .from(pomodoroMediaUploads)
      .innerJoin(
        customShellMedia,
        eq(customShellMedia.id, pomodoroMediaUploads.mediaId)
      )
      .leftJoin(
        sourceMedia,
        eq(sourceMedia.id, pomodoroMediaUploads.sourceMediaId)
      )
      .where(
        and(
          eq(pomodoroMediaUploads.mediaId, mediaId),
          eq(pomodoroMediaUploads.userId, userId),
          fromBin ? isNotNull(pomodoroMediaUploads.deletedAt) : undefined
        )
      )
      .limit(1)
      .for("update", { of: pomodoroMediaUploads })

    if (!row) throw new Error("UPLOAD_NOT_FOUND")

    // Anywhere still holding it falls back. Moving it to the bin already did
    // this; a file deleted another way may still be chosen somewhere.
    await clearUploadChoices(tx, [mediaId])
    // The library row goes and the job row follows it through the cascade;
    // the kept original's row goes with the job row (migration 0135).
    await tx.delete(customShellMedia).where(eq(customShellMedia.id, mediaId))
    // A clip's still is noted by the database as the row goes (migration
    // 0137) and leaves the bucket on the media worker's next pass.
    return [row.storagePath, row.sourcePath]
  })

  // After the rows, so a bucket that refuses the delete leaves an orphan the
  // storage page can sweep rather than a row pointing at a file that is gone.
  for (const path of paths) {
    if (path) await deleteFromR2(path).catch(() => undefined)
  }
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
          where ${and(
            // A file in the bin waits there unprepared; brought back, it
            // joins the queue where it left it.
            notInBin,
            or(
              eq(pomodoroMediaUploads.status, "queued"),
              and(
                eq(pomodoroMediaUploads.status, "processing"),
                lt(pomodoroMediaUploads.claimedAt, staleBefore)
              )
            )
          )}
          order by ${pomodoroMediaUploads.queuedAt}
          limit 1
          for update skip locked
        )`
      )
    )
    .returning()

  return claimed ?? null
}

/** The re-encode worked: point the library row at the new file. */
/**
 * The job is still held by the pass that claimed it. A pass that stalled past
 * the claim timeout has had its job taken, and may since have seen it
 * finished and re-trimmed, so "processing" alone is not enough.
 */
function stillClaimedBy(claimedAt: Date | null) {
  return claimedAt
    ? eq(pomodoroMediaUploads.claimedAt, claimedAt)
    : isNull(pomodoroMediaUploads.claimedAt)
}

export async function finishUploadJob({
  mediaId,
  claimedAt,
  storagePath,
  mimeType,
  fileSize,
  previousStoragePath,
  stillPath = null,
}: {
  mediaId: string
  /** When this pass claimed the job, from the claimed row. */
  claimedAt: Date | null
  storagePath: string
  mimeType: string
  fileSize: number
  previousStoragePath: string
  /** A video's new middle frame, already in the bucket; null for a sound. */
  stillPath?: string | null
}) {
  // Only a job this pass still holds is finished. If a claim was stolen from
  // a slow-but-alive pass, the loser's update matches nothing and it must not
  // go on to point the library row at its own copy or delete the winner's file.
  const closed = await db.transaction(async (tx) => {
    const rows = await tx
      .update(pomodoroMediaUploads)
      .set({
        status: "ready",
        failureReason: null,
        claimedAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(pomodoroMediaUploads.mediaId, mediaId),
          eq(pomodoroMediaUploads.status, "processing"),
          stillClaimedBy(claimedAt)
        )
      )
      .returning({
        userId: pomodoroMediaUploads.userId,
        purpose: pomodoroMediaUploads.purpose,
        name: pomodoroMediaUploads.name,
        sourceMediaId: pomodoroMediaUploads.sourceMediaId,
      })

    if (!rows.length) return null

    // A new cut brings a new middle frame. The old one is noted by the
    // database as it is replaced (migration 0137) and goes on the next pass.
    if (stillPath) {
      await tx
        .update(pomodoroMediaUploads)
        .set({ stillPath })
        .where(eq(pomodoroMediaUploads.mediaId, mediaId))
    }
    const [raw] = await tx
      .select()
      .from(customShellMedia)
      .where(eq(customShellMedia.id, mediaId))
    const [media] = await tx
      .update(customShellMedia)
      .set({ storagePath, mimeType, fileSize, updatedAt: now() })
      .where(eq(customShellMedia.id, mediaId))
      .returning({ originalName: customShellMedia.originalName })

    let sourcePath: string | null = null
    if (rows[0].sourceMediaId) {
      const [source] = await tx
        .select({ storagePath: customShellMedia.storagePath })
        .from(customShellMedia)
        .where(eq(customShellMedia.id, rows[0].sourceMediaId))
      sourcePath = source?.storagePath ?? null
    } else if (raw) {
      // The first prepare: the raw original is kept as a library file of its
      // own, so the cog can cut it again later. After the upload's own row
      // has moved to the cut, because one bucket file has one library row.
      const sourceId = await keepAsSource(tx, raw, raw.storagePath)
      await tx
        .update(pomodoroMediaUploads)
        .set({ sourceMediaId: sourceId })
        .where(eq(pomodoroMediaUploads.mediaId, mediaId))
      sourcePath = raw.storagePath
    }
    await writeNotices(tx, [
      uploadNotice(rows[0], true, rows[0].name ?? media?.originalName ?? null),
    ])
    return { sourcePath }
  })

  if (!closed) {
    // Another pass got there first, so this copy is the spare one to remove.
    await deleteFromR2(storagePath).catch(() => undefined)
    if (stillPath) await deleteFromR2(stillPath).catch(() => undefined)
    return { settled: false }
  }

  // The cut this replaces goes, unless it is the kept original itself.
  if (
    previousStoragePath !== storagePath &&
    previousStoragePath !== closed.sourcePath
  ) {
    await deleteFromR2(previousStoragePath).catch(() => undefined)
  }
  return { settled: true }
}

/**
 * Where a video's middle frame goes: a folder of its own, outside the
 * per-member folders the storage page's orphan sweep reads, because a still
 * has no library row. The upload's delete removes it.
 */
export function stillStoragePath(userId: string, mediaId: string) {
  return `pomodoro-stills/${userId}/${mediaId}-${uuid()}.jpg`
}

/**
 * A finished video, not in the bin, that has no still yet: the worker takes
 * one per quiet pass, so videos from before stills existed catch up.
 */
export async function findVideoWithoutStill() {
  const [row] = await db
    .select({
      mediaId: pomodoroMediaUploads.mediaId,
      userId: pomodoroMediaUploads.userId,
      storagePath: customShellMedia.storagePath,
    })
    .from(pomodoroMediaUploads)
    .innerJoin(
      customShellMedia,
      eq(customShellMedia.id, pomodoroMediaUploads.mediaId)
    )
    .where(
      and(
        eq(pomodoroMediaUploads.kind, "video"),
        eq(pomodoroMediaUploads.status, "ready"),
        isNull(pomodoroMediaUploads.stillPath),
        notInBin
      )
    )
    .orderBy(asc(pomodoroMediaUploads.createdAt))
    .limit(1)
  return row ?? null
}

/**
 * Saves a still taken on a quiet pass. False when another pass or a new cut
 * saved one first, and the caller removes its spare.
 */
export async function saveUploadStill(mediaId: string, stillPath: string) {
  const rows = await db
    .update(pomodoroMediaUploads)
    .set({ stillPath })
    .where(
      and(
        eq(pomodoroMediaUploads.mediaId, mediaId),
        isNull(pomodoroMediaUploads.stillPath)
      )
    )
    .returning({ mediaId: pomodoroMediaUploads.mediaId })
  return rows.length > 0
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
  /**
   * `retry: false` for a failure no amount of trying again can fix.
   * `tell: false` when the member caused it themselves, by deleting the file,
   * and a notice about it would be noise.
   */
  { retry = true, tell = true }: { retry?: boolean; tell?: boolean } = {}
) {
  const giveUp = !retry || job.attempts >= MAX_ATTEMPTS
  await db.transaction(async (tx) => {
    const updated = await tx
      .update(pomodoroMediaUploads)
      .set({
        status: giveUp ? "failed" : "queued",
        failureReason: reason.slice(0, 200),
        claimedAt: null,
        updatedAt: new Date(),
      })
      // Only while this pass still holds it: a stalled pass must not mark a
      // job failed that another pass finished, or that was re-trimmed since.
      .where(
        and(
          eq(pomodoroMediaUploads.mediaId, job.mediaId),
          stillClaimedBy(job.claimedAt)
        )
      )
      .returning({ mediaId: pomodoroMediaUploads.mediaId })
    // A retry is not an ending, so only giving up tells the member. The
    // reason is the same sentence the picker shows, never the raw error.
    if (updated.length && giveUp && tell)
      await writeNotices(tx, [uploadNotice(job, false, reason)])
  })
}

/**
 * The notice an upload's re-encode leaves in the bell: ready, with the file's
 * name, or given up, with the reason the picker shows.
 */
function uploadNotice(
  job: { userId: string; purpose: string },
  ready: boolean,
  detail: string | null
) {
  return {
    recipientUserId: job.userId,
    kind: ready ? ("media_ready" as const) : ("media_failed" as const),
    message: ready ? mediaReadyMessage("upload") : mediaFailedMessage("upload"),
    detail,
    href: job.purpose === "sound" ? MEDIA_PAGE.sound : MEDIA_PAGE.background,
  }
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
      sourcePath: sourceMedia.storagePath,
    })
    .from(customShellMedia)
    .innerJoin(
      pomodoroMediaUploads,
      eq(pomodoroMediaUploads.mediaId, customShellMedia.id)
    )
    .leftJoin(
      sourceMedia,
      eq(sourceMedia.id, pomodoroMediaUploads.sourceMediaId)
    )
    .where(eq(customShellMedia.id, mediaId))
    .limit(1)
  return row ?? null
}
