import { and, eq, isNotNull } from "drizzle-orm"

import { compiledConfigSchema } from "@/lib/automations/compiled-config"
import { db, type CustomShellDb } from "@/server/db"
import {
  newsletterAutomationRuns,
  newsletterAutomations,
  type NewsletterContact,
} from "@/server/schema"
import { now, uuid } from "@/server/security"

export function matchTrigger(
  settings: { source?: string; tags?: string[] },
  appKey: string,
  contactTags: string[]
) {
  if (settings.source && settings.source !== appKey) return false
  if (settings.tags?.length) {
    return settings.tags.every((tag) => contactTags.includes(tag))
  }
  return true
}

/**
 * Enrolls a contact into every active automation whose trigger matches.
 * Enrollment is once-ever per (automation, contact) — repeat ingests are
 * ignored via the unique constraint. Returns the automation ids of runs that
 * were actually created.
 */
export async function enrollContact(
  workspaceId: string,
  contact: NewsletterContact,
  appKey: string,
  database: CustomShellDb = db
): Promise<string[]> {
  const automations = await database
    .select()
    .from(newsletterAutomations)
    .where(
      and(
        eq(newsletterAutomations.workspaceId, workspaceId),
        eq(newsletterAutomations.status, "active"),
        isNotNull(newsletterAutomations.compiledConfig)
      )
    )

  const enrolled: string[] = []
  const timestamp = now()

  for (const automation of automations) {
    const parsed = compiledConfigSchema.safeParse(automation.compiledConfig)
    if (!parsed.success) continue

    const config = parsed.data
    const entry = config.nodes[config.entryNodeId]
    if (entry?.kind !== "trigger") continue
    if (!matchTrigger(entry.settings, appKey, contact.tags)) continue

    const [run] = await database
      .insert(newsletterAutomationRuns)
      .values({
        id: uuid(),
        automationId: automation.id,
        contactId: contact.id,
        workspaceId,
        status: "active",
        currentNodeId: config.entryNodeId,
        configSnapshot: config,
        wakeAt: timestamp,
        attempts: 0,
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .onConflictDoNothing({
        target: [
          newsletterAutomationRuns.automationId,
          newsletterAutomationRuns.contactId,
        ],
      })
      .returning({ automationId: newsletterAutomationRuns.automationId })

    if (run) enrolled.push(run.automationId)
  }

  return enrolled
}
