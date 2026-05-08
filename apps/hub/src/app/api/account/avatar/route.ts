import { randomUUID } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/actions/auth/server'
import { db } from '@/lib/db'
import { media } from '@/lib/db/schema'
import { deleteFromR2, uploadToR2 } from '@/lib/utils/r2'
import { getClientIp, isRateLimited } from '@/lib/utils/rate-limit'
import { isSameOriginRequest } from '@/lib/utils/request-origin'

const AVATAR_IMAGE_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
}
const AVATAR_MAX_BYTES = 5 * 1024 * 1024
const AVATAR_WINDOW_MS = 15 * 60 * 1000
const AVATAR_MAX_REQUESTS = 10

type DetectedAvatarImage = {
  mimeType: keyof typeof AVATAR_IMAGE_TYPES
  extension: string
}

function getCleanBaseName(fileName: string) {
  return fileName
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9.-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'avatar'
}

function startsWithBytes(buffer: Buffer, bytes: number[]) {
  return bytes.every((byte, index) => buffer[index] === byte)
}

function detectAvatarImage(buffer: Buffer): DetectedAvatarImage | null {
  if (buffer.length < 12) return null

  if (startsWithBytes(buffer, [0xff, 0xd8, 0xff])) {
    return { mimeType: 'image/jpeg', extension: 'jpg' }
  }

  if (startsWithBytes(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return { mimeType: 'image/png', extension: 'png' }
  }

  const gifSignature = buffer.subarray(0, 6).toString('ascii')
  if (gifSignature === 'GIF87a' || gifSignature === 'GIF89a') {
    return { mimeType: 'image/gif', extension: 'gif' }
  }

  const riffSignature = buffer.subarray(0, 4).toString('ascii')
  const webpSignature = buffer.subarray(8, 12).toString('ascii')
  if (riffSignature === 'RIFF' && webpSignature === 'WEBP') {
    return { mimeType: 'image/webp', extension: 'webp' }
  }

  return null
}

function declaredTypeMatches(fileType: string, detectedType: DetectedAvatarImage['mimeType']) {
  if (fileType === detectedType) return true
  return fileType === 'image/jpg' && detectedType === 'image/jpeg'
}

export async function POST(request: NextRequest) {
  if (!isSameOriginRequest(request)) {
    return NextResponse.json({ error: 'Invalid origin' }, { status: 403 })
  }

  const session = await auth.api.getSession({ headers: request.headers })
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
  }

  const ip = getClientIp(request.headers)
  if (
    isRateLimited(`account-avatar:user:${session.user.id}`, AVATAR_MAX_REQUESTS, AVATAR_WINDOW_MS) ||
    (ip && isRateLimited(`account-avatar:ip:${ip}`, AVATAR_MAX_REQUESTS, AVATAR_WINDOW_MS))
  ) {
    return NextResponse.json({ error: 'Too many avatar uploads. Try again later.' }, { status: 429 })
  }

  const formData = await request.formData().catch(() => null)
  const file = formData?.get('file')

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  if (!AVATAR_IMAGE_TYPES[file.type]) {
    return NextResponse.json({ error: 'Only JPEG, PNG, GIF, and WebP images are allowed.' }, { status: 400 })
  }

  if (file.size <= 0 || file.size > AVATAR_MAX_BYTES) {
    return NextResponse.json({ error: 'Avatar image must be 5MB or smaller.' }, { status: 400 })
  }

  const arrayBuffer = await file.arrayBuffer()
  const fileBuffer = Buffer.from(arrayBuffer)
  const detectedImage = detectAvatarImage(fileBuffer)
  if (!detectedImage || !declaredTypeMatches(file.type, detectedImage.mimeType)) {
    return NextResponse.json({ error: 'Uploaded file is not a valid image.' }, { status: 400 })
  }

  const cleanBaseName = getCleanBaseName(file.name)
  const storagePath = `avatars/${session.user.id}/${Date.now()}-${randomUUID()}-${cleanBaseName}.${detectedImage.extension}`
  let mediaId: string | null = null

  try {
    const publicUrl = await uploadToR2(storagePath, fileBuffer, detectedImage.mimeType)

    const [mediaData] = await db
      .insert(media)
      .values({
        userId: session.user.id,
        siteId: null,
        filename: storagePath.split('/').pop() || `${cleanBaseName}.${detectedImage.extension}`,
        originalName: file.name || `${cleanBaseName}.${detectedImage.extension}`,
        altText: 'Profile avatar',
        fileSize: file.size,
        mimeType: detectedImage.mimeType,
        fileType: 'image',
        storagePath,
        publicUrl,
      })
      .returning({ id: media.id, publicUrl: media.publicUrl })

    if (!mediaData) {
      await deleteFromR2(storagePath).catch(() => {})
      return NextResponse.json({ error: 'Failed to save avatar' }, { status: 500 })
    }

    mediaId = mediaData.id

    await auth.api.updateUser({
      body: {
        image: mediaData.publicUrl,
      },
      headers: request.headers,
    })

    return NextResponse.json({
      data: {
        public_url: mediaData.publicUrl,
      },
      error: null,
    })
  } catch (error) {
    if (mediaId) {
      await db.delete(media).where(eq(media.id, mediaId)).catch(() => {})
    }
    await deleteFromR2(storagePath).catch(() => {})

    console.error('Avatar upload failed:', error)
    return NextResponse.json({ error: 'Failed to upload avatar' }, { status: 500 })
  }
}
