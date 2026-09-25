import { and, asc, eq, lte } from "drizzle-orm"

import {
  automationCompiledConfigSchema,
  type AutomationCompiledConfig,
} from "@/lib/automations/compile"
import { timeActivateNode } from "@/lib/automations/nodes/time-activate"
import {
  getNextAutomationRunAt,
  readAutomationSchedule,
} from "@/lib/automations/schedule"
import { automationEntryNodeId } from "@/lib/automations/run"
import { db, type CustomShellDb } from "@/server/db"
import {
  customShellAutomationRuns,
  customShellAutomations,
} from "@/server/schema"
import { now, uuid } from "@/server/auth/security"

const DUE_SCHEDULE_LIMIT = 100
// The ticker runs every 15 seconds. A second interval leaves room for one slow
// pass without turning an occurrence from hours ago into a catch-up run.
const SCHEDULE_GRACE_MS = 30_000

/** The denormalized time the ticker can find without reading every graph. */
export function nextScheduledRunAt(
  config: AutomationCompiledConfig | null,
  enabled: boolean,
  after: Date = now()
): Date | null {
  if (!enabled || !config) return null
  const entryNodeId = automationEntryNodeId(config)
  const entry = entryNodeId ? config.nodes[entryNodeId] : undefined
  if (!entry || entry.kind !== timeActivateNode.kind) return null
  const schedule = readAutomationSchedule(entry.settings)
  return schedule ? getNextAutomationRunAt(schedule, after) : null
}

/**
 * Starts due Time flows once and advances their next occurrence atomically.
 *
 * The update still requires the exact due time read above. Two servers may see
 * the same row, but only one can replace that value and earn the right to add
 * its run. Recomputing after `timestamp` skips downtime instead of catching up
 * every missed occurrence in a burst.
 */
export async function runTimeActivateTriggers(
  database: CustomShellDb = db,
  timestamp: Date = now()
): Promise<number> {
  const due = await database
    .select()
    .from(customShellAutomations)
    .where(
      and(
        eq(customShellAutomations.enabled, true),
        lte(customShellAutomations.nextRunAt, timestamp)
      )
    )
    .orderBy(asc(customShellAutomations.nextRunAt))
    .limit(DUE_SCHEDULE_LIMIT)

  let started = 0
  for (const automation of due) {
    const parsed = automationCompiledConfigSchema.safeParse(
      automation.compiledConfig
    )
    const config = parsed.success ? parsed.data : null
    const entryNodeId = config ? automationEntryNodeId(config) : null
    const entry = entryNodeId && config ? config.nodes[entryNodeId] : undefined
    const schedule =
      entry?.kind === timeActivateNode.kind
        ? readAutomationSchedule(entry.settings)
        : null
    const scheduledAt = automation.nextRunAt
    if (!scheduledAt) continue
    const nextRunAt = schedule
      ? getNextAutomationRunAt(schedule, timestamp)
      : null
    const missed =
      timestamp.getTime() - scheduledAt.getTime() > SCHEDULE_GRACE_MS

    const inserted = await database.transaction(async (tx) => {
      const [claimed] = await tx
        .update(customShellAutomations)
        .set({
          enabled: nextRunAt !== null,
          nextRunAt,
          updatedAt: timestamp,
        })
        .where(
          and(
            eq(customShellAutomations.id, automation.id),
            eq(customShellAutomations.enabled, true),
            eq(customShellAutomations.nextRunAt, scheduledAt)
          )
        )
        .returning({ id: customShellAutomations.id })
      if (!claimed || !config || !entryNodeId || !schedule || missed) {
        return false
      }

      const [run] = await tx
        .insert(customShellAutomationRuns)
        .values({
          id: uuid(),
          automationId: automation.id,
          userId: automation.userId,
          workspaceId: automation.workspaceId,
          status: "active",
          currentNodeId: entryNodeId,
          configSnapshot: config,
          wakeAt: timestamp,
          attempts: 0,
          triggerKind: timeActivateNode.kind,
          triggerKey: `${timeActivateNode.kind}:${scheduledAt.toISOString()}`,
          triggerFacts: {
            scheduledAt: scheduledAt.toISOString(),
            timezone: schedule.timezone,
          },
          startedAt: timestamp,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .onConflictDoNothing()
        .returning({ id: customShellAutomationRuns.id })
      return Boolean(run)
    })
    if (inserted) started += 1
  }

  return started
}
