'use server'

import { eq, and, sql, desc, asc, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { emailAutomations, emailAutomationSteps, emailAutomationEnrollments, newsletterContacts, sites } from '@/lib/db/schema'
import { getAuthenticatedUser } from '@/lib/db/helpers'
import { extractNewsletterSponsorIds, generateEmailHtml } from '@/lib/actions/newsletters/render'
import { getActiveSponsorsByIdsAction } from '@/lib/actions/sponsors/sponsor-actions'
import {
  getTriggerSegmentIds,
  getAutomationTriggerNodes,
  isAutomationTriggerType,
  matchesAutomationTrigger,
  type AutomationTriggerType,
} from '@/lib/actions/newsletters/automation-triggers'
import {
  emptyNewsletterStatusEventStats,
  queryNewsletterStatusEvents,
  type NewsletterStatusEvent,
  type NewsletterStatusEventFilter,
  type NewsletterStatusEventStats,
} from '@/lib/actions/newsletters/status-events-query'

export interface EmailAutomation {
  id: string
  site_id: string
  name: string
  description: string | null
  status: 'draft' | 'active' | 'paused'
  trigger_type: AutomationTriggerType
  trigger_config: Record<string, any>
  goal_type: string | null
  goal_config: Record<string, any>
  created_at: string
  updated_at: string
  // Joined
  steps_count?: number
  enrollments_count?: number
}

export interface AutomationStep {
  id: string
  automation_id: string
  step_order: number
  node_type: 'email' | 'delay' | 'end_rules'
  node_config: {
    delay_type?: 'amount_of_time' | 'day_of_week' | 'specific_date'
    delay_value?: number
    delay_unit?: 'minutes' | 'hours' | 'days'
    day?: number       // 0-6 for day_of_week
    date?: string      // YYYY-MM-DD for specific_date
    [key: string]: any
  }
  delay_minutes: number
  subject: string | null
  content: string
  content_blocks: Record<string, any>
  from_name: string | null
  created_at: string
  updated_at: string
}

export interface AutomationJourneyIndicator {
  label: string
  next_due_at: string | null
}

type AutomationStepStatusEvent = NewsletterStatusEvent
type AutomationStepStatusEventFilter = NewsletterStatusEventFilter
type AutomationStepStatusStats = NewsletterStatusEventStats

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function generateAutomationEmailHtml(
  siteId: string,
  blocks: { id: string; type: string; title?: string; content: Record<string, any> }[],
) {
  const sponsorIds = extractNewsletterSponsorIds(blocks)
  const sponsorsById = sponsorIds.length > 0
    ? await getActiveSponsorsByIdsAction(siteId, sponsorIds)
    : {}

  return generateEmailHtml(blocks, 600, { sponsorsById })
}

function getSortedAutomationBlocks(contentBlocks: Record<string, any>) {
  return Object.values(contentBlocks || {})
    .filter((block: any) => block?.id && block?.type)
    .sort((a: any, b: any) => (a.display_order ?? 0) - (b.display_order ?? 0))
    .map((block: any) => ({
      id: block.id,
      type: block.type,
      title: block.title,
      content: block.content || {},
    }))
}

async function verifySiteOwnership(siteId: string, userId: string) {
  const [site] = await db
    .select({ id: sites.id })
    .from(sites)
    .where(and(eq(sites.id, siteId), eq(sites.userId, userId)))
    .limit(1)
  return !!site
}

function rowToAutomation(row: any): EmailAutomation {
  return {
    id: row.id,
    site_id: row.siteId,
    name: row.name,
    description: row.description ?? null,
    status: row.status,
    trigger_type: row.triggerType,
    trigger_config: row.triggerConfig ?? {},
    goal_type: row.goalType ?? null,
    goal_config: row.goalConfig ?? {},
    created_at: row.createdAt?.toISOString() ?? '',
    updated_at: row.updatedAt?.toISOString() ?? '',
  }
}

function rowToStep(row: any): AutomationStep {
  return {
    id: row.id,
    automation_id: row.automationId,
    step_order: row.stepOrder,
    node_type: row.nodeType,
    node_config: row.nodeConfig ?? {},
    delay_minutes: row.delayMinutes ?? 0,
    subject: row.subject ?? null,
    content: row.content ?? '',
    content_blocks: row.contentBlocks ?? {},
    from_name: row.fromName ?? null,
    created_at: row.createdAt?.toISOString() ?? '',
    updated_at: row.updatedAt?.toISOString() ?? '',
  }
}

// --- Automations ---

export async function getAutomationsBySite(siteId: string, options?: { page?: number; pageSize?: number }): Promise<{ data: EmailAutomation[] | null; total: number; error: string | null }> {
  try {
    if (!UUID_REGEX.test(siteId)) return { data: null, total: 0, error: 'Invalid site ID' }
    const user = await getAuthenticatedUser()
    if (!user) return { data: null, total: 0, error: 'Not authenticated' }
    if (!await verifySiteOwnership(siteId, user.id)) return { data: null, total: 0, error: 'Access denied' }

    const page = Math.max(1, Math.floor(options?.page ?? 1))
    const pageSize = Math.min(100, Math.max(1, Math.floor(options?.pageSize ?? 50)))
    const offset = (page - 1) * pageSize

    const [rows, countResult] = await Promise.all([
      db
        .select()
        .from(emailAutomations)
        .where(eq(emailAutomations.siteId, siteId))
        .orderBy(desc(emailAutomations.createdAt))
        .limit(pageSize)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(emailAutomations)
        .where(eq(emailAutomations.siteId, siteId)),
    ])

    // Get counts
    const automations = rows.map(rowToAutomation)
    if (automations.length) {
      const ids = automations.map(a => a.id)

      const [stepsRows, enrollmentRows] = await Promise.all([
        db
          .select({ automationId: emailAutomationSteps.automationId })
          .from(emailAutomationSteps)
          .where(inArray(emailAutomationSteps.automationId, ids)),
        db
          .select({ automationId: emailAutomationEnrollments.automationId })
          .from(emailAutomationEnrollments)
          .where(inArray(emailAutomationEnrollments.automationId, ids)),
      ])

      const stepCounts: Record<string, number> = {}
      for (const s of stepsRows) {
        stepCounts[s.automationId] = (stepCounts[s.automationId] || 0) + 1
      }
      const enrollmentCounts: Record<string, number> = {}
      for (const e of enrollmentRows) {
        enrollmentCounts[e.automationId] = (enrollmentCounts[e.automationId] || 0) + 1
      }

      for (const a of automations) {
        a.steps_count = stepCounts[a.id] || 0
        a.enrollments_count = enrollmentCounts[a.id] || 0
      }
    }

    return { data: automations, total: countResult[0]?.count ?? 0, error: null }
  } catch (err) {
    console.error('getAutomationsBySite error:', err)
    return { data: null, total: 0, error: 'Server error' }
  }
}

export async function getAutomationById(automationId: string): Promise<{ data: EmailAutomation | null; steps: AutomationStep[] | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(automationId)) return { data: null, steps: null, error: 'Invalid ID' }
    const user = await getAuthenticatedUser()
    if (!user) return { data: null, steps: null, error: 'Not authenticated' }

    const [row] = await db
      .select()
      .from(emailAutomations)
      .where(eq(emailAutomations.id, automationId))
      .limit(1)

    if (!row) return { data: null, steps: null, error: 'Automation not found' }
    if (!await verifySiteOwnership(row.siteId, user.id)) return { data: null, steps: null, error: 'Access denied' }

    const stepsRows = await db
      .select()
      .from(emailAutomationSteps)
      .where(eq(emailAutomationSteps.automationId, automationId))
      .orderBy(asc(emailAutomationSteps.stepOrder))

    return { data: rowToAutomation(row), steps: stepsRows.map(rowToStep), error: null }
  } catch (err) {
    console.error('getAutomationById error:', err)
    return { data: null, steps: null, error: 'Server error' }
  }
}

