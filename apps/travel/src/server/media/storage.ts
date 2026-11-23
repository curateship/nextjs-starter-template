import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  ListPartsCommand,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
  type S3ClientConfig,
} from "@aws-sdk/client-s3"
import { getSignedUrl } from "@aws-sdk/s3-request-presigner"
import { open, stat } from "node:fs/promises"

import {
  videoUploadPartBytes,
  videoUploadPartCount,
  videoUploadPieceBytes,
} from "@/lib/media/media-upload"

import {
  getStorageConfig,
  STORAGE_FIELD_LABEL,
  type StorageConfig,
  type StorageField,
} from "@/server/media/storage-settings"

export class R2StorageNotConfiguredError extends Error {}

/**
 * One setting, or a refusal naming what is missing and where to put it.
 *
 * The message says Settings first and the environment variable second,
 * because the Cloudflare R2 card on General settings is now where this is
 * filled in and the variables are only still read so an older deployment keeps
 * working.
 */
function requireSetting(config: StorageConfig, field: StorageField) {
  const entry = config[field]
  if (entry.value) return entry.value
  if (entry.unreadable) {
    throw new R2StorageNotConfiguredError(
      `The storage ${STORAGE_FIELD_LABEL[field]} can't be read back. Paste it again on Settings → General settings, under Cloudflare R2.`
    )
  }
  throw new R2StorageNotConfiguredError(
    `The storage ${STORAGE_FIELD_LABEL[field]} is not set. Add it on Settings → General settings, under Cloudflare R2.`
  )
}

/**
 * The address a browser fetches this file from. Async because the bucket's
 * details live in the database now, not in the process's environment.
 */
export async function getPublicMediaUrl(storagePath: string) {
  const config = await getStorageConfig()
  const baseUrl = requireSetting(config, "publicUrl").replace(/\/+$/, "")
  const key = storagePath.replace(/^\/+/, "")
  return `${baseUrl}/${key}`
}

/**
 * The client and the bucket together, from one read of the settings. Every
 * operation needs both, and asking twice invites the two halves to disagree if
 * a save lands between them.
 */
async function openBucket(options: Partial<S3ClientConfig> = {}) {
  const config = await getStorageConfig()
  const accountId = requireSetting(config, "accountId")
  const client = new S3Client({
    ...options,
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requireSetting(config, "accessKeyId"),
      secretAccessKey: requireSetting(config, "secretAccessKey"),
    },
  })
  return { client, bucket: requireSetting(config, "bucketName") }
}

export async function uploadToR2(
  storagePath: string,
  data: Uint8Array,
  contentType: string
) {
  const { client, bucket } = await openBucket()
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: storagePath,
      Body: data,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    })
  )
}

/**
 * Sends a file from disk to the bucket, so a big file never sits in memory.
 *
 * A file of one piece or less goes in one request. Anything bigger goes in
 * pieces of the size a browser upload of the same file would use (10MB, more
 * past about 100GB), four at a time, each read off disk just before it is
 * sent. At most four pieces are in memory at once, 40MB for anything under
 * 100GB. A piece that fails is sent again, up to three tries; after that the
 * pieces already sent are thrown away and the error is passed on.
 */
