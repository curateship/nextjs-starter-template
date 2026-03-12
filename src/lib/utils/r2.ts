import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// R2 credentials from environment variables
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID!
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'site-media'
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL // Optional: if using public access

// Create S3 client configured for R2
const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
})

/**
 * Upload a file to R2
 */
export async function uploadToR2(
  fileName: string,
  fileBuffer: Buffer,
  contentType: string
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: fileName,
    Body: fileBuffer,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000, immutable',
  })

  await r2Client.send(command)

  // Return public URL
  if (R2_PUBLIC_URL) {
    return `${R2_PUBLIC_URL}/${fileName}`
  }

  // Or return URL through your proxy
  return `/api/media/proxy?url=${encodeURIComponent(`r2://${fileName}`)}`
}

/**
 * Delete a file from R2
 */
export async function deleteFromR2(fileName: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: fileName,
  })

  await r2Client.send(command)
}

/**
 * Get a presigned URL for private file access (expires in 1 hour)
 */
export async function getPresignedUrl(fileName: string, expiresIn = 3600): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: fileName,
  })

  const url = await getSignedUrl(r2Client, command, { expiresIn })
  return url
}

/**
 * Get public URL for a file
 */
export function getPublicUrl(fileName: string): string {
  if (R2_PUBLIC_URL) {
    return `${R2_PUBLIC_URL}/${fileName}`
  }

  // Fallback to proxy
  return `/api/media/proxy?url=${encodeURIComponent(`r2://${fileName}`)}`
}

/**
 * Get object from R2 (for proxying)
 */
export async function getFromR2(fileName: string) {
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: fileName,
  })

  const response = await r2Client.send(command)
  return response
}
