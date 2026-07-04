import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { media } from '@/lib/db/schema'
import { getFromR2 } from '@/lib/utils/r2'
import { parseR2MediaKey } from '@/lib/utils/media-proxy'

// Timeout for fetch requests (10 seconds)
const FETCH_TIMEOUT = 10000

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

      const r2Object = await getFromR2(mediaKey, range)

      if (!r2Object.Body) {
        throw new Error('No body in R2 response')
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

    const parsedUrl = parseAllowedMediaUrl(url)
    if (parsedUrl instanceof NextResponse) {
      return parsedUrl
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

    try {
      const response = await fetch(parsedUrl.toString(), {
        signal: controller.signal,
        headers: range ? { Range: range } : {},
      })
      clearTimeout(timeoutId)

      if (!response.ok) {
        throw new Error(`Failed to fetch media: ${response.status}`)
      }

      const contentType = response.headers.get('content-type') || 'application/octet-stream'
      const contentLength = response.headers.get('content-length')
      const contentRange = response.headers.get('content-range')

      if (range && contentRange) {
        return new NextResponse(response.body, {
          status: 206,
          headers: {
            'Content-Range': contentRange,
            'Accept-Ranges': 'bytes',
            'Content-Length': contentLength || '',
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
        })
      }

      return new NextResponse(response.body, {
        headers: {
          'Content-Type': contentType,
          'Content-Length': contentLength || '',
          'Cache-Control': 'public, max-age=31536000, immutable',
          'Accept-Ranges': 'bytes',
        },
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

function parseAllowedMediaUrl(url: string): URL | NextResponse {
  let parsedUrl: URL
  try {
    parsedUrl = new URL(url)
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }

  if (parsedUrl.protocol !== 'https:') {
    return NextResponse.json({ error: 'Invalid URL scheme' }, { status: 400 })
  }

  const allowedHostSuffixes = ['.r2.dev', '.r2.cloudflarestorage.com']
  const allowedExactHosts = getExactAllowedHosts()
  const hostname = parsedUrl.hostname.toLowerCase()
  const isAllowed = allowedExactHosts.includes(hostname)
    || allowedHostSuffixes.some(host => hostname.endsWith(host))

  if (!isAllowed) {
    return NextResponse.json({ error: 'URL host not allowed' }, { status: 403 })
  }

  return parsedUrl
}

function getExactAllowedHosts() {
  const publicUrl = process.env.R2_PUBLIC_URL
  if (!publicUrl) return []

  try {
    return [new URL(publicUrl).hostname.toLowerCase()]
  } catch {
    return []
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
