import { and, eq, sql } from "drizzle-orm"

import {
  nextDripWindowOpen,
  pickBatchSize,
  pickWaitMs,
  type DripConfig,
} from "@/lib/broadcasts/drip"
import { readDripStep } from "@/lib/automations/nodes/drip"
import { formatScheduledInstant } from "@/lib/automations/schedule"
import type { CustomShellDb } from "@/server/db"
import type {
  AutomationExecutor,
  AutomationExecutorResult,
} from "@/server/automations/executors"
import { flowSwitchedOff } from "@/server/automations/wait"
import {
  customShellAutomationDeliveries,
  customShellAutomationRuns,
  customShellAutomationRunSteps,
  customShellAutomations,
  customShellContacts,
} from "@/server/schema"

/**
 * The Drip step (Tyler, 23 Nov 2026: "Create a new flow node called
 * \"Drip\""). A run that reaches it is given a place in a batch and sleeps
 * until that batch's time, then carries on.
 *
 * Nothing new is stored. A run's place is the `releaseAt` on the line it
 * writes going to sleep, so the last batch handed out, and how many it holds,
 * are read back from those lines. Each batch's size and the gap after it are
 * picked from the pace's ranges with the batch's own time as the seed, so
 * every run asking about the same batch gets the same answer.
 *
 * A run keeps the flow as it was when its person was let in, so a pace
 * changed in the step reaches people let in after the change. For a while
 * people on the old pace and the new one share batches.
 */

/**
 * Below this many sent emails a bounce rate says nothing: three bounces out
 * of four is a small list, not a bad one. The same floor newsletters use.
 */
const BOUNCE_SAMPLE_MINIMUM = 20

/** A repeatable number in [0, 1) from a string (FNV-1a). */
function seededRandom(seed: string): () => number {
  let hash = 0x811c9dc5
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  const value = (hash >>> 0) / 0x1_0000_0000
  return () => value
}

/** How many the batch at `releaseAt` holds, the same answer every time. */
export function dripBatchSize(pace: DripConfig, nodeKey: string, releaseAt: string) {
  return pickBatchSize(pace, seededRandom(`${nodeKey}:size:${releaseAt}`))
}

/** When the batch after the one at `last` may go, kept to the sending hours. */
export function dripNextBatchAt(pace: DripConfig, nodeKey: string, last: Date | null, at: Date) {
  const earliest = last
    ? new Date(last.getTime() + pickWaitMs(pace, seededRandom(`${nodeKey}:gap:${last.toISOString()}`)))
    : at
  return nextDripWindowOpen(pace, earliest > at ? earliest : at)
}

/** This run's place at this step, once it has been given one. */
async function placeOf(runId: string, nodeId: string, database: CustomShellDb) {
  const [row] = await database
    .select({ releaseAt: sql<string | null>`${customShellAutomationRunSteps.output}->>'releaseAt'` })
    .from(customShellAutomationRunSteps)
    .where(
      and(
        eq(customShellAutomationRunSteps.runId, runId),
        eq(customShellAutomationRunSteps.nodeId, nodeId),
        eq(customShellAutomationRunSteps.status, "completed"),
        sql`${customShellAutomationRunSteps.output} ? 'releaseAt'`
      )
    )
    .limit(1)
  return row?.releaseAt ?? null
}

/** The newest batch this step has handed places in, and how many it holds. */
async function lastBatch(automationId: string, nodeId: string, database: CustomShellDb) {
  const releaseAt = sql<string>`${customShellAutomationRunSteps.output}->>'releaseAt'`
  const [row] = await database
    .select({ releaseAt, places: sql<number>`count(*)::int` })
    .from(customShellAutomationRunSteps)
    .innerJoin(customShellAutomationRuns, eq(customShellAutomationRuns.id, customShellAutomationRunSteps.runId))
    .where(
      and(
        eq(customShellAutomationRuns.automationId, automationId),
        eq(customShellAutomationRuns.testRun, false),
        eq(customShellAutomationRunSteps.nodeId, nodeId),
        sql`${customShellAutomationRunSteps.output} ? 'releaseAt'`
      )
    )
    .groupBy(releaseAt)
    .orderBy(sql`${releaseAt} desc`)
    .limit(1)
  return row ? { releaseAt: row.releaseAt, places: row.places } : null
}

/**
 * How many of this flow's sent emails went to somebody whose address has since
 * bounced. Automation mail has no bounce stamp of its own; Resend's bounce
 * report marks the contact, so the contact's status is the record of it.
 */
