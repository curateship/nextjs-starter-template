import { and, eq, inArray, isNotNull, lte, sql } from "drizzle-orm"

import { automationCompiledConfigSchema } from "@/lib/automations/compile"
import { automationNodeName } from "@/lib/automations/node-registry"
import {
  automationEntryNodeId,
  automationNextNodeId,
  type AutomationApprovalDecision,
} from "@/lib/automations/run"
import { runBillingTriggerScans } from "@/server/automations/billing-triggers"
import { readAutomationsPaused } from "@/server/automations/pause"
import {
  automationExecutorFor,
  type AutomationExecutorResult,
} from "@/server/automations/executors"
import { db, type CustomShellDb } from "@/server/db"
import { inspectAutomation } from "@/server/automations/flows"
import { publishNotificationCreated } from "@/server/notifications/events"
import {
  customShellAutomationRuns,
  customShellAutomationRunSteps,
  customShellAutomations,
  customShellNotifications,
  type CustomShellAutomationRun,
} from "@/server/schema"
import { now, uuid } from "@/server/auth/security"

/**
 * The run engine: an in-process ticker that walks flows one step at a time.
 *
 * Every fifteen seconds it claims the runs that are due, walks each one as far
 * as it can, and hands the claim back. See `drizzle/0028` for why a run holds a
 * claim rather than a lock and why a run parked at an approval checkpoint costs
 * nothing at all.
 */

/** How many runs one pass takes on. */
const CLAIM_BATCH_SIZE = 20
/**
 * A claim older than this belonged to a process that died. Take it back.
 *
 * This is a bet that no single step takes longer than five minutes. Every write
 * here is guarded by the claim token, so a process that loses its claim mid-walk
 * stops rather than overwriting the new owner — but the step it was *already
 * inside* still finishes, and the new owner starts that same step again. Two
 * executions of one step is the failure this window trades against.
 *
 * The webhook executor is capped at ten seconds, safely inside this window.
 * Any future step allowed to run for minutes needs the claim extended while it
 * works (a heartbeat), not a bigger timeout here.
 */
const CLAIM_TIMEOUT_MINUTES = 5
/** A cap on one run's share of a pass, so a long flow cannot starve the rest. */
const NODE_BUDGET_PER_TICK = 25
const MAX_ATTEMPTS = 3
const RETRY_BACKOFF_MS = 30_000

/**
 * One pass: look for the moments that start a flow, claim the runs that are
 * due, walk each of them, then auto-reject any checkpoint whose deadline has
 * passed.
 */
export async function runAutomationTick(database: CustomShellDb = db) {
  // The kill switch, asked before anything is claimed. Nothing below runs while
  // it is on — not the walk, and not the deadline sweep, because auto-rejecting
  // a checkpoint nobody could answer during the pause would be the switch
  // throwing work away. See `server/automations/pause.ts` for the whole rule.
  if (await readAutomationsPaused(database)) {
    return { processed: 0, failed: 0, expired: 0, started: 0, paused: true }
  }

  // Before anything is claimed, so a run a trigger starts this instant is
  // walked in this same pass rather than sitting still for fifteen seconds.
  // Never throws — a scan that falls over must not stop the runs already going.
  const { started } = await runBillingTriggerScans(database)

  const claimToken = uuid()

  // The claim and the pick happen in one statement. SKIP LOCKED means a second
  // ticker running at the same moment steps over the rows this one is taking
  // instead of queueing behind them, so neither can claim the same run.
  const claimed = await database.execute(sql`
    UPDATE automation_runs
    SET claim_token = ${claimToken}, claimed_at = now(), updated_at = now()
    WHERE id IN (
      SELECT id FROM automation_runs
      WHERE status = 'active'
        AND wake_at <= now()
        AND (
          claimed_at IS NULL
          OR claimed_at < now() - interval '${sql.raw(String(CLAIM_TIMEOUT_MINUTES))} minutes'
        )
      ORDER BY wake_at ASC
      LIMIT ${CLAIM_BATCH_SIZE}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id
  `)

  const runIds = (claimed.rows as Array<{ id: string }>).map((row) => row.id)

  let processed = 0
  let failed = 0
  for (const runId of runIds) {
    try {
      await processRun(runId, claimToken, database)
      processed += 1
    } catch (error) {
      // One bad run must not take the rest of the batch with it. The run keeps
      // its claim and is picked up again once that claim goes stale.
      console.error(`Automation run ${runId} failed to process`, error)
      failed += 1
    }
  }

  const expired = await sweepExpiredApprovals(database)

  return { processed, failed, expired, started, paused: false }
}