export async function getAutomationJourneyIndicators(automationId: string): Promise<{
  data: Record<number, AutomationJourneyIndicator> | null
  error: string | null
}> {
  try {
    if (!UUID_REGEX.test(automationId)) return { data: null, error: 'Invalid ID' }
    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const [automation] = await db
      .select({ siteId: emailAutomations.siteId })
      .from(emailAutomations)
      .where(eq(emailAutomations.id, automationId))
      .limit(1)

    if (!automation) return { data: null, error: 'Not found' }
    if (!await verifySiteOwnership(automation.siteId, user.id)) return { data: null, error: 'Access denied' }

    const rows = await db.execute<{ step_order: number; count: number; next_due_at: Date | string | null }>(sql`
      select
        s.step_order,
        count(*)::int as count,
        min(coalesce(e.last_step_sent_at, e.enrolled_at) + (s.delay_minutes * interval '1 minute')) as next_due_at
      from email_automation_steps s
      join email_automation_enrollments e
        on e.automation_id = s.automation_id
        and coalesce(e.current_step_order, 0) + 1 = s.step_order
      where s.automation_id = ${automationId}
        and s.node_type = 'delay'
        and e.status = 'active'
        and now() < coalesce(e.last_step_sent_at, e.enrolled_at) + (s.delay_minutes * interval '1 minute')
      group by s.step_order
      order by s.step_order
    `)

    const indicators = Object.fromEntries(rows.rows.map(row => {
      const count = Number(row.count)
      return [row.step_order, {
        label: `${count.toLocaleString()} Contact${count === 1 ? '' : 's'} Waiting`,
        next_due_at: row.next_due_at ? new Date(row.next_due_at).toISOString() : null,
      }]
    }))

    return {
      data: indicators,
      error: null,
    }
  } catch (err) {
    console.error('getAutomationJourneyIndicators error:', err)
    return { data: null, error: 'Server error' }
  }
}