export async function uploadFileToR2(
  storagePath: string,
  filePath: string,
  contentType: string
) {
  const { size } = await stat(filePath)
  const partBytes = videoUploadPartBytes(size)
  const file = await open(filePath, "r")
  try {
    if (size <= partBytes) {
      const bytes = Buffer.alloc(size)
      const { bytesRead } = await file.read(bytes, 0, size, 0)
      if (bytesRead !== size) throw new Error("The file changed while it was being sent")
      await uploadToR2(storagePath, bytes, contentType)
      return { size }
    }

    const { client, bucket } = await openBucket()
    const uploadId = await startMultipartUpload(storagePath, contentType)
    const partCount = videoUploadPartCount(size)
    const etags = new Array<string>(partCount)
    let next = 1
    const sendPieces = async () => {
      while (next <= partCount) {
        const partNumber = next
        next += 1
        const length = videoUploadPieceBytes(size, partNumber)
        const body = Buffer.alloc(length)
        const { bytesRead } = await file.read(body, 0, length, (partNumber - 1) * partBytes)
        if (bytesRead !== length) throw new Error("The file changed while it was being sent")
        for (let attempt = 1; ; attempt += 1) {
          try {
            const response = await client.send(
              new UploadPartCommand({
                Bucket: bucket,
                Key: storagePath,
                UploadId: uploadId,
                PartNumber: partNumber,
                Body: body,
                ContentLength: length,
              })
            )
            if (!response.ETag) throw new Error("The bucket kept no receipt for a piece")
            etags[partNumber - 1] = response.ETag
            break
          } catch (error) {
            if (attempt >= DISK_UPLOAD_TRIES) throw error
          }
        }
      }
    }
    try {
      await Promise.all(
        Array.from({ length: Math.min(DISK_UPLOAD_PARALLEL, partCount) }, sendPieces)
      )
      await completeMultipartUpload(
        storagePath,
        uploadId,
        etags.map((etag, index) => ({ partNumber: index + 1, etag }))
      )
    } catch (error) {
      // Stop the other pieces taking new work, then throw away what landed.
      next = partCount + 1
      await abortMultipartUpload(storagePath, uploadId).catch(() => undefined)
      throw error
    }
    return { size }
  } finally {
    await file.close()
  }
}

const DISK_UPLOAD_PARALLEL = 4
const DISK_UPLOAD_TRIES = 3

/**
 * Opens an upload that arrives in pieces. Nothing appears in the bucket, and
 * nothing shows in a listing, until `completeMultipartUpload` joins them.
 */
export async function startMultipartUpload(
  storagePath: string,
  contentType: string
) {
  const { client, bucket } = await openBucket()
  const response = await client.send(
    new CreateMultipartUploadCommand({
      Bucket: bucket,
      Key: storagePath,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    })
  )
  if (!response.UploadId) {
    throw new Error("The storage bucket did not open the upload.")
  }
  return response.UploadId
}

/**
 * A short-lived address the browser sends one piece to, so the piece goes
 * straight to the bucket and never through this server. The piece's size is
 * part of the signature, so the bucket refuses a body of any other length.
 * The browser sets that length from the bytes itself and a page cannot change
 * it.
 */
export async function signUploadPart(
  storagePath: string,
  uploadId: string,
  partNumber: number,
  contentLength: number
) {
  // Without this the address carries a checksum worked out at signing time,
  // over no bytes at all, which only matches an empty piece. R2 ignores it
  // today; leaving it out means nothing breaks the day it starts checking.
  const { client, bucket } = await openBucket({
    requestChecksumCalculation: "WHEN_REQUIRED",
  })
  return getSignedUrl(
    client,
    new UploadPartCommand({
      Bucket: bucket,
      Key: storagePath,
      UploadId: uploadId,
      PartNumber: partNumber,
      ContentLength: contentLength,
    }),
    { expiresIn: 60 * 60, signableHeaders: new Set(["content-length"]) }
  )
}

export async function completeMultipartUpload(
  storagePath: string,
  uploadId: string,
  parts: { partNumber: number; etag: string }[]
) {
  const { client, bucket } = await openBucket()
  await client.send(
    new CompleteMultipartUploadCommand({
      Bucket: bucket,
      Key: storagePath,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts.map((part) => ({
          PartNumber: part.partNumber,
          ETag: part.etag,
        })),
      },
    })
  )
}

/**
 * The pieces an unfinished upload already holds, with each one's receipt and
 * size, so a browser that lost its place can carry on after the last one.
 * Throws the bucket's `NoSuchUpload` once the upload was finished, cancelled,
 * or cleared by R2's seven-day rule.
 */