async function bounceCounts(automationId: string, database: CustomShellDb) {
  const [row] = await database
    .select({
      sent: sql<number>`count(distinct ${customShellAutomationDeliveries.contactId})::int`,
      bounced: sql<number>`count(distinct ${customShellAutomationDeliveries.contactId}) filter (where ${customShellContacts.status} = 'bounced')::int`,
    })
    .from(customShellAutomationDeliveries)
    .innerJoin(customShellAutomationRuns, eq(customShellAutomationRuns.id, customShellAutomationDeliveries.runId))
    .innerJoin(customShellContacts, eq(customShellContacts.id, customShellAutomationDeliveries.contactId))
    .where(
      and(
        eq(customShellAutomationRuns.automationId, automationId),
        eq(customShellAutomationRuns.testRun, false),
        eq(customShellAutomationDeliveries.status, "sent")
      )
    )
  return { sent: row?.sent ?? 0, bounced: row?.bounced ?? 0 }
}

/**
 * Whether this flow is over its bounce limit, asked once per batch rather than
 * once per person: the count reads every email the flow has sent, and twenty
 * thousand people would read it twenty thousand times. Held in this process
 * only; after a restart the next person to go on asks again.
 */
const bounceVerdicts = new Map<string, boolean>()

async function overBounceLimit(batchKey: string, automationId: string, pace: DripConfig, database: CustomShellDb) {
  const known = bounceVerdicts.get(batchKey)
  if (known !== undefined) return known
  const bounces = await bounceCounts(automationId, database)
  const over =
    bounces.sent >= BOUNCE_SAMPLE_MINIMUM &&
    (bounces.bounced / bounces.sent) * 100 >= pace.bounceThresholdPercent
  if (bounceVerdicts.size >= 1000) bounceVerdicts.clear()
  bounceVerdicts.set(batchKey, over)
  return over
}

/**
 * Gives the run a place on the first visit and lets it go on the second.
 *
 * A place is in the newest batch while that batch has room, otherwise in a new
 * one after the gap. The flow's row is locked while a place is handed out, so
 * two runs walked at the same moment take turns.
 */
export const executeDripNode: AutomationExecutor = async ({
  database,
  run,
  nodeId,
  settings,
  now,
  testRun,
}): Promise<AutomationExecutorResult> => {
  if (testRun) {
    return { type: "next", summary: "Would wait for its batch. Skipped in this test." }
  }
  const pace = readDripStep(settings)
  const nodeKey = `${run.automationId}:${nodeId}`

  const place = await placeOf(run.id, nodeId, database)
  if (!place) {
    const at = now()
    const releaseAt = await database.transaction(async (tx) => {
      await tx.execute(sql`select id from automations where id = ${run.automationId} for update`)
      const last = await lastBatch(run.automationId, nodeId, tx)
      const next = dripNextBatchAt(pace, nodeKey, last ? new Date(last.releaseAt) : null, at)
      // The newest batch takes more only while its gap is still running.
      // Once the gap is over a new batch starts, or a half-empty old batch
      // and a full new one would go out together.
      if (last && next > at && last.places < dripBatchSize(pace, nodeKey, last.releaseAt)) {
        return last.releaseAt
      }
      return next.toISOString()
    })
    const until = new Date(releaseAt)
    return {
      type: "sleep",
      until: until > at ? until : at,
      summary:
        until > at
          ? `Waiting for its batch, at ${formatScheduledInstant(until, pace.timezone)}.`
          : "In the batch going now.",
      output: { releaseAt },
    }
  }

  if (await flowSwitchedOff(run, database)) {
    return {
      type: "complete",
      summary: "The flow was switched off while this run waited for its batch, so the rest of it stopped.",
    }
  }

  // Once a batch, when its first person goes on: bounces arrive minutes after
  // the emails, so the batch after the one that tipped it over is the one
  // stopped. The rest of the batch reuse the answer.
  if (await overBounceLimit(`${nodeKey}:${place}`, run.automationId, pace, database)) {
    const bounces = await bounceCounts(run.automationId, database)
    const reason = `Stopped on its own: ${bounces.bounced} of the ${bounces.sent} people sent to so far bounced, which is over the Drip step's ${pace.bounceThresholdPercent} in 100 limit. Clean up who this flow sends to before switching it back on.`
    await database
      .update(customShellAutomations)
      .set({ enabled: false, pausedReason: reason, updatedAt: now() })
      .where(eq(customShellAutomations.id, run.automationId))
    return { type: "complete", summary: reason }
  }

  return { type: "next", summary: `Went on with the batch of ${formatScheduledInstant(new Date(place), pace.timezone)}.` }
}