export async function createAutomation(input: {
  siteId: string
  name: string
  description?: string
  triggerType: AutomationTriggerType
  triggerConfig?: Record<string, any>
}): Promise<{ data: EmailAutomation | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(input.siteId)) return { data: null, error: 'Invalid site ID' }
    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }
    if (!await verifySiteOwnership(input.siteId, user.id)) return { data: null, error: 'Access denied' }
    if (!input.name?.trim()) return { data: null, error: 'Name is required' }
    if (!isAutomationTriggerType(input.triggerType)) return { data: null, error: 'Invalid trigger type' }

    const [data] = await db
      .insert(emailAutomations)
      .values({
        siteId: input.siteId,
        name: input.name.trim(),
        description: input.description || null,
        triggerType: input.triggerType,
        triggerConfig: input.triggerConfig || {},
      })
      .returning()

    if (!data) {
      return { data: null, error: 'Failed to create automation' }
    }
    return { data: rowToAutomation(data), error: null }
  } catch (err) {
    console.error('createAutomation error:', err)
    return { data: null, error: 'Server error' }
  }
}

export async function updateAutomation(
  automationId: string,
  updates: {
    name?: string
    description?: string
    status?: string
    trigger_type?: AutomationTriggerType
    trigger_config?: Record<string, any>
    goal_type?: string
    goal_config?: Record<string, any>
  }
): Promise<{ data: EmailAutomation | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(automationId)) return { data: null, error: 'Invalid ID' }
    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const [automation] = await db
      .select({ siteId: emailAutomations.siteId })
      .from(emailAutomations)
      .where(eq(emailAutomations.id, automationId))
      .limit(1)

    if (!automation) return { data: null, error: 'Not found' }
    if (!await verifySiteOwnership(automation.siteId, user.id)) return { data: null, error: 'Access denied' }

    if (updates.status !== undefined && !['draft', 'active', 'paused'].includes(updates.status)) {
      return { data: null, error: 'Invalid status' }
    }
    if (updates.trigger_type !== undefined && !isAutomationTriggerType(updates.trigger_type)) {
      return { data: null, error: 'Invalid trigger type' }
    }

    const fields: Record<string, any> = { updatedAt: new Date() }
    if (updates.name !== undefined) fields.name = updates.name
    if (updates.description !== undefined) fields.description = updates.description
    if (updates.status !== undefined) fields.status = updates.status
    if (updates.trigger_type !== undefined) fields.triggerType = updates.trigger_type
    if (updates.trigger_config !== undefined) fields.triggerConfig = updates.trigger_config
    if (updates.goal_type !== undefined) fields.goalType = updates.goal_type
    if (updates.goal_config !== undefined) fields.goalConfig = updates.goal_config

    const [data] = await db
      .update(emailAutomations)
      .set(fields)
      .where(eq(emailAutomations.id, automationId))
      .returning()

    if (!data) {
      return { data: null, error: 'Failed to update' }
    }

    const segmentIds = data.status === 'active'
      ? [...new Set(
        getAutomationTriggerNodes(data.triggerType, data.triggerConfig as Record<string, any> | null | undefined)
          .filter(node => node.type === 'segment_added')
          .flatMap(node => getTriggerSegmentIds(node.config))
          .filter(id => UUID_REGEX.test(id))
      )]
      : []
    if (segmentIds.length) {
      const segmentSql = sql.join(segmentIds.map(id => sql`${id}::uuid`), sql`, `)
      await db.execute(sql`
        insert into email_automation_enrollments (automation_id, contact_id, status, current_step_order, metadata)
        select distinct ${automationId}::uuid, nsc.contact_id, 'active', 0, jsonb_build_object('source', 'segment_added', 'segment_ids', ${JSON.stringify(segmentIds)}::jsonb)
        from newsletter_segment_contacts nsc
        join newsletter_contacts nc on nc.id = nsc.contact_id
        where nsc.segment_id in (${segmentSql})
          and nc.site_id = ${automation.siteId}::uuid
          and nc.status = 'active'
        on conflict do nothing
      `)
    }

    return { data: rowToAutomation(data), error: null }
  } catch (err) {
    console.error('updateAutomation error:', err)
    return { data: null, error: 'Server error' }
  }
}

