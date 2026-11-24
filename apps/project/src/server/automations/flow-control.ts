import { and, eq, inArray, isNotNull, lt, or, sql, type SQL } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import { sendSequenceNode } from "@/lib/automations/nodes/send-sequence"
import { now } from "@/server/auth/security"
import { setAutomationEnabled } from "@/server/automations/flows"
import { db, type CustomShellDb } from "@/server/db"
import {
  customShellAutomationMemberEventEnrollments,
  customShellAutomationRuns,
  customShellAutomationSegmentEnrollments,
  customShellAutomations,
  type CustomShellAutomation,
  type CustomShellAutomationRun,
} from "@/server/schema"

/**
 * Pause, Resume and Stop for one live flow (Tyler, 24 Nov 2026: "We need to
 * add a pause, start and stop to the automation ... stop would clear all the
 * sending queues").
 *
 * **Pause** holds everyone where they stand, in the flow and in every sequence
 * it started, the way the site-wide kill switch does for every flow at once
 * (`pause.ts`): the engine claims none of their runs, a step already running
 * finishes, and an approval's deadline stops counting down. The flow stays
 * live, so a new arrival still gets a run, and it waits at the first step
 * (Tyler: "Let in, hold at start").
 *
 * **Resume** lets them all carry on from where they stood. Each sends only its
 * next email, never everything it missed.
 *
 * **Stop** switches the flow off and ends every unfinished run of it and of
 * the sequences it started, so nothing more is sent. The people it ended may
 * come in again from the top when Run is next pressed (Tyler: "Start over
 * from the top"); people who had finished it, every email included, never do.
 */

const runs = customShellAutomationRuns
const startedBy = alias(customShellAutomationRuns, "started_by")

/** The live flow, locked for the change, or a refusal the button can word. */
async function lockedLiveFlow(
  workspaceId: string,
  automationId: string,
  database: CustomShellDb
): Promise<CustomShellAutomation> {
  await database.execute(sql`
    select id from automations
    where id = ${automationId} and workspace_id = ${workspaceId}
    for update
  `)
  const [flow] = await database
    .select()
    .from(customShellAutomations)
    .where(
      and(
        eq(customShellAutomations.id, automationId),
        eq(customShellAutomations.workspaceId, workspaceId),
        eq(customShellAutomations.kind, "flow")
      )
    )
    .limit(1)
  if (!flow) throw new Error("NOT_FOUND")
  if (!flow.enabled) throw new Error("NOT_LIVE")
  return flow
}

/**
 * A flow's own real runs, and the real sequence runs any of them started.
 * Every sequence, not only those the flow names now (as `flow-runs.ts`
 * narrows to), so a sequence edited out of the flow still stops with it.
 */
function runsOfFlow(automationId: string): SQL {
  const flowRunIds = sql`(select id from automation_runs where automation_id = ${automationId} and not test_run)`
  return and(
    eq(runs.testRun, false),
    or(
      eq(runs.automationId, automationId),
      and(
        eq(runs.triggerKind, sendSequenceNode.kind),
        sql`split_part(${runs.triggerKey}, ':', 2) in ${flowRunIds}`
      )
    )
  ) as SQL
}

/**
 * True for a real run the engine must leave where it stands: its flow is
 * paused, or it is on a sequence a paused flow started. Written against the
 * bare `automation_runs` table, so the engine's claim and its approval sweep
 * can both ask it inside their own statements.
 */
export const heldByPausedFlow = sql`(
  not automation_runs.test_run and exists (
    select 1 from automations paused_flow
    where paused_flow.paused_at is not null
      and (
        paused_flow.id = automation_runs.automation_id
        or (
          automation_runs.trigger_kind = ${sendSequenceNode.kind}
          and paused_flow.id = (
            select flow_run.automation_id from automation_runs flow_run
            where flow_run.id = split_part(automation_runs.trigger_key, ':', 2)
          )
        )
      )
  )
)`

/**
 * Asked before each step of a claimed run, so a Pause or a Stop that lands
 * while a pass is walking takes effect at the next step, not the next pass.
 * "stopped" is a sequence run whose flow run was ended after it started,
 * which happens when Stop lands while that flow run is inside its Send
 * sequence step.
 */
export async function pausedOrStopped(
  run: CustomShellAutomationRun,
  database: CustomShellDb
): Promise<"held" | "stopped" | null> {
  if (run.testRun) return null
  const [own] = await database
    .select({ pausedAt: customShellAutomations.pausedAt })
    .from(customShellAutomations)
    .where(eq(customShellAutomations.id, run.automationId))
    .limit(1)
  if (own?.pausedAt) return "held"
  if (run.triggerKind !== sendSequenceNode.kind || !run.triggerKey) return null

  const [flowRun] = await database
    .select({ status: startedBy.status, pausedAt: customShellAutomations.pausedAt })
    .from(startedBy)
    .innerJoin(customShellAutomations, eq(customShellAutomations.id, startedBy.automationId))
    .where(eq(startedBy.id, run.triggerKey.split(":")[1] ?? ""))
    .limit(1)
  if (!flowRun) return null
  if (flowRun.status === "canceled") return "stopped"
  return flowRun.pausedAt ? "held" : null
}

