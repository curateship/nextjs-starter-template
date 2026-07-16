import { and, eq } from 'drizzle-orm'

import { db } from '@/lib/db'
import {
  emailAutomations,
  emailAutomationEnrollments,
  newsletterContacts,
} from '@/lib/db/schema'
import { UUID_REGEX } from '@/lib/utils/validation'
import {
  getAutomationTriggerNodes,
  isAutomationTriggerType,
  matchesAutomationTrigger,
  type AutomationTriggerType,
} from './automation-triggers'

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
    .filter((automation) => {
      const triggerNodes = getAutomationTriggerNodes(
        automation.triggerType,
        automation.triggerConfig as Record<string, any> | null | undefined
      )
      return triggerNodes.some((node) => matchesAutomationTrigger(node, triggerType, filterId))
    })
    .map((automation) => ({ id: automation.id }))
}

export async function enrollContact(
  automationId: string,
  contactId: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    if (!UUID_REGEX.test(automationId) || !UUID_REGEX.test(contactId)) {
      return { success: false, error: 'Invalid ID' }
    }

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
  } catch (error) {
    console.error('enrollContact error:', error)
    return { success: false, error: 'Server error' }
  }
}
