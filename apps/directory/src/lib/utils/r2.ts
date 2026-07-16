import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

// R2 credentials from environment variables
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID!
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID!
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY!
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'site-media'
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL // Optional: if using public access
const HAS_R2_CREDENTIALS = Boolean(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY)
const USE_LOCAL_STORAGE = process.env.NODE_ENV !== 'production' && !HAS_R2_CREDENTIALS
const LOCAL_STORAGE_ROOT = path.resolve(process.cwd(), '.local-storage', R2_BUCKET_NAME)
const LOCAL_OBJECT_URL_PREFIX = 'local-'
const MAX_OBJECT_KEY_BYTES = 1024
const MAX_ENCODED_OBJECT_KEY_LENGTH = Math.ceil(MAX_OBJECT_KEY_BYTES * 4 / 3)

// Create S3 client configured for R2
const r2Client = HAS_R2_CREDENTIALS
  ? new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    })
  : null

export function usesLocalObjectStorage() {
  return USE_LOCAL_STORAGE
}

export function getLocalObjectUrl(fileName: string) {
  resolveLocalObjectPath(fileName)
  return `/cdn/${LOCAL_OBJECT_URL_PREFIX}${Buffer.from(fileName).toString('base64url')}`
}

export function parseLocalObjectUrlPath(objectPath: string) {
  if (!objectPath.startsWith(LOCAL_OBJECT_URL_PREFIX)) return null

  try {
    const encodedKey = objectPath.slice(LOCAL_OBJECT_URL_PREFIX.length)
    if (!encodedKey || encodedKey.length > MAX_ENCODED_OBJECT_KEY_LENGTH || !/^[A-Za-z0-9_-]+$/.test(encodedKey)) return null

    const keyBuffer = Buffer.from(encodedKey, 'base64url')
    if (keyBuffer.length > MAX_OBJECT_KEY_BYTES || keyBuffer.toString('base64url') !== encodedKey) return null

    const fileName = keyBuffer.toString('utf8')
    if (!Buffer.from(fileName, 'utf8').equals(keyBuffer)) return null
    resolveLocalObjectPath(fileName)
    return fileName
  } catch {
    return null
  }
}

export function resolveLocalObjectPath(fileName: string, root = LOCAL_STORAGE_ROOT) {
  const normalizedRoot = path.resolve(root)
  const segments = fileName.split('/')

  if (
    !fileName
    || Buffer.byteLength(fileName) > MAX_OBJECT_KEY_BYTES
    || fileName.includes('\0')
    || fileName.includes('\\')
    || path.isAbsolute(fileName)
    || segments.some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    throw new Error('Invalid object storage key')
  }

  const resolvedPath = path.resolve(normalizedRoot, ...segments)
  if (!resolvedPath.startsWith(`${normalizedRoot}${path.sep}`)) {
    throw new Error('Invalid object storage key')
  }

  return resolvedPath
}

function requireR2Client() {
  if (!r2Client) {
    throw new Error('R2 object storage is not configured')
  }
  return r2Client
}

async function writeLocalObject(fileName: string, fileBuffer: Buffer) {
  const localPath = resolveLocalObjectPath(fileName)
  await mkdir(path.dirname(localPath), { recursive: true })
  await writeFile(localPath, fileBuffer)
}

function getContentType(fileName: string) {
  const extension = path.extname(fileName).toLowerCase()
  const contentTypes: Record<string, string> = {
    '.avif': 'image/avif',
    '.gif': 'image/gif',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.mkv': 'video/x-matroska',
    '.mov': 'video/quicktime',
    '.mp4': 'video/mp4',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webm': 'video/webm',
    '.webp': 'image/webp',
  }
  return contentTypes[extension] || 'application/octet-stream'
}

function getLocalRange(fileBuffer: Buffer, range?: string | null) {
  if (!range) return { body: fileBuffer, contentRange: undefined }

  const match = /^bytes=(\d+)-(\d*)$/.exec(range)
  if (!match) return { body: fileBuffer, contentRange: undefined }

  const start = Number(match[1])
  const requestedEnd = match[2] ? Number(match[2]) : fileBuffer.length - 1
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start > requestedEnd || start >= fileBuffer.length) {
    return { body: fileBuffer, contentRange: undefined }
  }

  const end = Math.min(requestedEnd, fileBuffer.length - 1)
  return {
    body: fileBuffer.subarray(start, end + 1),
    contentRange: `bytes ${start}-${end}/${fileBuffer.length}`,
  }
}

/**
 * Upload a file to R2
 */
export async function uploadToR2(
  fileName: string,
  fileBuffer: Buffer,
  contentType: string
): Promise<string> {
  if (USE_LOCAL_STORAGE) {
    await writeLocalObject(fileName, fileBuffer)
    return getLocalObjectUrl(fileName)
  }

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: fileName,
    Body: fileBuffer,
    ContentType: contentType,
    CacheControl: 'public, max-age=31536000, immutable',
  })

  await requireR2Client().send(command)

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
  if (USE_LOCAL_STORAGE) {
    await writeLocalObject(fileName, fileBuffer)
    return fileName
  }

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: fileName,
    Body: fileBuffer,
    ContentType: contentType,
  })

  await requireR2Client().send(command)
  return fileName
}

/**
 * Delete a file from R2
 */
export async function deleteFromR2(fileName: string): Promise<void> {
  if (USE_LOCAL_STORAGE) {
    await rm(resolveLocalObjectPath(fileName), { force: true })
    return
  }

  const command = new DeleteObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: fileName,
  })

  await requireR2Client().send(command)
}

/**
 * Get object from R2 (for proxying)
 */
export async function getFromR2(fileName: string, range?: string | null) {
  if (USE_LOCAL_STORAGE) {
    const fileBuffer = await readFile(resolveLocalObjectPath(fileName))
    const { body, contentRange } = getLocalRange(fileBuffer, range)
    return {
      Body: body,
      ContentLength: body.length,
      ContentRange: contentRange,
      ContentType: getContentType(fileName),
    }
  }

  const command = new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: fileName,
    Range: range || undefined,
  })

  const response = await requireR2Client().send(command)
  return response
}