export async function deleteAutomations(ids: string[]): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!ids.length) return { success: false, error: 'No items selected' }
    for (const id of ids) { if (!UUID_REGEX.test(id)) return { success: false, error: 'Invalid ID' } }
    const user = await getAuthenticatedUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    const automations = await db
      .select({ id: emailAutomations.id, siteId: emailAutomations.siteId })
      .from(emailAutomations)
      .where(inArray(emailAutomations.id, ids))

    if (!automations.length) return { success: false, error: 'Not found' }

    const siteIds = [...new Set(automations.map(a => a.siteId))]
    const ownedSites = await db
      .select({ id: sites.id })
      .from(sites)
      .where(and(inArray(sites.id, siteIds), eq(sites.userId, user.id)))

    if (!ownedSites.length || ownedSites.length !== siteIds.length) return { success: false, error: 'Access denied' }

    await db.delete(emailAutomations).where(inArray(emailAutomations.id, ids))

    return { success: true, error: null }
  } catch (err) {
    console.error('deleteAutomations error:', err)
    return { success: false, error: 'Server error' }
  }
}

/** Internal -- called from API routes only. Returns just IDs for enrollment. */
export async function findActiveAutomations(
  siteId: string,
  triggerType: AutomationTriggerType,
  filterId?: string
): Promise<{ id: string }[]> {
  if (!UUID_REGEX.test(siteId)) return []
  if (!isAutomationTriggerType(triggerType) || triggerType === 'none') return []

  const rows = await db
    .select({
      id: emailAutomations.id,
      triggerType: emailAutomations.triggerType,
      triggerConfig: emailAutomations.triggerConfig,
    })
    .from(emailAutomations)
    .where(and(
      eq(emailAutomations.siteId, siteId),
      eq(emailAutomations.status, 'active'),
    ))

  return rows
    .filter(automation => {
      const triggerNodes = getAutomationTriggerNodes(
        automation.triggerType,
        automation.triggerConfig as Record<string, any> | null | undefined
      )
      return triggerNodes.some(node => matchesAutomationTrigger(node, triggerType, filterId))
    })
    .map(automation => ({ id: automation.id }))
}

