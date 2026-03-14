'use server'

import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export interface EmailAutomation {
  id: string
  site_id: string
  name: string
  description: string | null
  status: 'draft' | 'active' | 'paused'
  trigger_type: 'lead_magnet_signup' | 'paid_purchase'
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
  node_type: 'email' | 'delay'
  node_config: {
    delay_type?: 'amount_of_time' | 'day_of_week' | 'time_of_day' | 'specific_date'
    delay_value?: number
    delay_unit?: 'minutes' | 'hours' | 'days'
    day?: number       // 0-6 for day_of_week
    time?: string      // HH:MM for time_of_day
    date?: string      // YYYY-MM-DD for specific_date
    [key: string]: any
  }
  delay_minutes: number
  subject: string | null
  content: string
  from_name: string | null
  created_at: string
  updated_at: string
}

export interface AutomationEnrollment {
  id: string
  automation_id: string
  contact_id: string
  current_step_order: number
  status: 'active' | 'completed' | 'goal_met' | 'cancelled'
  enrolled_at: string
  completed_at: string | null
  goal_met_at: string | null
  last_step_sent_at: string | null
  metadata: Record<string, any>
}

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function verifyAuth() {
  const supabase = await createServerSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}

async function verifySiteOwnership(siteId: string, userId: string) {
  const { data: site } = await supabaseAdmin
    .from('sites')
    .select('id')
    .eq('id', siteId)
    .eq('user_id', userId)
    .single()
  return !!site
}

// --- Automations ---

export async function getAutomationsBySite(siteId: string, options?: { page?: number; pageSize?: number }): Promise<{ data: EmailAutomation[] | null; total: number; error: string | null }> {
  try {
    if (!UUID_REGEX.test(siteId)) return { data: null, total: 0, error: 'Invalid site ID' }
    const user = await verifyAuth()
    if (!user) return { data: null, total: 0, error: 'Not authenticated' }
    if (!await verifySiteOwnership(siteId, user.id)) return { data: null, total: 0, error: 'Access denied' }

    const page = Math.max(1, Math.floor(options?.page ?? 1))
    const pageSize = Math.min(100, Math.max(1, Math.floor(options?.pageSize ?? 50)))
    const from = (page - 1) * pageSize
    const to = from + pageSize - 1

    const { data, error, count } = await supabaseAdmin
      .from('email_automations')
      .select('*', { count: 'exact' })
      .eq('site_id', siteId)
      .order('created_at', { ascending: false })
      .range(from, to)

    if (error) {
      console.error('getAutomationsBySite error:', error.message)
      return { data: null, total: 0, error: 'Failed to load automations' }
    }

    // Get counts
    const automations = data as EmailAutomation[]
    if (automations.length) {
      const ids = automations.map(a => a.id)

      const { data: steps } = await supabaseAdmin
        .from('email_automation_steps')
        .select('automation_id')
        .in('automation_id', ids)

      const { data: enrollments } = await supabaseAdmin
        .from('email_automation_enrollments')
        .select('automation_id')
        .in('automation_id', ids)

      const stepCounts: Record<string, number> = {}
      for (const s of steps ?? []) {
        stepCounts[s.automation_id] = (stepCounts[s.automation_id] || 0) + 1
      }
      const enrollmentCounts: Record<string, number> = {}
      for (const e of enrollments ?? []) {
        enrollmentCounts[e.automation_id] = (enrollmentCounts[e.automation_id] || 0) + 1
      }

      for (const a of automations) {
        a.steps_count = stepCounts[a.id] || 0
        a.enrollments_count = enrollmentCounts[a.id] || 0
      }
    }

    return { data: automations, total: count ?? 0, error: null }
  } catch (err) {
    console.error('getAutomationsBySite error:', err)
    return { data: null, total: 0, error: 'Server error' }
  }
}

export async function getAutomationById(automationId: string): Promise<{ data: EmailAutomation | null; steps: AutomationStep[] | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(automationId)) return { data: null, steps: null, error: 'Invalid ID' }
    const user = await verifyAuth()
    if (!user) return { data: null, steps: null, error: 'Not authenticated' }

    const { data: automation, error } = await supabaseAdmin
      .from('email_automations')
      .select('*')
      .eq('id', automationId)
      .single()

    if (error || !automation) return { data: null, steps: null, error: 'Automation not found' }
    if (!await verifySiteOwnership(automation.site_id, user.id)) return { data: null, steps: null, error: 'Access denied' }

    const { data: steps } = await supabaseAdmin
      .from('email_automation_steps')
      .select('*')
      .eq('automation_id', automationId)
      .order('step_order', { ascending: true })

    return { data: automation as EmailAutomation, steps: (steps as AutomationStep[]) || [], error: null }
  } catch (err) {
    console.error('getAutomationById error:', err)
    return { data: null, steps: null, error: 'Server error' }
  }
}

