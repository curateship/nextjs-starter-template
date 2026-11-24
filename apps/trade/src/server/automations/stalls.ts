import { and, eq, inArray, isNotNull, isNull, lt, notInArray, sql } from "drizzle-orm"

import { automationStalledNotificationText } from "@/lib/notification-types"
import { now, uuid } from "@/server/auth/security"
import type { CustomShellDb } from "@/server/db"
import { publishNotificationCreatedMany } from "@/server/notifications/events"
import {
  customShellAutomationRuns,
  customShellAutomations,
  customShellNotifications,
  customShellUsers,
} from "@/server/schema"

/**
 * The bell's notice that a live flow has stopped moving (Tyler, 23 Nov 2026:
 * picked "Bell alert when stalled", then "1 hour late").
 *
 * Late means a run whose time to move on came more than an hour ago and that
 * still has not moved. A planned hold is never late: a Drip batch and a Wait
 * keep a time still to come, the sending hours and weekends already folded
 * into it, and a run stopped at an approval step has another status.
 *
 * One stall is one notice. The flow keeps when admins were told, and that is
 * cleared once nobody in it is late, so the next stall tells them again.
 *
 * The check runs in the background pass, so a pass that has died cannot send
 * it. It is for a flow that is stuck while everything else moves.
 */

/** How late somebody must be before admins are told. */
export const STALL_AFTER_MS = 60 * 60_000

/** Asked at most this often, since the answer only changes over an hour. */
const CHECK_EVERY_MS = 60_000
let lastCheckedAt = 0

/** Told admins about newly stalled live flows; returns how many flows. */
export async function alertStalledFlows(
  database: CustomShellDb,
  options: { timestamp?: Date; force?: boolean } = {}
): Promise<number> {
  const timestamp = options.timestamp ?? now()
  if (!options.force && timestamp.getTime() - lastCheckedAt < CHECK_EVERY_MS) return 0
  lastCheckedAt = timestamp.getTime()
  const cutoff = new Date(timestamp.getTime() - STALL_AFTER_MS)

  const late = await database
    .select({
      automationId: customShellAutomationRuns.automationId,
      name: customShellAutomations.name,
      alertedAt: customShellAutomations.stallAlertedAt,
      people: sql<number>`count(*)::int`,
      // The run the notice opens: the one late longest.
      oldestRunId: sql<string>`(array_agg(${customShellAutomationRuns.id} order by ${customShellAutomationRuns.wakeAt}))[1]`,
    })
    .from(customShellAutomationRuns)
    .innerJoin(customShellAutomations, eq(customShellAutomations.id, customShellAutomationRuns.automationId))
    .where(
      and(
        eq(customShellAutomations.enabled, true),
        eq(customShellAutomations.kind, "flow"),
        eq(customShellAutomationRuns.status, "active"),
        eq(customShellAutomationRuns.testRun, false),
        lt(customShellAutomationRuns.wakeAt, cutoff)
      )
    )
    .groupBy(customShellAutomationRuns.automationId, customShellAutomations.name, customShellAutomations.stallAlertedAt)

  // Flows told about before that are moving again can be told next time.
  const stillLate = late.map((flow) => flow.automationId)
  await database
    .update(customShellAutomations)
    .set({ stallAlertedAt: null })
    .where(
      and(
        isNotNull(customShellAutomations.stallAlertedAt),
        stillLate.length ? notInArray(customShellAutomations.id, stillLate) : undefined
      )
    )

  const fresh = late.filter((flow) => !flow.alertedAt)
  if (fresh.length === 0) return 0

  const admins = await database
    .select({ id: customShellUsers.id })
    .from(customShellUsers)
    .where(and(eq(customShellUsers.role, "admin"), eq(customShellUsers.status, "active")))

  const recipients = await database.transaction(async (tx) => {
    // Claimed first, so two passes at once tell admins once.
    const claimed = await tx
      .update(customShellAutomations)
      .set({ stallAlertedAt: timestamp })
      .where(
        and(
          inArray(
            customShellAutomations.id,
            fresh.map((flow) => flow.automationId)
          ),
          isNull(customShellAutomations.stallAlertedAt)
        )
      )
      .returning({ id: customShellAutomations.id })
    const claimedIds = new Set(claimed.map((row) => row.id))
    const rows = fresh
      .filter((flow) => claimedIds.has(flow.automationId))
      .flatMap((flow) => {
        const text = automationStalledNotificationText(flow.name, flow.people)
        return admins.map((admin) => ({
          id: uuid(),
          recipientUserId: admin.id,
          actorUserId: null,
          type: "automation_stalled",
          automationRunId: flow.oldestRunId,
          message: text.message,
          detail: text.detail,
          createdAt: timestamp,
        }))
      })
    if (rows.length === 0) return []
    const inserted = await tx
      .insert(customShellNotifications)
      .values(rows)
      .returning({ recipientUserId: customShellNotifications.recipientUserId })
    return inserted.map((row) => row.recipientUserId)
  })
  await publishNotificationCreatedMany(recipients, database)
  return fresh.length
}