/** Walks one claimed run as far as this pass allows. */
async function processRun(
  runId: string,
  claimToken: string,
  database: CustomShellDb
) {
  const [run] = await database
    .select()
    .from(customShellAutomationRuns)
    .where(
      and(
        eq(customShellAutomationRuns.id, runId),
        eq(customShellAutomationRuns.claimToken, claimToken)
      )
    )
    .limit(1)

  // Somebody else took it between the claim and the read.
  if (!run) return

  /**
   * Every exit from this function goes through here: it writes the run's new
   * state and hands the claim back in the same statement, still guarded by the
   * token, so a process that lost its claim mid-step cannot overwrite whoever
   * has it now.
   */
  const release = async (
    values: Partial<typeof customShellAutomationRuns.$inferInsert>
  ) => {
    await database
      .update(customShellAutomationRuns)
      .set({ ...values, claimToken: null, claimedAt: null, updatedAt: now() })
      .where(
        and(
          eq(customShellAutomationRuns.id, runId),
          eq(customShellAutomationRuns.claimToken, claimToken)
        )
      )
  }

  const parsed = automationCompiledConfigSchema.safeParse(run.configSnapshot)
  if (!parsed.success) {
    await release({
      status: "failed",
      error: "This run's saved copy of the flow could not be read.",
      finishedAt: now(),
    })
    return
  }
  const config = parsed.data

  let currentNodeId = run.currentNodeId
  let attempts = run.attempts

  for (let step = 0; step < NODE_BUDGET_PER_TICK; step += 1) {
    const node = config.nodes[currentNodeId]
    if (!node) {
      await release({
        status: "failed",
        error: "A step this run was about to take is no longer in the flow.",
        finishedAt: now(),
      })
      return
    }

    const executor = automationExecutorFor(node.kind)
    const startedAt = now()

    if (!executor) {
      const message = `"${nodeLabel(node.kind)}" steps cannot run yet in this app.`
      await recordStep(database, {
        runId,
        nodeId: currentNodeId,
        kind: node.kind,
        status: "failed",
        attempts: attempts + 1,
        summary: message,
        error: message,
        startedAt,
      })
      await release({ status: "failed", error: message, finishedAt: now() })
      return
    }

    let result: AutomationExecutorResult
    try {
      result = await executor({
        database,
        run,
        nodeId: currentNodeId,
        settings: node.settings,
        now,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      attempts += 1
      await recordStep(database, {
        runId,
        nodeId: currentNodeId,
        kind: node.kind,
        status: "failed",
        attempts,
        summary: `${nodeLabel(node.kind)} could not finish.`,
        error: message,
        startedAt,
      })
      if (attempts >= MAX_ATTEMPTS) {
        await release({
          status: "failed",
          attempts,
          error: message,
          finishedAt: now(),
        })
      } else {
        // Back off further with each try, so a service that is briefly down is
        // given longer to come back rather than being hammered three times in
        // ninety seconds.
        await release({
          status: "active",
          attempts,
          wakeAt: new Date(now().getTime() + RETRY_BACKOFF_MS * attempts),
        })
      }
      return
    }

    if (result.type === "park") {
      // No step row here on purpose. Nothing has happened yet — the run's own
      // approval columns are what describes a checkpoint while it waits, and
      // the step is written by whichever decision ends it.
      await parkForApproval({
        database,
        run,
        claimToken,
        nodeId: currentNodeId,
        result,
      })
      return
    }

    await recordStep(database, {
      runId,
      nodeId: currentNodeId,
      kind: node.kind,
      status: "completed",
      attempts: attempts + 1,
      summary: result.summary,
      startedAt,
    })

    const next =
      result.type === "complete"
        ? null
        : automationNextNodeId(config, currentNodeId)

    if (!next) {
      await release({ status: "completed", error: null, finishedAt: now() })
      return
    }

    currentNodeId = next
    attempts = 0
    // Written after every step so a crash resumes at the next step rather than
    // replaying the flow from the top — and guarded by the claim like every
    // other write here, not merely assumed to still hold it. A step that
    // outlasts the stale-claim window (five minutes) can be reclaimed by
    // another ticker mid-walk; without this condition that ticker's progress
    // would be overwritten from this loop's stale position and the run would be
    // walked twice, executing steps twice.
    const [stillOurs] = await database
      .update(customShellAutomationRuns)
      .set({ currentNodeId, attempts, updatedAt: now() })
      .where(
        and(
          eq(customShellAutomationRuns.id, runId),
          eq(customShellAutomationRuns.claimToken, claimToken)
        )
      )
      .returning({ id: customShellAutomationRuns.id })
    // The claim is gone, so this run belongs to somebody else now. Stop
    // touching it — including the release below, which is guarded too and
    // would do nothing anyway.
    if (!stillOurs) return

    // The kill switch again, between steps rather than only once a pass. A pass
    // can be inside a long flow for minutes, and the promise the switch makes is
    // that the step already running finishes and nothing after it starts — not
    // that everything already claimed runs to the end. The step just taken is
    // recorded and `currentNodeId` now points at the next one, so handing the
    // claim back here holds the run exactly where it stands.
    if (await readAutomationsPaused(database)) {
      await release({ status: "active", attempts, wakeAt: now() })
      return
    }
  }

  // Budget spent on one very long flow. Hand the claim back and finish it on
  // the next pass rather than holding the batch open.
  await release({ status: "active", attempts, wakeAt: now() })
}

/**
 * Parks the run at a checkpoint and asks its owner to decide.
 *
 * The claim goes back in the same write, which is what makes a parked run free:
 * `status = 'waiting_approval'` is not a status the claim query looks at, so a
 * run can sit here for days without occupying anything.
 */
async function parkForApproval({
  database,
  run,
  claimToken,
  nodeId,
  result,
}: {
  database: CustomShellDb
  run: CustomShellAutomationRun
  claimToken: string
  nodeId: string
  result: Extract<AutomationExecutorResult, { type: "park" }>
}) {
  const [parked] = await database
    .update(customShellAutomationRuns)
    .set({
      status: "waiting_approval",
      approvalNodeId: nodeId,
      approvalSummary: result.summary,
      approvalDeadlineAt: result.deadlineAt,
      // A second checkpoint later in the same flow starts from a clean slate,
      // or it would inherit the first one's answer.
      approvalDecision: null,
      approvalDecidedAt: null,
      approvalDecidedBy: null,
      claimToken: null,
      claimedAt: null,
      updatedAt: now(),
    })
    .where(
      and(
        eq(customShellAutomationRuns.id, run.id),
        eq(customShellAutomationRuns.claimToken, claimToken),
        eq(customShellAutomationRuns.status, "active")
      )
    )
    .returning({ id: customShellAutomationRuns.id })

  // Lost the claim, so this process is not the one that parked it and must not
  // send a second notice for it.
  if (!parked) return

  await notifyApproval(database, run.userId, run.id, "pending")
}

/**
 * The one way a run leaves `waiting_approval` — used by the Approve and Reject
 * buttons and by the deadline sweep alike.
 *
 * Returns false when the run had already moved on, which is what makes a second
 * click, a second tab, or two servers sweeping the same deadline harmless: the
 * first one through wins and the rest do nothing.
 */
export async function decideAutomationApproval({
  runId,
  decision,
  decidedByUserId,
  decidedByName,
  database = db,
}: {
  runId: string
  decision: AutomationApprovalDecision
  /** Null when the deadline decided it rather than a person. */
  decidedByUserId: string | null
  decidedByName: string | null
  database?: CustomShellDb
}): Promise<boolean> {
  const timestamp = now()
  const approved = decision === "approved"

  return database.transaction(async (tx) => {
    // Read and write inside one transaction: the run's move and the step that
    // records why must land together or not at all.
    const [waiting] = await tx
      .select()
      .from(customShellAutomationRuns)
      .where(
        and(
          eq(customShellAutomationRuns.id, runId),
          eq(customShellAutomationRuns.status, "waiting_approval")
        )
      )
      .limit(1)
    if (!waiting || !waiting.approvalNodeId) return false

    const config = automationCompiledConfigSchema.safeParse(
      waiting.configSnapshot
    )
    // Approving means "carry on", and with an unreadable snapshot there is no
    // way to know what carrying on would do. Say so rather than marking the run
    // complete, which would claim the rest of the flow ran when it never did.
    if (approved && !config.success) {
      await tx
        .update(customShellAutomationRuns)
        .set({
          status: "failed",
          error: "This run's saved copy of the flow could not be read.",
          finishedAt: timestamp,
          updatedAt: timestamp,
        })
        .where(eq(customShellAutomationRuns.id, runId))
      return false
    }
    const next = config.success
      ? automationNextNodeId(config.data, waiting.approvalNodeId)
      : null

    const decidedBy = decidedByName ?? "nobody"
    const summary = approved
      ? `Approved by ${decidedBy}. The flow carried on.`
      : decision === "timed_out"
        ? "Nobody answered before the deadline, so the run stopped here."
        : `Rejected by ${decidedBy}. Nothing after this step ran.`

    const [moved] = await tx
      .update(customShellAutomationRuns)
      .set({
        approvalDecision: decision,
        approvalDecidedAt: timestamp,
        approvalDecidedBy: decidedByUserId,
        updatedAt: timestamp,
        ...(approved
          ? {
              // Waiting for a person is not a failed attempt, so the resumed
              // leg gets its own full retry budget.
              attempts: 0,
              error: null,
              // Stepping past the checkpoint here is what stops the engine
              // walking back into it and parking the run a second time.
              ...(next
                ? { status: "active" as const, currentNodeId: next, wakeAt: timestamp }
                : { status: "completed" as const, finishedAt: timestamp }),
            }
          : { status: "rejected" as const, error: summary, finishedAt: timestamp }),
      })
      .where(
        and(
          eq(customShellAutomationRuns.id, runId),
          eq(customShellAutomationRuns.status, "waiting_approval")
        )
      )
      .returning({ id: customShellAutomationRuns.id })
    if (!moved) return false

    await tx.insert(customShellAutomationRunSteps).values({
      id: uuid(),
      runId,
      nodeId: waiting.approvalNodeId,
      kind: "waitForApproval",
      status: approved ? "completed" : "rejected",
      attempts: 1,
      summary,
      error: null,
      startedAt: waiting.updatedAt,
      finishedAt: timestamp,
    })

    return true
  })
}

/** Auto-rejects checkpoints nobody answered before their deadline. */
export async function sweepExpiredApprovals(database: CustomShellDb = db) {
  const expired = await database
    .select({
      id: customShellAutomationRuns.id,
      userId: customShellAutomationRuns.userId,
    })
    .from(customShellAutomationRuns)
    .where(
      and(
        eq(customShellAutomationRuns.status, "waiting_approval"),
        isNotNull(customShellAutomationRuns.approvalDeadlineAt),
        lte(customShellAutomationRuns.approvalDeadlineAt, now())
      )
    )

  let timedOut = 0
  for (const run of expired) {
    const decided = await decideAutomationApproval({
      runId: run.id,
      decision: "timed_out",
      decidedByUserId: null,
      decidedByName: null,
      database,
    }).catch((error) => {
      console.error(`Automation approval timeout failed for ${run.id}`, error)
      return false
    })

    // Only the process that actually moved the run says so, so two servers
    // sweeping the same deadline cannot send the notice twice.
    if (decided) {
      timedOut += 1
      await notifyApproval(database, run.userId, run.id, "timed_out")
    }
  }

  return timedOut
}

/**
 * Sets a flow going now.
 *
 * The run takes its own copy of the compiled flow, so editing the flow
 * afterwards changes nothing about a run already in flight.
 */
export async function startAutomationRun(
  workspaceId: string,
  userId: string,
  automationId: string,
  database: CustomShellDb = db
): Promise<CustomShellAutomationRun> {
  // Refused rather than held, and this is the one place the kill switch works
  // that way. Everything already going is kept and resumes; but somebody is
  // standing here having just pressed a button, and telling them "everything is
  // paused" beats saving a run they never see that fires the moment the switch
  // goes back off.
  if (await readAutomationsPaused(database)) {
    throw new Error("AUTOMATIONS_PAUSED")
  }

  const [automation] = await database
    .select()
    .from(customShellAutomations)
    .where(
      and(
        eq(customShellAutomations.id, automationId),
        eq(customShellAutomations.workspaceId, workspaceId)
      )
    )
    .limit(1)
  if (!automation) throw new Error("NOT_FOUND")

  const inspected = inspectAutomation(automation)
  if (!inspected.compiledConfig || inspected.errors.length > 0) {
    throw new Error("NOT_RUNNABLE")
  }

  const entryNodeId = automationEntryNodeId(inspected.compiledConfig)
  if (!entryNodeId) throw new Error("NO_SINGLE_START")

  const timestamp = now()
  const [run] = await database
    .insert(customShellAutomationRuns)
    .values({
      id: uuid(),
      automationId: automation.id,
      // Who pressed Run, for the record, and the flow's own site — not
      // whichever site they happen to be looking at. A run's audience is fixed
      // the moment it starts and cannot drift afterwards.
      userId,
      workspaceId: automation.workspaceId,
      status: "active",
      currentNodeId: entryNodeId,
      configSnapshot: inspected.compiledConfig,
      wakeAt: timestamp,
      attempts: 0,
      startedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning()
  if (!run) throw new Error("NOT_FOUND")

  return run
}

/**
 * The bell notice: this run is waiting on you, and later that nobody answered.
 *
 * Never fatal. The run's state is already committed by the time this runs, and
 * the runs page says the same thing without it — so a failure here is logged
 * and the caller carries on.
 */
/**
 * "This run is waiting on you." Sent to whoever wrote the flow — and to nobody
 * when they have since left, which is the one case where there is no answer.
 */
async function notifyApproval(
  database: CustomShellDb,
  userId: string | null,
  runId: string,
  state: "pending" | "timed_out"
) {
  // Nobody left to ask. The run still waits in the list where any admin on the
  // site can answer it; there is simply no tray to drop a notice into.
  if (!userId) return

  try {
    await database.insert(customShellNotifications).values({
      id: uuid(),
      recipientUserId: userId,
      // No actor: the app is asking, not a person.
      actorUserId: null,
      type: "automation_approval",
      automationRunId: runId,
      automationApprovalState: state,
      createdAt: now(),
    })
    // The case this whole feature exists for. The ticker is a background loop,
    // not a request, so nothing else would ever tell the browser — and "a run
    // is waiting for you before it emails real members" is exactly the notice
    // that must not sit unseen for a minute.
    await publishNotificationCreated(userId, database)
  } catch (error) {
    console.error(`Automation approval notice failed for ${runId}`, error)
  }
}

/** Deletes finished runs. A run still going or waiting is refused, not killed. */
export async function deleteAutomationRuns(
  workspaceId: string,
  runIds: string[],
  database: CustomShellDb = db
): Promise<{ deleted: string[]; kept: string[] }> {
  const deleted = await database
    .delete(customShellAutomationRuns)
    .where(
      and(
        eq(customShellAutomationRuns.workspaceId, workspaceId),
        inArray(customShellAutomationRuns.id, runIds),
        inArray(customShellAutomationRuns.status, [
          "completed",
          "failed",
          "rejected",
        ])
      )
    )
    .returning({ id: customShellAutomationRuns.id })

  const wentThrough = new Set(deleted.map((row) => row.id))
  return {
    deleted: [...wentThrough],
    kept: runIds.filter((id) => !wentThrough.has(id)),
  }
}

/** The step's name as the canvas writes it, for a run-history line. */
function nodeLabel(kind: string): string {
  return automationNodeName({ id: "", kind, x: 0, y: 0, settings: {} })
}

async function recordStep(
  database: CustomShellDb,
  step: {
    runId: string
    nodeId: string
    kind: string
    status: "completed" | "failed"
    attempts: number
    summary: string
    error?: string
    startedAt: Date
  }
) {
  await database.insert(customShellAutomationRunSteps).values({
    id: uuid(),
    runId: step.runId,
    nodeId: step.nodeId,
    kind: step.kind,
    status: step.status,
    attempts: step.attempts,
    summary: step.summary,
    error: step.error ?? null,
    startedAt: step.startedAt,
    finishedAt: now(),
  })
}