export async function createAutomation(input: {
  siteId: string
  name: string
  description?: string
  triggerType: 'lead_magnet_signup' | 'paid_purchase'
  triggerConfig?: Record<string, any>
}): Promise<{ data: EmailAutomation | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(input.siteId)) return { data: null, error: 'Invalid site ID' }
    const user = await verifyAuth()
    if (!user) return { data: null, error: 'Not authenticated' }
    if (!await verifySiteOwnership(input.siteId, user.id)) return { data: null, error: 'Access denied' }
    if (!input.name?.trim()) return { data: null, error: 'Name is required' }

    const { data, error } = await supabaseAdmin
      .from('email_automations')
      .insert({
        site_id: input.siteId,
        name: input.name.trim(),
        description: input.description || null,
        trigger_type: input.triggerType,
        trigger_config: input.triggerConfig || {},
      })
      .select()
      .single()

    if (error) {
      console.error('createAutomation error:', error.message)
      return { data: null, error: 'Failed to create automation' }
    }
    return { data: data as EmailAutomation, error: null }
  } catch (err) {
    console.error('createAutomation error:', err)
    return { data: null, error: 'Server error' }
  }
}

export async function updateAutomation(
  automationId: string,
  updates: { name?: string; description?: string; status?: string; trigger_config?: Record<string, any>; goal_type?: string; goal_config?: Record<string, any> }
): Promise<{ data: EmailAutomation | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(automationId)) return { data: null, error: 'Invalid ID' }
    const user = await verifyAuth()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data: automation } = await supabaseAdmin
      .from('email_automations').select('site_id').eq('id', automationId).single()
    if (!automation) return { data: null, error: 'Not found' }
    if (!await verifySiteOwnership(automation.site_id, user.id)) return { data: null, error: 'Access denied' }

    if (updates.status !== undefined && !['draft', 'active', 'paused'].includes(updates.status)) {
      return { data: null, error: 'Invalid status' }
    }

    const fields: Record<string, any> = {}
    if (updates.name !== undefined) fields.name = updates.name
    if (updates.description !== undefined) fields.description = updates.description
    if (updates.status !== undefined) fields.status = updates.status
    if (updates.trigger_config !== undefined) fields.trigger_config = updates.trigger_config
    if (updates.goal_type !== undefined) fields.goal_type = updates.goal_type
    if (updates.goal_config !== undefined) fields.goal_config = updates.goal_config

    const { data, error } = await supabaseAdmin
      .from('email_automations').update(fields).eq('id', automationId).select().single()

    if (error) {
      console.error('updateAutomation error:', error.message)
      return { data: null, error: 'Failed to update' }
    }
    return { data: data as EmailAutomation, error: null }
  } catch (err) {
    console.error('updateAutomation error:', err)
    return { data: null, error: 'Server error' }
  }
}

export async function deleteAutomations(ids: string[]): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!ids.length) return { success: false, error: 'No items selected' }
    for (const id of ids) { if (!UUID_REGEX.test(id)) return { success: false, error: 'Invalid ID' } }
    const user = await verifyAuth()
    if (!user) return { success: false, error: 'Not authenticated' }

    const { data: automations } = await supabaseAdmin
      .from('email_automations').select('id, site_id').in('id', ids)
    if (!automations?.length) return { success: false, error: 'Not found' }

    const siteIds = [...new Set(automations.map(a => a.site_id))]
    const { data: sites } = await supabaseAdmin
      .from('sites').select('id').in('id', siteIds).eq('user_id', user.id)
    if (!sites?.length || sites.length !== siteIds.length) return { success: false, error: 'Access denied' }

    const { error } = await supabaseAdmin.from('email_automations').delete().in('id', ids)
    if (error) {
      console.error('deleteAutomations error:', error.message)
      return { success: false, error: 'Failed to delete' }
    }
    return { success: true, error: null }
  } catch (err) {
    console.error('deleteAutomations error:', err)
    return { success: false, error: 'Server error' }
  }
}

/** Internal — called from API routes only. Returns just IDs for enrollment. */
export async function findActiveAutomations(
  siteId: string, triggerType: string, productId?: string
): Promise<{ id: string }[]> {
  if (!UUID_REGEX.test(siteId)) return []

  const { data } = await supabaseAdmin
    .from('email_automations')
    .select('id, trigger_config')
    .eq('site_id', siteId)
    .eq('status', 'active')
    .eq('trigger_type', triggerType)

  if (!data) return []

  const filtered = productId
    ? data.filter(a => !a.trigger_config?.product_id || a.trigger_config.product_id === productId)
    : data

  return filtered.map(a => ({ id: a.id }))
}

