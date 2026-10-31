import { and, asc, desc, eq, isNotNull } from "drizzle-orm"

import { nextDripWindowOpen } from "@/lib/broadcasts/drip"
import {
  describeWaitLength,
  readWaitSettings,
  waitDurationMs,
} from "@/lib/automations/nodes/wait"
import { formatScheduledInstant } from "@/lib/automations/schedule"
import type { CustomShellDb } from "@/server/db"
import type {
  AutomationExecutor,
  AutomationExecutorResult,
} from "@/server/automations/executors"
import { workspaceForRun } from "@/server/automations/runs"
import {
  automationStartsWithSegmentDrip,
  segmentDripPace,
} from "@/server/automations/segment-drip"
import {
  customShellAutomationDeliveries,
  customShellAutomationRuns,
  customShellAutomationRunSteps,
  customShellAutomations,
  type CustomShellAutomationRun,
} from "@/server/schema"

/**
 * When this run started waiting at this step, or null if it has not yet.
 *
 * A Wait is reached twice: once to go to sleep and once on waking. The engine
 * keeps the run pointed at the Wait while it sleeps, and the "Waiting until"
 * line written on the way in is how the second visit knows it is the second.
 * A flow cannot loop, so one Wait is only ever reached by one run once.
 */
async function waitingUntil(
  runId: string,
  nodeId: string,
  database: CustomShellDb
): Promise<string | null> {
  const [step] = await database
    .select({ output: customShellAutomationRunSteps.output })
    .from(customShellAutomationRunSteps)
    .where(
      and(
        eq(customShellAutomationRunSteps.runId, runId),
        eq(customShellAutomationRunSteps.nodeId, nodeId),
        eq(customShellAutomationRunSteps.status, "completed")
      )
    )
    .orderBy(desc(customShellAutomationRunSteps.startedAt))
    .limit(1)
  const output = step?.output
  return output &&
    typeof output === "object" &&
    !Array.isArray(output) &&
    typeof output.waitingUntil === "string"
    ? output.waitingUntil
    : null
}

/**
 * True when the flow was started by its trigger and has since been switched
 * off. Switching a sequence off has to stop the people already inside it, or
 * there would be no way to stop one short of deleting it.
 *
 * A run somebody started by hand is left alone: a flow that is only ever run
 * by hand is always off, and stopping it here would stop every one of them.
 */
async function flowSwitchedOff(
  run: CustomShellAutomationRun,
  database: CustomShellDb
): Promise<boolean> {
  if (!run.triggerKind) return false
  const [flow] = await database
    .select({ enabled: customShellAutomations.enabled })
    .from(customShellAutomations)
    .where(eq(customShellAutomations.id, run.automationId))
    .limit(1)
  return !flow?.enabled
}

/** The subject of the first email in this flow the run's person clicked. */
async function clickedEmailSubject(
  run: CustomShellAutomationRun,
  database: CustomShellDb
): Promise<string | null> {
  const person = run.subjectContactId
    ? eq(customShellAutomationDeliveries.contactId, run.subjectContactId)
    : run.subjectUserId
      ? eq(customShellAutomationDeliveries.userId, run.subjectUserId)
      : null
  if (!person) return null

  const [clicked] = await database
    .select({ subject: customShellAutomationDeliveries.subject })
    .from(customShellAutomationDeliveries)
    .innerJoin(
      customShellAutomationRuns,
      eq(customShellAutomationRuns.id, customShellAutomationDeliveries.runId)
    )
    .where(
      and(
        eq(customShellAutomationRuns.automationId, run.automationId),
        eq(customShellAutomationRuns.testRun, false),
        person,
        isNotNull(customShellAutomationDeliveries.clickedAt)
      )
    )
    .orderBy(asc(customShellAutomationDeliveries.clickedAt))
    .limit(1)
  return clicked?.subject ?? null
}

/**
 * Goes to sleep on the first visit and decides whether to carry on on the
 * second.
 *
 * The wake-up time is pushed into the sending hours when the flow starts with
 * the dripped segment start, so Email 2 cannot land at 3am because Email 1
 * went at 3pm two days and twelve hours earlier. A flow with any other start
 * has no sending hours to keep to and wakes at the exact time.
 */
export const executeWaitNode: AutomationExecutor = async ({
  database,
  run,
  nodeId,
  settings,
  now,
  testRun,
}): Promise<AutomationExecutorResult> => {
  const wait = readWaitSettings(settings)
  const length = describeWaitLength(wait)
  if (testRun) {
    return {
      type: "next",
      summary: `Would wait ${length}. Skipped in this test.`,
    }
  }

  if (!(await waitingUntil(run.id, nodeId, database))) {
    const pace = await segmentDripPace(
      await workspaceForRun(run, database),
      database
    )
    const exact = new Date(now().getTime() + waitDurationMs(wait))
    const until = automationStartsWithSegmentDrip(run.configSnapshot)
      ? nextDripWindowOpen(pace, exact)
      : exact
    return {
      type: "sleep",
      until,
      summary: `Waiting ${length}, until ${formatScheduledInstant(until, pace.timezone)}.`,
      output: { waitingUntil: until.toISOString() },
    }
  }

  if (await flowSwitchedOff(run, database)) {
    return {
      type: "complete",
      summary:
        "The flow was switched off while this run waited, so the rest of it stopped.",
    }
  }
  if (wait.stopOnClick) {
    const subject = await clickedEmailSubject(run, database)
    if (subject) {
      return {
        type: "complete",
        summary: `Clicked a link in "${subject}", so the rest of this flow stopped.`,
      }
    }
  }
  return { type: "next", summary: "Finished waiting." }
}