export async function listUploadedParts(storagePath: string, uploadId: string) {
  const { client, bucket } = await openBucket()
  const parts: { partNumber: number; etag: string; size: number }[] = []
  let marker: string | undefined
  do {
    const response = await client.send(
      new ListPartsCommand({
        Bucket: bucket,
        Key: storagePath,
        UploadId: uploadId,
        PartNumberMarker: marker,
      })
    )
    for (const part of response.Parts ?? []) {
      if (part.PartNumber && part.ETag) {
        parts.push({
          partNumber: part.PartNumber,
          etag: part.ETag,
          size: part.Size ?? 0,
        })
      }
    }
    marker = response.IsTruncated ? response.NextPartNumberMarker : undefined
  } while (marker)
  return parts
}

/** Throws away every piece sent so far. The key never becomes a file. */
export async function abortMultipartUpload(storagePath: string, uploadId: string) {
  const { client, bucket } = await openBucket()
  await client.send(
    new AbortMultipartUploadCommand({
      Bucket: bucket,
      Key: storagePath,
      UploadId: uploadId,
    })
  )
}

/** The size and type the bucket holds for a file, without reading it. */
export async function describeR2Object(storagePath: string) {
  const { client, bucket } = await openBucket()
  const response = await client.send(
    new HeadObjectCommand({ Bucket: bucket, Key: storagePath })
  )
  return {
    size: response.ContentLength ?? 0,
    contentType: response.ContentType ?? "",
  }
}

export async function deleteFromR2(storagePath: string) {
  const { client, bucket } = await openBucket()
  await client.send(
    new DeleteObjectCommand({
      Bucket: bucket,
      Key: storagePath,
    })
  )
}

export type R2ObjectSummary = { key: string; size: number }

/**
 * Every object in the bucket, paged 1000 at a time. `truncated` means the cap
 * was hit before the end, so the caller must not treat a key's absence from
 * this list as proof the file is gone.
 */
export async function listR2Objects(maxKeys: number) {
  const { client, bucket } = await openBucket()
  const objects: R2ObjectSummary[] = []
  let continuationToken: string | undefined
  let more = false

  do {
    const response = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      })
    )

    for (const item of response.Contents ?? []) {
      if (item.Key) {
        objects.push({ key: item.Key, size: item.Size ?? 0 })
      }
    }

    // More pages exist but we cannot ask for them without a token. Report the
    // list as incomplete rather than letting a caller delete on the strength of
    // a key it never saw.
    more = Boolean(response.IsTruncated)
    continuationToken = more ? response.NextContinuationToken : undefined

    if (objects.length >= maxKeys || (more && !continuationToken)) {
      return { objects, truncated: more }
    }
  } while (continuationToken)

  return { objects, truncated: false }
}

/**
 * Whether the bucket already holds this key, without reading the bytes.
 *
 * The resized-image route asks this before cutting a copy, so the common case —
 * the copy was cut days ago — costs one small request instead of pulling the
 * original through the app.
 */
export async function r2ObjectExists(storagePath: string) {
  const { client, bucket } = await openBucket()
  try {
    await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: storagePath })
    )
    return true
  } catch {
    return false
  }
}

export async function getFromR2(storagePath: string, range?: string | null) {
  const { client, bucket } = await openBucket()
  return client.send(
    new GetObjectCommand({
      Bucket: bucket,
      Key: storagePath,
      Range: range || undefined,
    })
  )
}

/**
 * Asks the bucket to list one object. Proves the account, the keys and the
 * bucket name together, and changes nothing.
 *
 * The values being checked ride in rather than being read from the row, so a
 * bucket can be tested before it is saved.
 */
export async function testR2Bucket(candidate: {
  accountId: string
  accessKeyId: string
  secretAccessKey: string
  bucketName: string
}) {
  const client = new S3Client({
    region: "auto",
    endpoint: `https://${candidate.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: candidate.accessKeyId,
      secretAccessKey: candidate.secretAccessKey,
    },
  })
  await client.send(
    new ListObjectsV2Command({ Bucket: candidate.bucketName, MaxKeys: 1 })
  )
}
