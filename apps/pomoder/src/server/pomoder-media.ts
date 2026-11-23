import { mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises"
import path from "node:path"

import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  GetObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"
import { and, eq, isNull, or, sql } from "drizzle-orm"

import { db, type PomoderDb } from "@/server/db"
import { getEntitlements } from "@/server/entitlements"
import {
  mediaAssets,
  storageDeletionJobs,
  subscriptions,
  type MediaAsset,
} from "@/server/schema"

type MediaKind = "image" | "audio" | "video"
const LIMITS: Record<MediaKind, number> = {
  image: 10 * 1024 * 1024,
  audio: 30 * 1024 * 1024,
  video: 100 * 1024 * 1024,
}
const MAX_REQUEST_BYTES = 101 * 1024 * 1024

export function validateUploadContentLength(value: string | null) {
  if (value === null) throw new Error("CONTENT_LENGTH_REQUIRED")
  const length = Number(value)
  if (!Number.isSafeInteger(length) || length <= 0)
    throw new Error("INVALID_CONTENT_LENGTH")
  if (length > MAX_REQUEST_BYTES) throw new Error("FILE_TOO_LARGE")
  return length
}

export function validateMediaUpload({
  bytes,
  mimeType,
  fileSize,
}: {
  bytes: Uint8Array
  mimeType: string
  fileSize: number
}) {
  const detected = detectMedia(bytes)
  if (!detected || detected.mimeType !== mimeType)
    throw new Error("INVALID_FILE_CONTENT")
  if (fileSize <= 0 || fileSize > LIMITS[detected.kind])
    throw new Error("FILE_TOO_LARGE")
  return { kind: detected.kind, extension: detected.extension }
}

export async function assertStorageAvailable(
  userId: string,
  incomingBytes: number
) {
  const [subscription] = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, userId))
    .limit(1)
  const entitlements = getEntitlements(subscription || null)
  if (!entitlements.canUploadMedia) throw new Error("PRO_REQUIRED")
  const [usage] = await db
    .select({
      bytes: sql<number>`coalesce(sum(${mediaAssets.fileSize}), 0)::bigint`,
    })
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.ownerUserId, userId),
        sql`${mediaAssets.status} != 'failed'`
      )
    )
  if (
    Number(usage?.bytes || 0) + incomingBytes >
    entitlements.storageLimitBytes
  )
    throw new Error("STORAGE_QUOTA_EXCEEDED")
}

export async function uploadUserMedia(
  userId: string,
  file: File,
  name: string
) {
  await assertStorageAvailable(userId, file.size)
  const bytes = new Uint8Array(await file.arrayBuffer())
  const detected = validateMediaUpload({
    bytes: bytes.subarray(0, 16),
    mimeType: file.type,
    fileSize: file.size,
  })
  const id = crypto.randomUUID()
  const storageKey = `users/${userId}/${id}/original.${detected.extension}`
  await putMediaObject(storageKey, bytes, file.type)
  const [asset] = await db
    .insert(mediaAssets)
    .values({
      id,
      ownerUserId: userId,
      kind: detected.kind,
      source: "upload",
      status: detected.kind === "image" ? "ready" : "queued",
      name: name.trim().slice(0, 100) || file.name.slice(0, 100),
      storageKey,
      mimeType: file.type,
      fileSize: file.size,
    })
    .returning()
  if (asset.status === "queued") {
    const { enqueueMediaProcessing } = await import("@/server/queue")
    await enqueueMediaProcessing(asset.id)
  }
  return asset
}

export async function finalizeProcessedUpload(
  asset: MediaAsset,
  processedKey: string,
  mimeType: string,
  fileSize: number,
  database: PomoderDb = db
) {
  await database.transaction(async (transaction) => {
    const [updated] = await transaction
      .update(mediaAssets)
      .set({
        status: "ready",
        storageKey: processedKey,
        mimeType,
        fileSize,
        updatedAt: new Date(),
      })
      .where(eq(mediaAssets.id, asset.id))
      .returning({ id: mediaAssets.id })
    if (!updated) throw new Error("MEDIA_NOT_FOUND")
    if (asset.storageKey !== processedKey) {
      await transaction
        .insert(storageDeletionJobs)
        .values({ storageKey: asset.storageKey })
        .onConflictDoNothing()
    }
  })
}

export async function getViewableMedia(userId: string, mediaId: string) {
  const [asset] = await db
    .select()
    .from(mediaAssets)
    .where(
      and(
        eq(mediaAssets.id, mediaId),
        or(eq(mediaAssets.ownerUserId, userId), isNull(mediaAssets.ownerUserId))
      )
    )
    .limit(1)
  if (!asset || asset.status !== "ready") throw new Error("MEDIA_NOT_FOUND")
  return asset
}

// The route reads the stream to the client and the worker reads it to bytes, so
// both R2 responses and the local fallback expose these two readers.
type StoredObjectBody = {
  transformToWebStream: () => ReadableStream
  transformToByteArray: () => Promise<Uint8Array>
}
type StoredObject = {
  Body?: StoredObjectBody
  ContentLength?: number
  ContentRange?: string
}

export async function getMediaObject(
  storageKey: string,
  range: string | null
): Promise<StoredObject> {
  if (localMediaFallbackActive()) return localGetObject(storageKey, range)
  const output = await r2().send(
    new GetObjectCommand({
      Bucket: bucket(),
      Key: storageKey,
      Range: range || undefined,
    })
  )
  return output as unknown as StoredObject
}

