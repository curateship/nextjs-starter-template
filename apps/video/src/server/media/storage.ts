import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"

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
 * The message says Settings first and the environment variable second, because
 * Settings → Storage is now where this is filled in and the variables are only
 * still read so an older deployment keeps working.
 */
function requireSetting(config: StorageConfig, field: StorageField) {
  const entry = config[field]
  if (entry.value) return entry.value
  if (entry.unreadable) {
    throw new R2StorageNotConfiguredError(
      `The storage ${STORAGE_FIELD_LABEL[field]} can't be read back. Paste it again in Settings → Storage.`
    )
  }
  throw new R2StorageNotConfiguredError(
    `The storage ${STORAGE_FIELD_LABEL[field]} is not set. Add it in Settings → Storage.`
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
async function openBucket() {
  const config = await getStorageConfig()
  const accountId = requireSetting(config, "accountId")
  const client = new S3Client({
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
