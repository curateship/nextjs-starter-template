import { NextRequest, NextResponse } from 'next/server'
import {
  calculateCtr,
  getSponsorReport,
  normalizeSponsorReportRange,
  resolveSponsorReportToken,
} from '@/lib/actions/sponsors/sponsor-report-data'
import { getClientIp, isRateLimited } from '@/lib/utils/rate-limit'

const EXPORT_WINDOW_MS = 60_000
const EXPORT_MAX_REQUESTS = 15

function csvCell(value: string | number): string {
  let text = String(value)
  // Neutralize spreadsheet formula injection: a cell beginning with = + - @ or a
  // control char can execute as a formula in Excel/Sheets. Prefix it with a quote.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/**
 * GET /sponsor-reports/[token]/export?range=30d
 * CSV export scoped by the same token validation as the portal page.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const ip = getClientIp(request.headers) || 'unknown'
    if (isRateLimited(`sponsor-report-export:${ip}`, EXPORT_MAX_REQUESTS, EXPORT_WINDOW_MS)) {
      return new NextResponse('Report link is not available', { status: 404 })
    }

    const { token } = await params
    const access = await resolveSponsorReportToken(token)
    if (!access) return new NextResponse('Report link is not available', { status: 404 })

    const range = normalizeSponsorReportRange(request.nextUrl.searchParams.get('range'))
    const report = await getSponsorReport(access.sponsor_id, access.sponsor_title, range)

    const lines = [
      ['day', 'impressions', 'clicks', 'ctr_percent'].join(','),
      ...report.daily.map((day) => [
        day.day,
        day.impressions,
        day.clicks,
        calculateCtr(day.impressions, day.clicks),
      ].map(csvCell).join(',')),
      '',
      ['total_impressions', 'total_clicks', 'ctr_percent'].join(','),
      [report.total_impressions, report.total_clicks, report.ctr].map(csvCell).join(','),
    ]

    const safeTitle = report.sponsor_title.replace(/[^a-z0-9-]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'sponsor'
    const filename = `${safeTitle}-report-${report.range}-${report.end_day}.csv`

    return new NextResponse(lines.join('\n'), {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Sponsor report export error:', error)
    return new NextResponse('Report link is not available', { status: 404 })
  }
}
