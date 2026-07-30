import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"

export class R2StorageNotConfiguredError extends Error {}

function getR2Setting(name: string) {
  const value = process.env[name]
  if (value) {
    return value
  }
  throw new R2StorageNotConfiguredError(`${name} is not configured`)
}

function getBucketName() {
  return getR2Setting("CUSTOM_SHELL_R2_BUCKET_NAME")
}

export function getPublicMediaUrl(storagePath: string) {
  const baseUrl = getR2Setting("CUSTOM_SHELL_R2_PUBLIC_URL").replace(/\/+$/, "")
  const key = storagePath.replace(/^\/+/, "")
  return `${baseUrl}/${key}`
}

function getR2Client() {
  const accountId = getR2Setting("CUSTOM_SHELL_R2_ACCOUNT_ID")
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: getR2Setting("CUSTOM_SHELL_R2_ACCESS_KEY_ID"),
      secretAccessKey: getR2Setting("CUSTOM_SHELL_R2_SECRET_ACCESS_KEY"),
    },
  })
}

export async function uploadToR2(
  storagePath: string,
  data: Uint8Array,
  contentType: string
) {
  getPublicMediaUrl(storagePath)

  await getR2Client().send(
    new PutObjectCommand({
      Bucket: getBucketName(),
      Key: storagePath,
      Body: data,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    })
  )
}

export async function deleteFromR2(storagePath: string) {
  await getR2Client().send(
    new DeleteObjectCommand({
      Bucket: getBucketName(),
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
  const client = getR2Client()
  const bucket = getBucketName()
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
  return getR2Client().send(
    new GetObjectCommand({
      Bucket: getBucketName(),
      Key: storagePath,
      Range: range || undefined,
    })
  )
}
