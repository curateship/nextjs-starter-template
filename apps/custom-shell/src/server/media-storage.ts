import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"

export class R2StorageNotConfiguredError extends Error {}

function getR2Setting(name: string, fallbackName?: string) {
  const value = process.env[name] || (fallbackName ? process.env[fallbackName] : "")
  if (value) {
    return value
  }
  throw new R2StorageNotConfiguredError(`${name} is not configured`)
}

function getBucketName() {
  return process.env.CUSTOM_SHELL_R2_BUCKET_NAME || process.env.R2_BUCKET_NAME || "custom-shell-media"
}

function getR2Client() {
  const accountId = getR2Setting("CUSTOM_SHELL_R2_ACCOUNT_ID", "R2_ACCOUNT_ID")
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: getR2Setting("CUSTOM_SHELL_R2_ACCESS_KEY_ID", "R2_ACCESS_KEY_ID"),
      secretAccessKey: getR2Setting("CUSTOM_SHELL_R2_SECRET_ACCESS_KEY", "R2_SECRET_ACCESS_KEY"),
    },
  })
}

export async function uploadToR2(
  storagePath: string,
  data: Uint8Array,
  contentType: string
) {
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: getBucketName(),
      Key: storagePath,
      Body: data,
      ContentType: contentType,
      CacheControl: "private, max-age=31536000, immutable",
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

export async function getFromR2(storagePath: string, range?: string | null) {
  return getR2Client().send(
    new GetObjectCommand({
      Bucket: getBucketName(),
      Key: storagePath,
      Range: range || undefined,
    })
  )
}
