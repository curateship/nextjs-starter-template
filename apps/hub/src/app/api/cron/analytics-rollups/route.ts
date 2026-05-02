import { NextRequest, NextResponse } from 'next/server'
import { rollupAnalyticsEvents } from '@/lib/analytics/rollups'

function parseIntegerParam(value: string | null): number | undefined {
  if (!value) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

/**
 * GET /api/cron/analytics-rollups
 * Builds generic daily analytics rollups from raw analytics_events.
 * Protected by CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const searchParams = request.nextUrl.searchParams
  const days = parseIntegerParam(searchParams.get('days'))
  const pruneBatchSize = parseIntegerParam(searchParams.get('pruneBatchSize'))
  const prune = searchParams.get('prune') === 'true'

  try {
    const result = await rollupAnalyticsEvents({ days, prune, pruneBatchSize })
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    console.error('Analytics rollup cron error:', error)
    return NextResponse.json({ error: 'Analytics rollup failed' }, { status: 500 })
  }
}
