import { NextRequest, NextResponse } from 'next/server'
import { processDueAutomations } from '@/lib/actions/automations/execution'

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const result = await processDueAutomations()
  return NextResponse.json({ message: `Processed ${result.processed} automations`, ...result })
}
