import { verifyDirectoryListingSubmissionToken } from '@/lib/actions/directories/directory-submission-verification'
import { NextRequest, NextResponse } from '@/lib/web-response'

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') || ''
  const result = await verifyDirectoryListingSubmissionToken(token)
  const target = result.success
    ? '/?listing-submission=verified'
    : '/?listing-submission=invalid'

  return NextResponse.redirect(new URL(target, request.url))
}
