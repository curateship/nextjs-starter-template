import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get('url')
  
  if (!url) {
    return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 })
  }

  try {
    // Fetch the video from Supabase
    const response = await fetch(url)
    
    if (!response.ok) {
      throw new Error(`Failed to fetch media: ${response.statusText}`)
    }

    const contentType = response.headers.get('content-type') || 'video/mp4'
    const contentLength = response.headers.get('content-length')
    
    // Get the range header for video streaming
    const range = request.headers.get('range')
    
    if (range && contentLength) {
      // Handle range requests for video streaming
      const parts = range.replace(/bytes=/, '').split('-')
      const start = parseInt(parts[0], 10)
      const end = parts[1] ? parseInt(parts[1], 10) : parseInt(contentLength) - 1
      const chunksize = (end - start) + 1
      
      const rangeResponse = await fetch(url, {
        headers: {
          Range: `bytes=${start}-${end}`
        }
      })
      
      return new NextResponse(rangeResponse.body, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${contentLength}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunksize.toString(),
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