// --- Steps ---

export async function createStep(input: {
  automationId: string
  stepOrder: number
  nodeType: 'email' | 'delay'
  nodeConfig?: Record<string, any>
  delayMinutes?: number
  subject?: string
  content?: string
}): Promise<{ data: AutomationStep | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(input.automationId)) return { data: null, error: 'Invalid ID' }
    const user = await verifyAuth()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data: automation } = await supabaseAdmin
      .from('email_automations').select('site_id').eq('id', input.automationId).single()
    if (!automation) return { data: null, error: 'Automation not found' }
    if (!await verifySiteOwnership(automation.site_id, user.id)) return { data: null, error: 'Access denied' }

    const { data, error } = await supabaseAdmin
      .from('email_automation_steps')
      .insert({
        automation_id: input.automationId,
        step_order: input.stepOrder,
        node_type: input.nodeType,
        node_config: input.nodeConfig || {},
        delay_minutes: input.delayMinutes || 0,
        subject: input.subject || null,
        content: input.content || '',
      })
      .select().single()

    if (error) {
      console.error('createStep error:', error.message)
      return { data: null, error: 'Failed to create node' }
    }
    return { data: data as AutomationStep, error: null }
  } catch (err) {
    console.error('createStep error:', err)
    return { data: null, error: 'Server error' }
  }
}

/** Reorder steps — shift existing steps to make room for inserts */
export async function reorderSteps(automationId: string, stepIds: string[]): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!UUID_REGEX.test(automationId)) return { success: false, error: 'Invalid ID' }
    const user = await verifyAuth()
    if (!user) return { success: false, error: 'Not authenticated' }

    const { data: automation } = await supabaseAdmin
      .from('email_automations').select('site_id').eq('id', automationId).single()
    if (!automation) return { success: false, error: 'Not found' }
    if (!await verifySiteOwnership(automation.site_id, user.id)) return { success: false, error: 'Access denied' }

    for (let i = 0; i < stepIds.length; i++) {
      await supabaseAdmin
        .from('email_automation_steps')
        .update({ step_order: i + 1 })
        .eq('id', stepIds[i])
    }

    return { success: true, error: null }
  } catch (err) {
    console.error('reorderSteps error:', err)
    return { success: false, error: 'Server error' }
  }
}

export async function updateStep(
  stepId: string,
  updates: { subject?: string; content?: string; delay_minutes?: number; node_config?: Record<string, any> }
): Promise<{ data: AutomationStep | null; error: string | null }> {
  try {
    if (!UUID_REGEX.test(stepId)) return { data: null, error: 'Invalid ID' }
    const user = await verifyAuth()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data: step } = await supabaseAdmin
      .from('email_automation_steps').select('automation_id').eq('id', stepId).single()
    if (!step) return { data: null, error: 'Step not found' }

    const { data: automation } = await supabaseAdmin
      .from('email_automations').select('site_id').eq('id', step.automation_id).single()
    if (!automation) return { data: null, error: 'Automation not found' }
    if (!await verifySiteOwnership(automation.site_id, user.id)) return { data: null, error: 'Access denied' }

    const fields: Record<string, any> = {}
    if (updates.subject !== undefined) fields.subject = updates.subject
    if (updates.content !== undefined) fields.content = updates.content
    if (updates.delay_minutes !== undefined) fields.delay_minutes = updates.delay_minutes
    if (updates.node_config !== undefined) fields.node_config = updates.node_config

    const { data, error } = await supabaseAdmin
      .from('email_automation_steps').update(fields).eq('id', stepId).select().single()

    if (error) {
      console.error('updateStep error:', error.message)
      return { data: null, error: 'Failed to update step' }
    }
    return { data: data as AutomationStep, error: null }
  } catch (err) {
    console.error('updateStep error:', err)
    return { data: null, error: 'Server error' }
  }
}