/** Holds everyone in a live flow where they stand. Pausing a paused flow changes nothing. */
export async function pauseAutomation(
  workspaceId: string,
  automationId: string,
  pausedBy: string,
  database: CustomShellDb = db
): Promise<CustomShellAutomation> {
  return database.transaction(async (tx) => {
    const flow = await lockedLiveFlow(workspaceId, automationId, tx)
    if (flow.pausedAt) return flow
    const timestamp = now()
    const [paused] = await tx
      .update(customShellAutomations)
      .set({ pausedAt: timestamp, pausedBy, stallAlertedAt: null, updatedAt: timestamp })
      .where(eq(customShellAutomations.id, flow.id))
      .returning()
    return paused!
  })
}

/**
 * Lets everyone held by Pause carry on. Two clocks restart from now rather
 * than from before the pause: a held run's wake-up, so nobody counts as an
 * hour late the moment the flow resumes, and an approval's deadline, which
 * moves on by as long as the pause lasted.
 */
export async function resumeAutomation(
  workspaceId: string,
  automationId: string,
  database: CustomShellDb = db
): Promise<CustomShellAutomation> {
  return database.transaction(async (tx) => {
    const flow = await lockedLiveFlow(workspaceId, automationId, tx)
    if (!flow.pausedAt) return flow
    const timestamp = now()
    const pausedFor = Math.max(0, timestamp.getTime() - flow.pausedAt.getTime())
    const ofFlow = runsOfFlow(flow.id)

    await tx
      .update(runs)
      .set({ wakeAt: timestamp, updatedAt: timestamp })
      .where(and(ofFlow, eq(runs.status, "active"), lt(runs.wakeAt, timestamp)))
    await tx
      .update(runs)
      .set({
        approvalDeadlineAt: sql`${runs.approvalDeadlineAt} + ${`${pausedFor} milliseconds`}::interval`,
        updatedAt: timestamp,
      })
      .where(and(ofFlow, eq(runs.status, "waiting_approval"), isNotNull(runs.approvalDeadlineAt)))

    const [resumed] = await tx
      .update(customShellAutomations)
      .set({ pausedAt: null, pausedBy: null, stallAlertedAt: null, updatedAt: timestamp })
      .where(eq(customShellAutomations.id, flow.id))
      .returning()
    return resumed!
  })
}

/**
 * Switches the flow off and ends every unfinished run of it and of the
 * sequences it started, in one transaction. Ending a run hands its claim back
 * too, so a run inside a step as Stop lands cannot write itself back to
 * active: the engine's every write is guarded by the claim.
 *
 * Each person ended is free to come in again from the top on the next Run:
 * their flow run gives up the trigger key that kept a start from making a
 * second run, and the once-per-person memory of the Segment and member starts
 * forgets them. Only them: whoever finished the flow and every email of its
 * sequences is still remembered.
 */
export async function stopAutomation(
  workspaceId: string,
  automationId: string,
  database: CustomShellDb = db
): Promise<CustomShellAutomation> {
  return database.transaction(async (tx) => {
    await lockedLiveFlow(workspaceId, automationId, tx)
    const off = await setAutomationEnabled(workspaceId, automationId, false, tx)
    const timestamp = now()
    const ended = {
      status: "canceled" as const,
      error: "Stopped by hand, with everyone else in the flow.",
      finishedAt: timestamp,
      claimToken: null,
      claimedAt: null,
      updatedAt: timestamp,
    }
    const unfinished = inArray(runs.status, ["active", "waiting_approval"])

    const onSequences = await tx
      .update(runs)
      .set(ended)
      .where(and(runsOfFlow(automationId), eq(runs.triggerKind, sendSequenceNode.kind), unfinished))
      .returning({ flowRunId: sql<string>`split_part(${runs.triggerKey}, ':', 2)` })
    const ownUnfinished = await tx
      .update(runs)
      .set({ ...ended, triggerKey: null })
      .where(and(eq(runs.automationId, automationId), eq(runs.testRun, false), unfinished))
      .returning({ contactId: runs.subjectContactId, userId: runs.subjectUserId })
    // Most people in a Segment, Drip, Send sequence flow are past the flow's
    // own steps: their flow run is finished and only their sequence run was
    // still going. They were taken out too, so their finished flow run gives
    // up its key as well. Whoever finished every email is not among them.
    const startedThem = [...new Set(onSequences.map((run) => run.flowRunId))]
    const mid = startedThem.length
      ? await tx
          .update(runs)
          .set({ triggerKey: null, updatedAt: timestamp })
          .where(and(eq(runs.automationId, automationId), inArray(runs.id, startedThem)))
          .returning({ contactId: runs.subjectContactId, userId: runs.subjectUserId })
      : []
    const own = [...ownUnfinished, ...mid]

    const contactIds = own.flatMap((run) => (run.contactId ? [run.contactId] : []))
    if (contactIds.length) {
      await tx
        .delete(customShellAutomationSegmentEnrollments)
        .where(
          and(
            eq(customShellAutomationSegmentEnrollments.automationId, automationId),
            inArray(customShellAutomationSegmentEnrollments.contactId, contactIds)
          )
        )
    }
    const userIds = own.flatMap((run) => (run.userId ? [run.userId] : []))
    if (userIds.length) {
      await tx
        .delete(customShellAutomationMemberEventEnrollments)
        .where(
          and(
            eq(customShellAutomationMemberEventEnrollments.automationId, automationId),
            inArray(customShellAutomationMemberEventEnrollments.userId, userIds)
          )
        )
    }
    return off
  })
}