// --- Steps ---

export async function createStep(input: {
  automationId: string
  stepOrder: number
  nodeType: 'email' | 'delay' | 'end_rules'
  nodeConfig?: Record<string, any>
  delayMinutes?: number
  subject?: string
  content?: string
  contentBlocks?: Record<string, any>
}): Promise<{ data: AutomationStep | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(input.automationId)) return { data: null, error: 'Invalid ID' }
    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const [automation] = await db
      .select({ siteId: emailAutomations.siteId })
      .from(emailAutomations)
      .where(eq(emailAutomations.id, input.automationId))
      .limit(1)

    if (!automation) return { data: null, error: 'Automation not found' }
    if (!await verifySiteOwnership(automation.siteId, user.id)) return { data: null, error: 'Access denied' }

    const contentBlocks = input.contentBlocks || {}
    const sortedBlocks = getSortedAutomationBlocks(contentBlocks)
    const content = input.nodeType === 'email' && sortedBlocks.length > 0
      ? await generateAutomationEmailHtml(automation.siteId, sortedBlocks)
      : (input.content || '')

    const [data] = await db
      .insert(emailAutomationSteps)
      .values({
        automationId: input.automationId,
        stepOrder: input.stepOrder,
        nodeType: input.nodeType,
        nodeConfig: input.nodeConfig || {},
        delayMinutes: input.delayMinutes || 0,
        subject: input.subject || null,
        content,
        contentBlocks,
      })
      .returning()

    if (!data) {
      return { data: null, error: 'Failed to create node' }
    }
    return { data: rowToStep(data), error: null }
  } catch (err) {
    console.error('createStep error:', err)
    return { data: null, error: 'Server error' }
  }
}

/** Reorder steps -- shift existing steps to make room for inserts */
export async function reorderSteps(automationId: string, stepIds: string[]): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!UUID_REGEX.test(automationId)) return { success: false, error: 'Invalid ID' }
    const user = await getAuthenticatedUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    const [automation] = await db
      .select({ siteId: emailAutomations.siteId })
      .from(emailAutomations)
      .where(eq(emailAutomations.id, automationId))
      .limit(1)

    if (!automation) return { success: false, error: 'Not found' }
    if (!await verifySiteOwnership(automation.siteId, user.id)) return { success: false, error: 'Access denied' }

    for (let i = 0; i < stepIds.length; i++) {
      await db
        .update(emailAutomationSteps)
        .set({ stepOrder: 1000000 + i })
        .where(eq(emailAutomationSteps.id, stepIds[i]))
    }

    for (let i = 0; i < stepIds.length; i++) {
      await db
        .update(emailAutomationSteps)
        .set({ stepOrder: i + 1 })
        .where(eq(emailAutomationSteps.id, stepIds[i]))
    }

    return { success: true, error: null }
  } catch (err) {
    console.error('reorderSteps error:', err)
    return { success: false, error: 'Server error' }
  }
}

