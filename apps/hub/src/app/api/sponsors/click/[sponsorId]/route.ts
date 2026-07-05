import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { sponsors } from '@/lib/db/schema'
import { resolveSiteByHost } from '@/lib/actions/pages/page-frontend-actions'
import { recordSponsorClick } from '@/lib/actions/sponsors/sponsor-report-data'
import { getClientIp, isRateLimited } from '@/lib/utils/rate-limit'
import { sanitizeUrl } from '@/lib/utils/url-validator'
import { UUID_REGEX } from '@/lib/utils/validation'

const CLICK_WINDOW_MS = 60_000
const CLICK_MAX_REQUESTS = 60
const MAX_PATH_LENGTH = 2048

function getSourcePath(request: NextRequest): string {
  const referer = request.headers.get('referer')
  if (!referer) return '/'

  try {
    const url = new URL(referer)
    const path = url.pathname || '/'
    return path.length > MAX_PATH_LENGTH ? '/' : path
  } catch {
    return '/'
  }
}

/**
 * GET /api/sponsors/click/[sponsorId]
 * Records a sponsor click and redirects to the sponsor URL stored in the
 * database. Client-supplied redirect targets are never used.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sponsorId: string }> }
) {
  const homeUrl = new URL('/', request.url)

  try {
    const { sponsorId } = await params
    if (!UUID_REGEX.test(sponsorId)) return NextResponse.redirect(homeUrl)

    const [sponsor] = await db
      .select({ id: sponsors.id, siteId: sponsors.siteId, url: sponsors.url, isActive: sponsors.isActive })
      .from(sponsors)
      .where(eq(sponsors.id, sponsorId))
      .limit(1)

    if (!sponsor || !sponsor.isActive) return NextResponse.redirect(homeUrl)

    // Sponsors are only clickable from their own site's pages
    const host = request.headers.get('host') || ''
    const site = await resolveSiteByHost(host)
    if (site && site.id !== sponsor.siteId) return NextResponse.redirect(homeUrl)

    const safeDbUrl = sanitizeUrl(sponsor.url, '')
    if (!safeDbUrl) return NextResponse.redirect(homeUrl)
    // Sponsor URLs may be relative paths; resolve them against the current host
    const destination = new URL(safeDbUrl, request.url)

    // Tracking failures must never block the redirect
    const ip = getClientIp(request.headers)
    if (!isRateLimited(`sponsor-click:${sponsor.id}:${ip}`, CLICK_MAX_REQUESTS, CLICK_WINDOW_MS)) {
      await recordSponsorClick(sponsor.siteId, sponsor.id, getSourcePath(request))
    }

    return NextResponse.redirect(destination, { status: 302 })
  } catch (error) {
    console.error('Sponsor click error:', error)
    return NextResponse.redirect(homeUrl)
  }
}
