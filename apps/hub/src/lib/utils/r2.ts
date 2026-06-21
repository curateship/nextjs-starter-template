import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'

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

  // Return full public URL
  if (R2_PUBLIC_URL) {
    return `${R2_PUBLIC_URL}/${fileName}`
  }
  return `/cdn/${fileName}`
}

export async function uploadPrivateToR2(
  fileName: string,
  fileBuffer: Buffer,
  contentType: string
): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: fileName,
    Body: fileBuffer,
    ContentType: contentType,
  })

  await r2Client.send(command)
  return fileName
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
 * Get object from R2 (for proxying)
 */
export async function getFromR2(fileName: string, range?: string | null) {
  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: fileName,
    Range: range || undefined,
  })

  const response = await r2Client.send(command)
  return response
}
