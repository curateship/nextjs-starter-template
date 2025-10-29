import { NextRequest, NextResponse } from 'next/server'
import { getFromR2 } from '@/lib/utils/r2'

// Timeout for fetch requests (10 seconds)
const FETCH_TIMEOUT = 10000

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')

  if (!url) {
    return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 })
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

  try {
    const range = request.headers.get('range')

    // Check if it's an R2 URL
    if (url.startsWith('r2://')) {
      // Extract filename from r2:// URL
      const fileName = url.replace('r2://', '')

      // Get from R2
      const r2Object = await getFromR2(fileName)

      if (!r2Object.Body) {
        throw new Error('No body in R2 response')
      }

      // Convert stream to buffer
      const body = await streamToBuffer(r2Object.Body as any)

      clearTimeout(timeoutId)

      const contentType = r2Object.ContentType || 'application/octet-stream'
      const contentLength = r2Object.ContentLength?.toString() || body.length.toString()

      // Handle range requests for video streaming
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-')
        const start = parseInt(parts[0], 10)
        const end = parts[1] ? parseInt(parts[1], 10) : body.length - 1
        const chunksize = (end - start) + 1
        const chunk = body.slice(start, end + 1)

        return new NextResponse(chunk, {
          status: 206,
          headers: {
            'Content-Range': `bytes ${start}-${end}/${body.length}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': chunksize.toString(),
            'Content-Type': contentType,
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
        })
      }

      return new NextResponse(body, {
        headers: {
          'Content-Type': contentType,
          'Content-Length': contentLength,
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      })
    }

    // Fallback: proxy external URLs (Supabase, etc.)
    const fetchOptions: RequestInit = {
      signal: controller.signal,
      headers: range ? { Range: range } : {},
    }

    const response = await fetch(url, fetchOptions)
    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`Failed to fetch media: ${response.statusText}`)
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

    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`Media proxy timeout after ${FETCH_TIMEOUT}ms for URL:`, url)
      return NextResponse.json(
        { error: 'Request timeout - media server took too long to respond' },
        { status: 504 }
      )
    }

    console.error('Media proxy error:', error)
    return NextResponse.json({
      error: 'Failed to proxy media',
      details: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// Helper to convert stream to buffer
async function streamToBuffer(stream: ReadableStream): Promise<Buffer> {
  const reader = stream.getReader()
  const chunks: Uint8Array[] = []

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
  }

  return Buffer.concat(chunks)
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