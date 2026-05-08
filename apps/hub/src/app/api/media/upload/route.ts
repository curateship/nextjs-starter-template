import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/actions/auth/server'
import { uploadMediaAction } from '@/lib/actions/media/media-actions'

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const session = await auth.api.getSession({ headers: request.headers })
    if (!session?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File
    const altText = formData.get('altText') as string | null
    const siteId = formData.get('siteId') as string | null

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      )
    }

    if (!siteId) {
      return NextResponse.json(
        { error: 'Site ID is required' },
        { status: 400 }
      )
    }

    // Validate file type
    const imageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp']
    const videoTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska']
    const allowedTypes = [...imageTypes, ...videoTypes]

    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only images (JPEG, PNG, GIF, WebP) and videos (MP4, WebM, MOV, AVI, MKV) are allowed.' },
        { status: 400 }
      )
    }

    const fileType = imageTypes.includes(file.type) ? 'image' : 'video'

    // Validate file size (10MB for images, 100MB for videos)
    const maxSize = fileType === 'image' ? 10 * 1024 * 1024 : 100 * 1024 * 1024
    const maxSizeLabel = fileType === 'image' ? '10MB' : '100MB'
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: `File size too large. Maximum size is ${maxSizeLabel}.` },
        { status: 400 }
      )
    }

    const result = await uploadMediaAction(file, altText || undefined, siteId)

    if (result.error) {
      const status = result.error === 'Invalid site ID format'
        ? 400
        : result.error === 'Site not found or unauthorized'
          ? 403
          : 500

      return NextResponse.json(
        { error: result.error },
        { status }
      )
    }

    return NextResponse.json({
      success: true,
      data: result.data
    })

  } catch (error) {
    console.error('Upload error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// Handle preflight requests for CORS
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Range',
      'Access-Control-Allow-Credentials': 'false',
    },
  })
}
