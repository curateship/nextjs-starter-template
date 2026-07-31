import { and, asc, eq, gt } from 'drizzle-orm'
import { revalidatePath } from '@/lib/cache'
import type { AutomationRunItem } from '@/features/automations/domain/types'
import { db } from '@/lib/db'
import {
  siteAutomations,
  siteAutomationApprovals,
  siteAutomationRuns,
  siteAutomationRunSteps,
  sites,
} from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { UUID_REGEX } from '@/lib/utils/validation'
import { closeApprovalBranch } from './execution'
import { automationRunRowToItem } from './mappers'

/**
 * Record the owner's answer to one paused approval gate.
 *
 * Rejecting ends the branch here and now. Approving only marks the decision — the
 * cron runner picks it up and runs the remaining steps, which is what proves a
 * paused run can be resumed by a later process.
 *
 * The gate is identified by its own random ID and can only be decided by the user
 * who owns the site behind it, so the notification's link is neither guessable nor
 * usable by anyone else. Every decision is claimed with a `status = 'pending'`
 * condition, which is what makes it single-use.
 */
export async function decideAutomationApprovalImpl(
  approvalId: string,
  decision: 'approve' | 'reject'
): Promise<{ data: AutomationRunItem | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(approvalId)) return { data: null, error: 'Invalid approval' }
    if (decision !== 'approve' && decision !== 'reject') return { data: null, error: 'Invalid decision' }
    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Authentication required' }

    const [owned] = await db
      .select({
        id: siteAutomationApprovals.id,
        runId: siteAutomationApprovals.runId,
        nodeId: siteAutomationApprovals.nodeId,
        automationId: siteAutomationApprovals.automationId,
      })
      .from(siteAutomationApprovals)
      .innerJoin(siteAutomations, eq(siteAutomations.id, siteAutomationApprovals.automationId))
      .innerJoin(sites, and(eq(sites.id, siteAutomations.siteId), eq(sites.userId, user.id)))
      .where(eq(siteAutomationApprovals.id, approvalId))
      .limit(1)
    if (!owned) return { data: null, error: 'Approval not found' }

    const now = new Date()
    const [claimed] = await db
      .update(siteAutomationApprovals)
      .set({
        status: decision === 'approve' ? 'approved' : 'rejected',
        decidedAt: now,
        decidedByUserId: user.id,
        // A rejected gate never hands its payload on, so drop it with the decision.
        ...(decision === 'reject' ? { payload: null } : {}),
      })
      .where(and(
        eq(siteAutomationApprovals.id, approvalId),
        eq(siteAutomationApprovals.status, 'pending'),
        gt(siteAutomationApprovals.expiresAt, now),
      ))
      .returning({ id: siteAutomationApprovals.id })
    if (!claimed) return { data: null, error: 'This approval was already answered or has expired.' }

    if (decision === 'reject') await closeApprovalBranch(owned.runId, owned.nodeId, 'rejected')
    revalidatePath('/admin/automations')
    revalidatePath(`/admin/automations/${owned.automationId}`)
    return { data: await loadRunItem(owned.runId), error: null }
  } catch (error) {
    console.error('decideAutomationApproval error:', error)
    return { data: null, error: 'Failed to record the approval' }
  }
}

async function loadRunItem(runId: string): Promise<AutomationRunItem | null> {
  const [run] = await db.select().from(siteAutomationRuns).where(eq(siteAutomationRuns.id, runId)).limit(1)
  if (!run) return null
  const [steps, approvals] = await Promise.all([
    db.select().from(siteAutomationRunSteps)
      .where(eq(siteAutomationRunSteps.runId, runId))
      .orderBy(asc(siteAutomationRunSteps.startedAt), asc(siteAutomationRunSteps.nodeName)),
    db.select().from(siteAutomationApprovals).where(eq(siteAutomationApprovals.runId, runId)),
  ])
  return automationRunRowToItem(run, steps, approvals)
}
