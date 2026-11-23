import { NextRequest, NextResponse } from '@/lib/web-response'

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { processAutomationApprovals, processDueAutomations } = await import('@/lib/actions/automations/execution')
  // Move paused runs first: an approval answered before this tick should not wait
  // behind a fresh batch of scheduled runs.
  const approvals = await processAutomationApprovals()
  const result = await processDueAutomations()
  return NextResponse.json({
    message: `Processed ${result.processed} automations, resumed ${approvals.resumed} approved runs`,
    ...result,
    ...approvals,
  })
}