export async function getStepById(stepId: string): Promise<{ data: AutomationStep | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(stepId)) return { data: null, error: 'Invalid ID' }
    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const [step] = await db
      .select()
      .from(emailAutomationSteps)
      .where(eq(emailAutomationSteps.id, stepId))
      .limit(1)

    if (!step) return { data: null, error: 'Step not found' }

    const [automation] = await db
      .select({ siteId: emailAutomations.siteId })
      .from(emailAutomations)
      .where(eq(emailAutomations.id, step.automationId))
      .limit(1)

    if (!automation) return { data: null, error: 'Automation not found' }
    if (!await verifySiteOwnership(automation.siteId, user.id)) return { data: null, error: 'Access denied' }

    return { data: rowToStep(step), error: null }
  } catch (err) {
    console.error('getStepById error:', err)
    return { data: null, error: 'Server error' }
  }
}

export async function updateStep(
  stepId: string,
  updates: { subject?: string; content?: string; content_blocks?: Record<string, any>; delay_minutes?: number; node_config?: Record<string, any> }
): Promise<{ data: AutomationStep | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(stepId)) return { data: null, error: 'Invalid ID' }
    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const [step] = await db
      .select({ automationId: emailAutomationSteps.automationId })
      .from(emailAutomationSteps)
      .where(eq(emailAutomationSteps.id, stepId))
      .limit(1)

    if (!step) return { data: null, error: 'Step not found' }

    const [automation] = await db
      .select({ siteId: emailAutomations.siteId })
      .from(emailAutomations)
      .where(eq(emailAutomations.id, step.automationId))
      .limit(1)

    if (!automation) return { data: null, error: 'Automation not found' }
    if (!await verifySiteOwnership(automation.siteId, user.id)) return { data: null, error: 'Access denied' }

    const fields: Record<string, any> = { updatedAt: new Date() }
    if (updates.subject !== undefined) fields.subject = updates.subject
    if (updates.content !== undefined) fields.content = updates.content
    if (updates.delay_minutes !== undefined) fields.delayMinutes = updates.delay_minutes
    if (updates.node_config !== undefined) fields.nodeConfig = updates.node_config
    if (updates.content_blocks !== undefined) {
      fields.contentBlocks = updates.content_blocks
      // Regenerate email HTML from blocks
      const sortedBlocks = getSortedAutomationBlocks(updates.content_blocks)
      if (sortedBlocks.length > 0) {
        fields.content = await generateAutomationEmailHtml(automation.siteId, sortedBlocks)
      }
    }

    const [data] = await db
      .update(emailAutomationSteps)
      .set(fields)
      .where(eq(emailAutomationSteps.id, stepId))
      .returning()

    if (!data) {
      return { data: null, error: 'Failed to update step' }
    }
    return { data: rowToStep(data), error: null }
  } catch (err) {
    console.error('updateStep error:', err)
    return { data: null, error: 'Server error' }
  }
}

export async function deleteStep(stepId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!UUID_REGEX.test(stepId)) return { success: false, error: 'Invalid ID' }
    const user = await getAuthenticatedUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    const [step] = await db
      .select({
        automationId: emailAutomationSteps.automationId,
        stepOrder: emailAutomationSteps.stepOrder,
      })
      .from(emailAutomationSteps)
      .where(eq(emailAutomationSteps.id, stepId))
      .limit(1)

    if (!step) return { success: false, error: 'Step not found' }

    const [automation] = await db
      .select({ siteId: emailAutomations.siteId })
      .from(emailAutomations)
      .where(eq(emailAutomations.id, step.automationId))
      .limit(1)

    if (!automation) return { success: false, error: 'Automation not found' }
    if (!await verifySiteOwnership(automation.siteId, user.id)) return { success: false, error: 'Access denied' }

    await db.delete(emailAutomationSteps).where(eq(emailAutomationSteps.id, stepId))

    await db
      .update(emailAutomationEnrollments)
      .set({
        currentStepOrder: sql`greatest(coalesce(${emailAutomationEnrollments.currentStepOrder}, 0) - 1, 0)`,
      })
      .where(and(
        eq(emailAutomationEnrollments.automationId, step.automationId),
        eq(emailAutomationEnrollments.status, 'active'),
        sql`coalesce(${emailAutomationEnrollments.currentStepOrder}, 0) >= ${step.stepOrder}`,
      ))

    const remainingSteps = await db
      .select({ id: emailAutomationSteps.id })
      .from(emailAutomationSteps)
      .where(eq(emailAutomationSteps.automationId, step.automationId))
      .orderBy(asc(emailAutomationSteps.stepOrder))

    const compactResult = await reorderSteps(step.automationId, remainingSteps.map(s => s.id))
    if (!compactResult.success) return compactResult

    return { success: true, error: null }
  } catch (err) {
    console.error('deleteStep error:', err)
    return { success: false, error: 'Server error' }
  }
}