export async function deleteStep(stepId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!UUID_REGEX.test(stepId)) return { success: false, error: 'Invalid ID' }
    const user = await verifyAuth()
    if (!user) return { success: false, error: 'Not authenticated' }

    const { data: step } = await supabaseAdmin
      .from('email_automation_steps').select('automation_id').eq('id', stepId).single()
    if (!step) return { success: false, error: 'Step not found' }

    const { data: automation } = await supabaseAdmin
      .from('email_automations').select('site_id').eq('id', step.automation_id).single()
    if (!automation) return { success: false, error: 'Automation not found' }
    if (!await verifySiteOwnership(automation.site_id, user.id)) return { success: false, error: 'Access denied' }

    const { error } = await supabaseAdmin.from('email_automation_steps').delete().eq('id', stepId)
    if (error) {
      console.error('deleteStep error:', error.message)
      return { success: false, error: 'Failed to delete step' }
    }
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
    const { data: automation } = await supabaseAdmin
      .from('email_automations').select('site_id').eq('id', automationId).single()
    const { data: contact } = await supabaseAdmin
      .from('newsletter_contacts').select('site_id').eq('id', contactId).single()
    if (!automation || !contact || automation.site_id !== contact.site_id) {
      return { success: false, error: 'Invalid enrollment' }
    }

    const { error } = await supabaseAdmin
      .from('email_automation_enrollments')
      .upsert({
        automation_id: automationId,
        contact_id: contactId,
        status: 'active',
        current_step_order: 0,
        enrolled_at: new Date().toISOString(),
      }, { onConflict: 'automation_id,contact_id' })

    if (error) {
      console.error('enrollContact error:', error.message)
      return { success: false, error: 'Failed to enroll' }
    }
    return { success: true, error: null }
  } catch (err) {
    console.error('enrollContact error:', err)
    return { success: false, error: 'Server error' }
  }
}

export async function cancelEnrollment(enrollmentId: string): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!UUID_REGEX.test(enrollmentId)) return { success: false, error: 'Invalid ID' }
    const user = await verifyAuth()
    if (!user) return { success: false, error: 'Not authenticated' }

    // Verify ownership: enrollment → automation → site
    const { data: enrollment } = await supabaseAdmin
      .from('email_automation_enrollments')
      .select('automation_id')
      .eq('id', enrollmentId)
      .single()
    if (!enrollment) return { success: false, error: 'Not found' }

    const { data: automation } = await supabaseAdmin
      .from('email_automations')
      .select('site_id')
      .eq('id', enrollment.automation_id)
      .single()
    if (!automation) return { success: false, error: 'Not found' }
    if (!await verifySiteOwnership(automation.site_id, user.id)) return { success: false, error: 'Access denied' }

    const { error } = await supabaseAdmin
      .from('email_automation_enrollments')
      .update({ status: 'cancelled' })
      .eq('id', enrollmentId)

    if (error) {
      console.error('cancelEnrollment error:', error.message)
      return { success: false, error: 'Failed to cancel' }
    }
    return { success: true, error: null }
  } catch (err) {
    console.error('cancelEnrollment error:', err)
    return { success: false, error: 'Server error' }
  }
}

export async function getAutomationReport(automationId: string): Promise<{
  data: { totalEnrolled: number; completed: number; goalMet: number; cancelled: number; stepStats: { step_order: number; subject: string; sent: number; opened: number; clicked: number }[] } | null
  error: string | null
}> {
  try {
    if (!UUID_REGEX.test(automationId)) return { data: null, error: 'Invalid ID' }
    const user = await verifyAuth()
    if (!user) return { data: null, error: 'Not authenticated' }

    const { data: automation } = await supabaseAdmin
      .from('email_automations').select('site_id').eq('id', automationId).single()
    if (!automation) return { data: null, error: 'Not found' }
    if (!await verifySiteOwnership(automation.site_id, user.id)) return { data: null, error: 'Access denied' }

    // Enrollment counts
    const { data: enrollments } = await supabaseAdmin
      .from('email_automation_enrollments')
      .select('status')
      .eq('automation_id', automationId)

    const counts = { totalEnrolled: 0, completed: 0, goalMet: 0, cancelled: 0 }
    for (const e of enrollments ?? []) {
      counts.totalEnrolled++
      if (e.status === 'completed') counts.completed++
      else if (e.status === 'goal_met') counts.goalMet++
      else if (e.status === 'cancelled') counts.cancelled++
    }

    // Step stats from events
    const { data: steps } = await supabaseAdmin
      .from('email_automation_steps')
      .select('step_order, subject')
      .eq('automation_id', automationId)
      .order('step_order', { ascending: true })

    const { data: events } = await supabaseAdmin
      .from('newsletter_events')
      .select('event_type, metadata')
      .eq('source_type', 'automation')
      .eq('source_id', automationId)

    const stepStats = (steps ?? []).map(s => {
      const stepEvents = (events ?? []).filter(e => e.metadata?.step_order === s.step_order)
      return {
        step_order: s.step_order,
        subject: s.subject,
        sent: stepEvents.filter(e => e.event_type === 'sent').length,
        opened: stepEvents.filter(e => e.event_type === 'opened').length,
        clicked: stepEvents.filter(e => e.event_type === 'clicked').length,
      }
    })

    return { data: { ...counts, stepStats }, error: null }
  } catch (err) {
    console.error('getAutomationReport error:', err)
    return { data: null, error: 'Server error' }
  }
}
