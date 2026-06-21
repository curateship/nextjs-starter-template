import { NextRequest, NextResponse } from 'next/server'
import { processDueAiAutomations } from '@/lib/actions/ai-automations/execution'

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const result = await processDueAiAutomations()
  return NextResponse.json({
    message: `Processed ${result.processed} AI automations`,
    ...result,
  })
}