// --- Enrollments ---

/** Enroll a contact in an automation. Verifies the automation and contact belong to the same site. */
export async function enrollContact(automationId: string, contactId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!UUID_REGEX.test(automationId) || !UUID_REGEX.test(contactId)) return { success: false, error: 'Invalid ID' }

    // Verify automation and contact belong to same site
    const [automation] = await db
      .select({ siteId: emailAutomations.siteId })
      .from(emailAutomations)
      .where(eq(emailAutomations.id, automationId))
      .limit(1)

    const [contact] = await db
      .select({ siteId: newsletterContacts.siteId })
      .from(newsletterContacts)
      .where(eq(newsletterContacts.id, contactId))
      .limit(1)

    if (!automation || !contact || automation.siteId !== contact.siteId) {
      return { success: false, error: 'Invalid enrollment' }
    }

    await db
      .insert(emailAutomationEnrollments)
      .values({
        automationId,
        contactId,
        status: 'active',
        currentStepOrder: 0,
        enrolledAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [emailAutomationEnrollments.automationId, emailAutomationEnrollments.contactId],
        set: {
          status: 'active',
          currentStepOrder: 0,
          enrolledAt: new Date(),
        },
      })

    return { success: true, error: null }
  } catch (err) {
    console.error('enrollContact error:', err)
    return { success: false, error: 'Server error' }
  }
}

async function cancelEnrollment(enrollmentId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!UUID_REGEX.test(enrollmentId)) return { success: false, error: 'Invalid ID' }
    const user = await getAuthenticatedUser()
    if (!user) return { success: false, error: 'Not authenticated' }

    // Verify ownership: enrollment -> automation -> site
    const [enrollment] = await db
      .select({ automationId: emailAutomationEnrollments.automationId })
      .from(emailAutomationEnrollments)
      .where(eq(emailAutomationEnrollments.id, enrollmentId))
      .limit(1)

    if (!enrollment) return { success: false, error: 'Not found' }

    const [automation] = await db
      .select({ siteId: emailAutomations.siteId })
      .from(emailAutomations)
      .where(eq(emailAutomations.id, enrollment.automationId))
      .limit(1)

    if (!automation) return { success: false, error: 'Not found' }
    if (!await verifySiteOwnership(automation.siteId, user.id)) return { success: false, error: 'Access denied' }

    await db
      .update(emailAutomationEnrollments)
      .set({ status: 'cancelled', endedAt: new Date() })
      .where(eq(emailAutomationEnrollments.id, enrollmentId))

    return { success: true, error: null }
  } catch (err) {
    console.error('cancelEnrollment error:', err)
    return { success: false, error: 'Server error' }
  }
}

