import { NextRequest, NextResponse } from 'next/server'

// Timeout for fetch requests (10 seconds)
const FETCH_TIMEOUT = 10000

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')

  if (!url) {
    return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 })
  }

  // Create AbortController for timeout management
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT)

  try {
    // Get the range header for video streaming
    const range = request.headers.get('range')

    // Build fetch options
    const fetchOptions: RequestInit = {
      signal: controller.signal,
      headers: range ? { Range: range } : {},
    }

    // Single fetch with proper timeout and range support
    const response = await fetch(url, fetchOptions)

    // Clear timeout on successful fetch
    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`Failed to fetch media: ${response.statusText}`)
    }

    const contentType = response.headers.get('content-type') || 'video/mp4'
    const contentLength = response.headers.get('content-length')
    const contentRange = response.headers.get('content-range')

    if (range && contentRange) {
      // Handle range requests for video streaming
      return new NextResponse(response.body, {
        status: 206,
        headers: {
          'Content-Range': contentRange,
          'Accept-Ranges': 'bytes',
          'Content-Length': contentLength || '',
          'Content-Type': contentType,
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': 'Range, Content-Range, Content-Length',
        },
      })
    }

    // Return the full video
    return new NextResponse(response.body, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': contentLength || '',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'Access-Control-Allow-Headers': 'Range, Content-Range, Content-Length',
        'Accept-Ranges': 'bytes',
      },
    })

  } catch (error) {
    // Clear timeout on error
    clearTimeout(timeoutId)

    // Handle timeout errors specifically
    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`Media proxy timeout after ${FETCH_TIMEOUT}ms for URL:`, url)
      return NextResponse.json(
        { error: 'Request timeout - media server took too long to respond' },
        { status: 504 }
      )
    }

    console.error('Media proxy error:', error)
    return NextResponse.json({ error: 'Failed to proxy media' }, { status: 500 })
  }
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