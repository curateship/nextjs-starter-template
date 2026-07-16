import { NextRequest, NextResponse } from '@/lib/web-response'

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { processDueAutomations } = await import('@/lib/actions/automations/execution')
  const result = await processDueAutomations()
  return NextResponse.json({ message: `Processed ${result.processed} automations`, ...result })
}