export async function getAutomationReport(automationId: string): Promise<{
  data: { totalEnrolled: number; completed: number; goalMet: number; cancelled: number; stepStats: { step_order: number; subject: string; sent: number; unique_sent: number; duplicate_sends: number; opened: number; clicked: number }[] } | null
  error: string | null
}> {
  try {
    if (!UUID_REGEX.test(automationId)) return { data: null, error: 'Invalid ID' }
    const user = await getAuthenticatedUser()
    if (!user) return { data: null, error: 'Not authenticated' }

    const [automation] = await db
      .select({ siteId: emailAutomations.siteId })
      .from(emailAutomations)
      .where(eq(emailAutomations.id, automationId))
      .limit(1)

    if (!automation) return { data: null, error: 'Not found' }
    if (!await verifySiteOwnership(automation.siteId, user.id)) return { data: null, error: 'Access denied' }

    // Enrollment counts
    const enrollments = await db
      .select({ status: emailAutomationEnrollments.status })
      .from(emailAutomationEnrollments)
      .where(eq(emailAutomationEnrollments.automationId, automationId))

    const counts = { totalEnrolled: 0, completed: 0, goalMet: 0, cancelled: 0 }
    for (const e of enrollments) {
      counts.totalEnrolled++
      if (e.status === 'completed') counts.completed++
      else if (e.status === 'goal_met') counts.goalMet++
      else if (e.status === 'cancelled') counts.cancelled++
    }

    const steps = await db
      .select({ stepOrder: emailAutomationSteps.stepOrder, subject: emailAutomationSteps.subject })
      .from(emailAutomationSteps)
      .where(eq(emailAutomationSteps.automationId, automationId))
      .orderBy(asc(emailAutomationSteps.stepOrder))

    const stepStats = await Promise.all(steps.map(async s => {
      const result = await queryNewsletterStatusEvents({
        pageSize: 1,
        siteId: automation.siteId,
        sourceId: automationId,
        sourceType: 'automation',
        stepOrder: s.stepOrder,
      })

      return {
        step_order: s.stepOrder,
        subject: s.subject ?? '',
        sent: result.stats.sent,
        unique_sent: result.stats.uniqueSent,
        duplicate_sends: result.stats.duplicateSends,
        opened: result.stats.opened,
        clicked: result.stats.clicked,
      }
    }))

    return { data: { ...counts, stepStats }, error: null }
  } catch (err) {
    console.error('getAutomationReport error:', err)
    return { data: null, error: 'Server error' }
  }
}

export async function getAutomationStepStatusEvents(
  automationId: string,
  stepOrder: number,
  options?: { page?: number; pageSize?: number; eventFilter?: AutomationStepStatusEventFilter },
): Promise<{ data: AutomationStepStatusEvent[] | null; total: number; stats: AutomationStepStatusStats; error: string | null }> {
  try {
    if (!UUID_REGEX.test(automationId)) return { data: null, total: 0, stats: emptyNewsletterStatusEventStats, error: 'Invalid ID' }

    const normalizedStepOrder = Math.max(1, Math.floor(Number(stepOrder) || 0))
    const user = await getAuthenticatedUser()
    if (!user) return { data: null, total: 0, stats: emptyNewsletterStatusEventStats, error: 'Not authenticated' }

    const [automation] = await db
      .select({ siteId: emailAutomations.siteId })
      .from(emailAutomations)
      .where(eq(emailAutomations.id, automationId))
      .limit(1)

    if (!automation) return { data: null, total: 0, stats: emptyNewsletterStatusEventStats, error: 'Not found' }
    if (!await verifySiteOwnership(automation.siteId, user.id)) return { data: null, total: 0, stats: emptyNewsletterStatusEventStats, error: 'Access denied' }

    const result = await queryNewsletterStatusEvents({
      eventFilter: options?.eventFilter,
      page: options?.page,
      pageSize: options?.pageSize,
      siteId: automation.siteId,
      sourceId: automationId,
      sourceType: 'automation',
      stepOrder: normalizedStepOrder,
    })

    return {
      data: result.data,
      total: result.total,
      stats: result.stats,
      error: null,
    }
  } catch (err) {
    console.error('getAutomationStepStatusEvents error:', err)
    return { data: null, total: 0, stats: emptyNewsletterStatusEventStats, error: 'Server error' }
  }
}
