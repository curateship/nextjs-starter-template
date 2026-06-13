import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
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
  return getR2Setting("AI_VIDEO_R2_BUCKET_NAME")
}

export function getPublicMediaUrl(storagePath: string) {
  const baseUrl = getR2Setting("AI_VIDEO_R2_PUBLIC_URL").replace(/\/+$/, "")
  const key = storagePath.replace(/^\/+/, "")
  return `${baseUrl}/${key}`
}

function getR2Client() {
  const accountId = getR2Setting("AI_VIDEO_R2_ACCOUNT_ID")
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: getR2Setting("AI_VIDEO_R2_ACCESS_KEY_ID"),
      secretAccessKey: getR2Setting("AI_VIDEO_R2_SECRET_ACCESS_KEY"),
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

// Server-side copy within the bucket (no download/re-upload). Used to give a
// template its own footage/thumbnail so it survives deletion of the source reel.
export async function copyR2Object(sourcePath: string, destPath: string) {
  const bucket = getBucketName()
  await getR2Client().send(
    new CopyObjectCommand({
      Bucket: bucket,
      // CopySource is the URL-encoded "bucket/key"; metadata (type, cache) copies.
      CopySource: encodeURI(`${bucket}/${sourcePath.replace(/^\/+/, "")}`),
      Key: destPath.replace(/^\/+/, ""),
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

// Coerce a GetObject body into something `new Response()` accepts — the SDK
// exposes a web stream via transformToWebStream in this runtime.
export function toBodyInit(body: unknown): BodyInit {
  if (
    body &&
    typeof body === "object" &&
    "transformToWebStream" in body &&
    typeof body.transformToWebStream === "function"
  ) {
    return body.transformToWebStream() as ReadableStream
  }
  return body as BodyInit
}

// Collect a GetObject response body into bytes; the SDK's stream type varies
// by runtime, so probe its transform helpers.
export async function bodyToBytes(body: unknown): Promise<Uint8Array> {
  if (
    body &&
    typeof body === "object" &&
    "transformToByteArray" in body &&
    typeof body.transformToByteArray === "function"
  ) {
    return body.transformToByteArray() as Promise<Uint8Array>
  }

  if (
    body &&
    typeof body === "object" &&
    "transformToWebStream" in body &&
    typeof body.transformToWebStream === "function"
  ) {
    const stream = body.transformToWebStream() as ReadableStream
    return new Uint8Array(await new Response(stream).arrayBuffer())
  }

  if (body instanceof Uint8Array) {
    return body
  }

  throw new Error("Failed to read stored file")
}
