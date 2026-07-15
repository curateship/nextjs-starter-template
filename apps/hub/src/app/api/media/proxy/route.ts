import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { media } from '@/lib/db/schema'
import { getFromR2 } from '@/lib/utils/r2'
import { parseExternalMediaUrl, parseR2MediaKey } from '@/lib/utils/media-proxy'
import { getClientIp, isRateLimited } from '@/lib/utils/rate-limit'

// Timeout for fetch requests (10 seconds)
const FETCH_TIMEOUT = 10000
const MAX_RESPONSE_BYTES = 100 * 1024 * 1024
const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX_REQUESTS = 240

function isOversized(contentLength?: number | string | null) {
  if (contentLength == null || contentLength === '') return false
  const length = Number(contentLength)
  return Number.isFinite(length) && length > MAX_RESPONSE_BYTES
}

function limitedStream(body: ReadableStream<Uint8Array>) {
  let bytesRead = 0
  return body.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytesRead += chunk.byteLength
      if (bytesRead > MAX_RESPONSE_BYTES) {
        controller.error(new Error('Media response exceeded size limit'))
        return
      }
      controller.enqueue(chunk)
    },
  }))
}

function applyRateLimit(request: NextRequest) {
  const ip = getClientIp(request.headers) || 'unknown'
  return isRateLimited(`media-proxy:${ip}`, RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS)
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')

  if (!url) {
    return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 })
  }

  try {
    const range = request.headers.get('range')

    // Check if it's an R2 URL
    if (url.startsWith('r2://')) {
      const parsedKey = parseR2MediaKey(url)
      if (parsedKey.error || !parsedKey.key) {
        return NextResponse.json({ error: parsedKey.error || 'Invalid R2 media key' }, { status: 400 })
      }
      const mediaKey = parsedKey.key

      const publicMedia = await db.query.media.findFirst({
        where: eq(media.storagePath, mediaKey),
        columns: { id: true },
      })

      if (!publicMedia) {
        return NextResponse.json({ error: 'Media not found' }, { status: 404 })
      }

      if (applyRateLimit(request)) {
        return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
      }

      const r2Object = await getFromR2(mediaKey, range)

      if (!r2Object.Body) {
        throw new Error('No body in R2 response')
      }
      if (isOversized(r2Object.ContentLength)) {
        return NextResponse.json({ error: 'Media response too large' }, { status: 413 })
      }

      const contentType = r2Object.ContentType || 'application/octet-stream'
      const contentLength = r2Object.ContentLength?.toString()
      const contentRange = r2Object.ContentRange
      const headers: Record<string, string> = {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Accept-Ranges': 'bytes',
      }

      if (contentLength) headers['Content-Length'] = contentLength
      if (contentRange) headers['Content-Range'] = contentRange

      return new NextResponse(toBodyInit(r2Object.Body), {
        status: range && contentRange ? 206 : 200,
        headers,
      })
    }

    const parsed = parseExternalMediaUrl(url)
    if (!parsed.url) {
      const status = parsed.error === 'host_not_allowed' ? 403 : 400
      return NextResponse.json({ error: parsed.error === 'host_not_allowed' ? 'URL host not allowed' : 'Invalid URL' }, { status })
    }
    if (applyRateLimit(request)) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

    try {
      const response = await fetch(parsed.url.toString(), {
        signal: controller.signal,
        redirect: 'manual',
        headers: range ? { Range: range } : {},
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`Failed to fetch media: ${response.status}`)
      }

      const contentType = response.headers.get('content-type') || 'application/octet-stream'
      const contentLength = response.headers.get('content-length')
      const contentRange = response.headers.get('content-range')
      if (isOversized(contentLength)) {
        await response.body?.cancel()
        return NextResponse.json({ error: 'Media response too large' }, { status: 413 })
      }
      const responseBody = response.body ? limitedStream(response.body) : null
      const responseHeaders = new Headers({
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Accept-Ranges': 'bytes',
      })
      if (contentLength) responseHeaders.set('Content-Length', contentLength)
      if (contentRange) responseHeaders.set('Content-Range', contentRange)

      if (range && contentRange) {
        return new NextResponse(responseBody, {
          status: 206,
          headers: responseHeaders,
        })
      }

      return new NextResponse(responseBody, {
        headers: responseHeaders,
      })
    } catch (error) {
      clearTimeout(timeoutId)
      throw error
    }

  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`Media proxy timeout after ${FETCH_TIMEOUT}ms`)
      return NextResponse.json(
        { error: 'Request timeout - media server took too long to respond' },
        { status: 504 }
      )
    }

    console.error('Media proxy error:', error)
    return NextResponse.json({ error: 'Failed to proxy media' }, { status: 500 })
  }
}

function toBodyInit(body: NonNullable<Awaited<ReturnType<typeof getFromR2>>['Body']>): BodyInit {
  if (
    typeof body === 'object'
    && body !== null
    && 'transformToWebStream' in body
    && typeof body.transformToWebStream === 'function'
  ) {
    return body.transformToWebStream()
  }

  return body as BodyInit
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Range, Content-Range, Content-Length',
    },
  })
}