export async function putMediaObject(
  storageKey: string,
  body: Uint8Array,
  contentType: string
) {
  if (localMediaFallbackActive()) {
    const target = localStoragePath(storageKey)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, body)
    return
  }
  await r2().send(
    new PutObjectCommand({
      Bucket: bucket(),
      Key: storageKey,
      Body: body,
      ContentType: contentType,
    })
  )
}

export async function deleteMediaObject(storageKey: string) {
  if (localMediaFallbackActive()) {
    await unlink(localStoragePath(storageKey)).catch(() => undefined)
    return
  }
  await r2().send(
    new DeleteObjectCommand({ Bucket: bucket(), Key: storageKey })
  )
}

export async function mediaObjectExists(storageKey: string) {
  if (localMediaFallbackActive()) {
    return stat(localStoragePath(storageKey))
      .then(() => true)
      .catch(() => false)
  }
  try {
    await r2().send(
      new HeadObjectCommand({ Bucket: bucket(), Key: storageKey })
    )
    return true
  } catch {
    return false
  }
}

// Local-disk fallback for development, used only outside production when R2 is
// not configured. In production this never runs: a missing R2 config still
// fails loudly via r2() rather than silently writing to ephemeral local disk.
function localMediaFallbackActive() {
  return process.env.NODE_ENV !== "production" && !r2Configured()
}

function localStorageRoot() {
  return process.env.POMODER_LOCAL_STORAGE_DIR || path.join(process.cwd(), ".local-media")
}

function localStoragePath(storageKey: string) {
  // Storage keys are always generated server-side (users/<uuid>/…). Reject
  // anything that could escape the storage root as defense in depth.
  if (!/^[A-Za-z0-9/_.-]+$/.test(storageKey) || storageKey.includes(".."))
    throw new Error("INVALID_STORAGE_KEY")
  return path.join(localStorageRoot(), storageKey)
}

function bufferToWebStream(bytes: Uint8Array): ReadableStream {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(bytes)
      controller.close()
    },
  })
}

async function localGetObject(
  storageKey: string,
  range: string | null
): Promise<StoredObject> {
  const bytes = new Uint8Array(await readFile(localStoragePath(storageKey)))
  const asObject = (slice: Uint8Array, contentRange?: string): StoredObject => ({
    Body: {
      transformToWebStream: () => bufferToWebStream(slice),
      transformToByteArray: async () => slice,
    },
    ContentLength: slice.length,
    ContentRange: contentRange,
  })
  const match = range ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null
  if (!match) return asObject(bytes)
  const total = bytes.length
  let start: number
  let end = total - 1
  if (match[1] === "" && match[2] !== "") {
    // Suffix range: the last N bytes (e.g. "bytes=-500").
    start = Math.max(0, total - Number.parseInt(match[2], 10))
  } else {
    start = match[1] ? Number.parseInt(match[1], 10) : 0
    if (match[2]) end = Number.parseInt(match[2], 10)
  }
  if (!Number.isFinite(start) || start < 0) start = 0
  if (!Number.isFinite(end) || end >= total) end = total - 1
  if (start > end) return asObject(bytes)
  return asObject(bytes.subarray(start, end + 1), `bytes ${start}-${end}/${total}`)
}

function r2Configured() {
  return Boolean(
    process.env.POMODER_R2_ACCOUNT_ID &&
      process.env.POMODER_R2_ACCESS_KEY_ID &&
      process.env.POMODER_R2_SECRET_ACCESS_KEY &&
      process.env.POMODER_R2_BUCKET_NAME
  )
}

function detectMedia(
  bytes: Uint8Array
): { kind: MediaKind; extension: string; mimeType: string } | null {
  const starts = (...values: number[]) =>
    values.every((value, index) => bytes[index] === value)
  const text = (start: number, length: number) =>
    String.fromCharCode(...bytes.slice(start, start + length))
  if (starts(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))
    return { kind: "image", extension: "png", mimeType: "image/png" }
  if (starts(0xff, 0xd8, 0xff))
    return { kind: "image", extension: "jpg", mimeType: "image/jpeg" }
  if (text(0, 4) === "RIFF" && text(8, 4) === "WEBP")
    return { kind: "image", extension: "webp", mimeType: "image/webp" }
  if (
    text(0, 3) === "ID3" ||
    (bytes[0] === 0xff && [0xfb, 0xf3, 0xf2].includes(bytes[1]))
  )
    return { kind: "audio", extension: "mp3", mimeType: "audio/mpeg" }
  if (text(0, 4) === "RIFF" && text(8, 4) === "WAVE")
    return { kind: "audio", extension: "wav", mimeType: "audio/wav" }
  if (text(0, 4) === "OggS")
    return { kind: "audio", extension: "ogg", mimeType: "audio/ogg" }
  if (text(4, 4) === "ftyp")
    return { kind: "video", extension: "mp4", mimeType: "video/mp4" }
  if (starts(0x1a, 0x45, 0xdf, 0xa3))
    return { kind: "video", extension: "webm", mimeType: "video/webm" }
  return null
}

let client: S3Client | null = null
function r2() {
  const accountId = process.env.POMODER_R2_ACCOUNT_ID
  const accessKeyId = process.env.POMODER_R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.POMODER_R2_SECRET_ACCESS_KEY
  if (!accountId || !accessKeyId || !secretAccessKey)
    throw new Error("STORAGE_NOT_CONFIGURED")
  client ??= new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })
  return client
}
function bucket() {
  const value = process.env.POMODER_R2_BUCKET_NAME
  if (!value) throw new Error("STORAGE_NOT_CONFIGURED")
  return value
}
