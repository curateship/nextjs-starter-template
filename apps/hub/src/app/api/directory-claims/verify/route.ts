import { verifyDirectoryClaimEmailToken } from '@/lib/actions/directories/directory-claim-actions'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token') || ''
  const result = await verifyDirectoryClaimEmailToken(token)
  const target = result.success && result.directorySlug
    ? `/directory/${result.directorySlug}?claim=verified`
    : '/?claim=invalid'

  return NextResponse.redirect(new URL(target, request.url))
}
