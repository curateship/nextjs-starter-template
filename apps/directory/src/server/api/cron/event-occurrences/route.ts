import { NextRequest, NextResponse } from '@/lib/web-response'
import { generateSeriesOccurrences } from '@/lib/actions/events/event-recurrence.server'

/**
 * GET /api/cron/event-occurrences
 * Keeps every active event series topped up with its next upcoming occurrences.
 * Idempotent — re-running never duplicates dates. Protected by CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { anchors, created } = await generateSeriesOccurrences()
    return NextResponse.json({ message: `Checked ${anchors} series, created ${created} occurrences`, anchors, created })
  } catch (error) {
    console.error('Event occurrences cron failed:', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
