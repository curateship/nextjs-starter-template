import { and, eq, inArray, isNotNull, lte, sql } from "drizzle-orm"

import { db } from "@/server/db"
import { publishNotificationCreated } from "@/server/notification-events"
import { shouldDeliverNotification } from "@/server/notification-preferences"
import {
  aiVideoAutomationRuns,
  aiVideoAutomationRunSteps,
  aiVideoAutomations,
  aiVideoNotifications,
  type AiVideoAutomation,
  type AiVideoAutomationRunStep,
} from "@/server/schema"
import { now, uuid } from "@/server/security"
import {
  executeAutomationNode,
  type AutomationNodeContext,
  type AutomationStepOutput,
  type AutomationTriggerPayload,
} from "@/server/automation-nodes"
import {
  approvalDeadline,
  automationGraphSchema,
  automationScheduleTrigger,
  reachableNodeIds,
  scheduleIntervalMs,
  validateAutomationGraph,
  type AutomationEdge,
  type AutomationGraph,
  type AutomationNode,
} from "@/lib/automations/automation"

// Durable automation run engine over automation_runs/automation_run_steps,
// modeled on the render queue: runs are the queue unit, claimed FIFO with
// FOR UPDATE SKIP LOCKED under a concurrency cap; a claimed run holds a lease
// its heartbeat keeps extending, and expired leases are reclaimed on tick
// (requeue once, then terminal failure). Steps are re-derived from their
// stored statuses on every (re)claim, so a reclaimed run resumes after its
// completed steps instead of redoing them.

const AUTOMATION_CONCURRENCY = Math.max(
  1,
  Number.parseInt(process.env.AI_VIDEO_AUTOMATION_CONCURRENCY || "1", 10) || 1
)
// A run interrupted once (server restart mid-run) is retried; twice → failed.
const MAX_RUN_ATTEMPTS = 2
// A step that throws is retried once within the run, then marked failed.
const MAX_STEP_ATTEMPTS = 2
const LEASE_SECONDS = 60
const HEARTBEAT_MS = 20_000
const TICK_MS = 15_000
const SCHEDULER_TICK_MS = 60_000
// Safety cap on the step loop (retries included); real graphs are ≤100 nodes.
const MAX_RUN_ITERATIONS = 500

const INTERRUPTED_MESSAGE = "Run was interrupted"

// Statuses that make a run this automation's one active run. A run parked at
// an approval checkpoint counts: it holds no lease, but a second run must not
// start behind it. Matches ux_automation_runs_automation_active's predicate.
export const ACTIVE_RUN_STATUSES = [
  "queued",
  "running",
  "waiting_approval",
] as const

const REJECTED_MESSAGE = "Rejected at the approval checkpoint"
const TIMED_OUT_MESSAGE = "Approval timed out"

const DECISION_SUMMARIES = {
  approved: "You approved this run.",
  rejected: "You rejected this run.",
  timed_out: "Nobody approved in time, so the run was rejected.",
} as const

export type AutomationTriggerType = "manual" | "schedule" | "creator_posted"

type AutomationApprovalDecision = "approved" | "rejected" | "timed_out"

export type EnqueueResult =
  | { outcome: "queued"; runId: string }
  | { outcome: "already_active"; runId: string }
  | { outcome: "invalid"; reason: string }

function parseGraph(value: unknown): AutomationGraph | null {
  const parsed = automationGraphSchema.safeParse(value)
  return parsed.success ? (parsed.data as AutomationGraph) : null
}

function firedTriggerIds(
  graph: AutomationGraph,
  triggerType: AutomationTriggerType,
  payload: AutomationTriggerPayload | null
): string[] {
  return graph.nodes
    .filter((node) => {
      if (triggerType === "manual") {
        // Manual Run exercises the whole graph, whatever its triggers.
        return (
          node.kind === "manualTrigger" ||
          node.kind === "scheduleTrigger" ||
          node.kind === "creatorPostedTrigger"
        )
      }
      if (triggerType === "schedule") return node.kind === "scheduleTrigger"
      return (
        node.kind === "creatorPostedTrigger" &&
        (!node.creatorId || node.creatorId === payload?.creatorId)
      )
    })
    .map((node) => node.id)
}

// Inserts a run (graph snapshot) plus one pending step per node reachable
// from the fired trigger(s). The partial unique index keeps one active run
// per automation — a duplicate enqueue reads back the active run instead.
export async function enqueueAutomationRun(
  automation: AiVideoAutomation,
  triggerType: AutomationTriggerType,
  payload: AutomationTriggerPayload | null = null
): Promise<EnqueueResult> {
  const graph = parseGraph(automation.graph)
  if (!graph) {
    return { outcome: "invalid", reason: "Automation graph is invalid." }
  }
  const errors = validateAutomationGraph(graph)
  if (errors.length > 0) {
    return { outcome: "invalid", reason: errors[0].message }
  }
  const fired = firedTriggerIds(graph, triggerType, payload)
  if (fired.length === 0) {
    return {
      outcome: "invalid",
      reason: "No trigger in this automation matches this start.",
    }
  }
  const reachable = reachableNodeIds(graph, fired)
  const runNodes = graph.nodes.filter((node) => reachable.has(node.id))

  // Two passes cover the rare race where the active run finishes between our
  // insert conflict and the read-back; anything beyond that is a real error.
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const timestamp = now()
    const runId = uuid()
    const inserted = await db.transaction(async (tx) => {
      const [run] = await tx
        .insert(aiVideoAutomationRuns)
        .values({
          id: runId,
          userId: automation.userId,
          automationId: automation.id,
          status: "queued",
          triggerType,
          triggerPayload: payload,
          nodes: runNodes,
          edges: graph.edges,
          attempts: 0,
          createdAt: timestamp,
          updatedAt: timestamp,
        })
        .onConflictDoNothing({
          target: [aiVideoAutomationRuns.automationId],
          // Matches ux_automation_runs_automation_active's predicate.
          where: sql`status in ('queued', 'running', 'waiting_approval')`,
        })
        .returning({ id: aiVideoAutomationRuns.id })
      if (!run) return false

      await tx.insert(aiVideoAutomationRunSteps).values(
        runNodes.map((node) => ({
          id: uuid(),
          userId: automation.userId,
          runId,
          nodeId: node.id,
          nodeKind: node.kind,
          status: "pending",
          attempts: 0,
          createdAt: timestamp,
          updatedAt: timestamp,
        }))
      )
      return true
    })

    if (inserted) {
      kickAutomationWorker()
      return { outcome: "queued", runId }
    }

    const [active] = await db
      .select({ id: aiVideoAutomationRuns.id })
      .from(aiVideoAutomationRuns)
      .where(
        and(
          eq(aiVideoAutomationRuns.automationId, automation.id),
          inArray(aiVideoAutomationRuns.status, [...ACTIVE_RUN_STATUSES])
        )
      )
      .limit(1)
    if (active) return { outcome: "already_active", runId: active.id }
  }
  throw new Error("Automation run could not be queued")
}

// Fan-out hook the creator watcher calls after ingesting new videos: start
// every enabled automation of this user with a matching Creator Posts trigger.
export async function enqueueCreatorPostedRuns(
  userId: string,
  creatorId: string,
  videoIds: string[]
) {
  if (videoIds.length === 0) return
  const automations = await db
    .select()
    .from(aiVideoAutomations)
    .where(
      and(
        eq(aiVideoAutomations.userId, userId),
        eq(aiVideoAutomations.enabled, true)
      )
    )

  for (const automation of automations) {
    const graph = parseGraph(automation.graph)
    const matches = graph?.nodes.some(
      (node) =>
        node.kind === "creatorPostedTrigger" &&
        (!node.creatorId || node.creatorId === creatorId)
    )
    if (!matches) continue
    await enqueueAutomationRun(automation, "creator_posted", {
      creatorId,
      videoIds,
    }).catch((error) =>
      console.error("Creator-posted automation enqueue failed", error)
    )
  }
}

// ---------------------------------------------------------------------------
// Worker

// Worker state lives on globalThis so dev HMR module reloads can't double-run
// runs or leak extra tickers (same pattern as the render queue).
const WORKER_STATE_KEY = "__aiVideoAutomationWorkerState"

type WorkerState = { registered: boolean; active: number }

function workerState(): WorkerState {
  const globals = globalThis as Record<string, unknown>
  if (!globals[WORKER_STATE_KEY]) {
    globals[WORKER_STATE_KEY] = {
      registered: false,
      active: 0,
    } satisfies WorkerState
  }
  return globals[WORKER_STATE_KEY] as WorkerState
}

// Always-on like the render worker: runs only exist when a user or an enabled
// trigger created them. The interval is the safety net — enqueue kicks the
// pump directly.
export function registerAutomationWorker() {
  const state = workerState()
  if (state.registered) return
  state.registered = true
  setInterval(() => {
    void tick()
  }, TICK_MS).unref()
  // Boot pass: reclaim runs orphaned by the previous process, then pump.
  void tick()
}

function kickAutomationWorker() {
  void pumpAutomationQueue().catch((error) => {
    console.error("Automation queue pump failed", error)
  })
}

async function tick() {
  await reclaimStaleRuns().catch((error) => {
    console.error("Automation run reclaim failed", error)
  })
  // The approval timeout sweep lives on the always-on worker tick, not the
  // opt-in scheduler: a checkpoint that never auto-rejects would strand the
  // automation, and manual runs work without the scheduler being enabled.
  await sweepExpiredApprovals().catch((error) => {
    console.error("Automation approval sweep failed", error)
  })
  await pumpAutomationQueue().catch((error) => {
    console.error("Automation queue pump failed", error)
  })
}

type ClaimedRun = {
  id: string
  user_id: string
  automation_id: string
  trigger_payload: AutomationTriggerPayload | null
  nodes: AutomationNode[]
  edges: AutomationEdge[]
  lease_token: string
}

async function pumpAutomationQueue() {
  const state = workerState()
  while (state.active < AUTOMATION_CONCURRENCY) {
    const run = await claimNextRun()
    if (!run) return
    state.active += 1
    void executeRun(run)
      .catch((error) => {
        console.error("Automation run crashed", run.id, error)
      })
      .finally(() => {
        state.active -= 1
        void pumpAutomationQueue().catch(() => undefined)
      })
  }
}

// Atomic FIFO claim — correct even with multiple server instances sharing the
// database (SKIP LOCKED keeps concurrent claimers off the same row).
async function claimNextRun(): Promise<ClaimedRun | null> {
  const result = await db.execute(sql`
    update automation_runs set
      status = 'running',
      attempts = attempts + 1,
      lease_token = ${uuid()},
      lease_expires_at = now() + make_interval(secs => ${LEASE_SECONDS}),
      started_at = coalesce(started_at, now()),
      updated_at = now()
    where id = (
      select id from automation_runs
      where status = 'queued'
      order by created_at, id
      limit 1
      for update skip locked
    )
    returning id, user_id, automation_id, trigger_payload, nodes, edges, lease_token
  `)
  return (result.rows[0] as ClaimedRun | undefined) ?? null
}

const TERMINAL_STEP_STATUSES = new Set(["completed", "failed", "skipped"])

function mergeStepOutputs(
  outputs: AutomationStepOutput[]
): AutomationStepOutput {
  const merged: AutomationStepOutput = { summary: "" }
  const concat = (key: "videoUrls" | "videoIds" | "templateIds" | "projectIds") => {
    const values = outputs.flatMap((output) => output[key] ?? [])
    if (values.length > 0) merged[key] = Array.from(new Set(values))
  }
  concat("videoUrls")
  concat("videoIds")
  concat("templateIds")
  concat("projectIds")
  return merged
}

async function loadRunSteps(runId: string) {
  return db
    .select()
    .from(aiVideoAutomationRunSteps)
    .where(eq(aiVideoAutomationRunSteps.runId, runId))
}

async function runWasCanceled(runId: string) {
  const [row] = await db
    .select({ status: aiVideoAutomationRuns.status })
    .from(aiVideoAutomationRuns)
    .where(eq(aiVideoAutomationRuns.id, runId))
    .limit(1)
  return row?.status === "canceled"
}

// Executes a claimed run's steps in dependency order until every step is
// terminal. Steps run one at a time; completed steps from a previous attempt
// are kept, so a reclaimed run resumes where the crashed process stopped.
async function executeRun(run: ClaimedRun) {
  // Keep the lease alive while node executors run; the token guard means a
  // lease we somehow lost (run reclaimed elsewhere) is never resurrected.
  const heartbeat = setInterval(() => {
    void db
      .execute(
        sql`
          update automation_runs set
            lease_expires_at = now() + make_interval(secs => ${LEASE_SECONDS}),
            updated_at = now()
          where id = ${run.id}
            and lease_token = ${run.lease_token}
            and status = 'running'
        `
      )
      .catch((error) => {
        console.error("Automation run heartbeat failed", run.id, error)
      })
  }, HEARTBEAT_MS)
  heartbeat.unref()

  try {
    const nodeById = new Map(run.nodes.map((node) => [node.id, node]))

    // Steps stuck 'running' belong to a crashed previous attempt; retry them.
    await db
      .update(aiVideoAutomationRunSteps)
      .set({ status: "pending", updatedAt: now() })
      .where(
        and(
          eq(aiVideoAutomationRunSteps.runId, run.id),
          eq(aiVideoAutomationRunSteps.status, "running")
        )
      )

    for (let iteration = 0; iteration < MAX_RUN_ITERATIONS; iteration += 1) {
      if (await runWasCanceled(run.id)) {
        await skipPendingSteps(run.id)
        return
      }

      const steps = await loadRunSteps(run.id)
      const stepByNode = new Map(steps.map((step) => [step.nodeId, step]))
      const actionable = findActionableStep(run.edges, steps, stepByNode)
      if (!actionable) break

      if (actionable.action === "skip") {
        await db
          .update(aiVideoAutomationRunSteps)
          .set({ status: "skipped", finishedAt: now(), updatedAt: now() })
          .where(eq(aiVideoAutomationRunSteps.id, actionable.step.id))
        continue
      }

      const node = nodeById.get(actionable.step.nodeId)
      if (!node) {
        await db
          .update(aiVideoAutomationRunSteps)
          .set({
            status: "failed",
            error: "Node missing from the run snapshot",
            finishedAt: now(),
            updatedAt: now(),
          })
          .where(eq(aiVideoAutomationRunSteps.id, actionable.step.id))
        continue
      }

      // A checkpoint parks the run instead of executing: the lease is handed
      // back so a run can wait for days without occupying a worker slot, and
      // approve/reject requeues it to resume after the completed steps.
      if (node.kind === "waitForApproval") {
        await parkRunForApproval(run, node, actionable.step, actionable.inputs)
        return
      }

      await executeStep(run, node, actionable.step, actionable.inputs)
    }

    await finishRun(run)
  } finally {
    clearInterval(heartbeat)
  }
}

type ActionableStep =
  | { action: "execute"; step: AiVideoAutomationRunStep; inputs: AutomationStepOutput }
  | { action: "skip"; step: AiVideoAutomationRunStep }

// A pending step is ready when every upstream step (edges whose source has a
// step in this run) is terminal: all completed → execute with their merged
// outputs; any failed/skipped → skip (the failure cascades downstream).
function findActionableStep(
  edges: AutomationEdge[],
  steps: AiVideoAutomationRunStep[],
  stepByNode: Map<string, AiVideoAutomationRunStep>
): ActionableStep | null {
  for (const step of steps) {
    if (step.status !== "pending") continue
    const sources = edges
      .filter((edge) => edge.to === step.nodeId && stepByNode.has(edge.from))
      .map((edge) => stepByNode.get(edge.from) as AiVideoAutomationRunStep)
    if (sources.some((source) => !TERMINAL_STEP_STATUSES.has(source.status))) {
      continue
    }
    if (
      sources.some(
        (source) => source.status === "failed" || source.status === "skipped"
      )
    ) {
      return { action: "skip", step }
    }
    return {
      action: "execute",
      step,
      inputs: mergeStepOutputs(
        sources.map((source) => (source.output ?? {}) as AutomationStepOutput)
      ),
    }
  }
  return null
}

async function executeStep(
  run: ClaimedRun,
  node: AutomationNode,
  step: AiVideoAutomationRunStep,
  inputs: AutomationStepOutput
) {
  // Conditional pending→running claim: the atomic transition is the
  // re-entrancy guard if two processes ever hold the same run.
  const [claimed] = await db
    .update(aiVideoAutomationRunSteps)
    .set({
      status: "running",
      attempts: step.attempts + 1,
      startedAt: step.startedAt ?? now(),
      updatedAt: now(),
    })
    .where(
      and(
        eq(aiVideoAutomationRunSteps.id, step.id),
        eq(aiVideoAutomationRunSteps.status, "pending")
      )
    )
    .returning()
  if (!claimed) return

  const context: AutomationNodeContext = {
    userId: run.user_id,
    triggerPayload: run.trigger_payload,
    inputs,
  }

  try {
    const output = await executeAutomationNode(context, node)
    await db
      .update(aiVideoAutomationRunSteps)
      .set({
        status: "completed",
        output,
        error: null,
        finishedAt: now(),
        updatedAt: now(),
      })
      .where(eq(aiVideoAutomationRunSteps.id, claimed.id))
  } catch (error) {
    const message =
      error instanceof Error && error.message
        ? error.message.slice(0, 500)
        : "Step failed"
    const retry = claimed.attempts < MAX_STEP_ATTEMPTS
    await db
      .update(aiVideoAutomationRunSteps)
      .set({
        status: retry ? "pending" : "failed",
        error: message,
        finishedAt: retry ? null : now(),
        updatedAt: now(),
      })
      .where(eq(aiVideoAutomationRunSteps.id, claimed.id))
  }
}

// ---------------------------------------------------------------------------
// Approval checkpoints

// A checkpoint is a pass-through: downstream steps must still see the upstream
// videos/templates, so the parked step's output carries the inputs forward.
function approvalStepOutput(
  inputs: AutomationStepOutput,
  timeoutDays: number
): AutomationStepOutput {
  return {
    ...inputs,
    summary: `Waiting for your approval. Auto-rejects after ${timeoutDays} ${timeoutDays === 1 ? "day" : "days"}.`,
  }
}

// Hands the lease back and parks the run at this step. The run row moves first
// and is guarded by the lease token, so a run reclaimed elsewhere can't be
// parked by this (zombie) process.
async function parkRunForApproval(
  run: ClaimedRun,
  node: Extract<AutomationNode, { kind: "waitForApproval" }>,
  step: AiVideoAutomationRunStep,
  inputs: AutomationStepOutput
) {
  const timestamp = now()
  const parked = await db.transaction(async (tx) => {
    const [updatedRun] = await tx
      .update(aiVideoAutomationRuns)
      .set({
        status: "waiting_approval",
        leaseToken: null,
        leaseExpiresAt: null,
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(aiVideoAutomationRuns.id, run.id),
          eq(aiVideoAutomationRuns.leaseToken, run.lease_token),
          eq(aiVideoAutomationRuns.status, "running")
        )
      )
      .returning({ id: aiVideoAutomationRuns.id })
    if (!updatedRun) return false

    const [parkedStep] = await tx
      .update(aiVideoAutomationRunSteps)
      .set({
        status: "waiting_approval",
        attempts: step.attempts + 1,
        output: approvalStepOutput(inputs, node.timeoutDays),
        error: null,
        approvalDeadlineAt: approvalDeadline(node, timestamp),
        approvalDecision: null,
        approvalDecidedAt: null,
        startedAt: step.startedAt ?? timestamp,
        updatedAt: timestamp,
      })
      .where(
        and(
          eq(aiVideoAutomationRunSteps.id, step.id),
          eq(aiVideoAutomationRunSteps.status, "pending")
        )
      )
      .returning({ id: aiVideoAutomationRunSteps.id })
    // A parked run with no waiting step would be unreachable: no approval card,
    // no deadline to sweep, only Cancel left. Throw so the transaction rolls
    // back and the run stays claimed for the lease to reclaim and retry.
    if (!parkedStep) {
      throw new Error(`Approval step ${step.id} was not pending`)
    }
    return true
  })

  if (parked) {
    await notifyApproval(run.user_id, run.id, "pending")
  }
}

// Bell notice for "decide on this run" and for the auto-reject that fires when
// nobody did. Never fatal: the run state is already committed, and the runs
// panel shows the same thing without it.
async function notifyApproval(
  userId: string,
  runId: string,
  state: "pending" | "timed_out"
) {
  try {
    if (
      !(await shouldDeliverNotification({
        recipientUserId: userId,
        type: "automation_approval",
      }))
    ) {
      return
    }
    await db.insert(aiVideoNotifications).values({
      id: uuid(),
      recipientUserId: userId,
      actorUserId: userId,
      type: "automation_approval",
      automationRunId: runId,
      automationApprovalState: state,
      createdAt: now(),
    })
    await publishNotificationCreated(userId)
  } catch (error) {
    console.error("Automation approval notification failed", runId, error)
  }
}

// The one place a parked run leaves 'waiting_approval', shared by the approve
// and reject endpoints and by the timeout sweep. Pass `userId` to require
// ownership (API callers); the sweep passes null. Returns false when the run
// already moved on, which makes a concurrent second caller a no-op.
export async function decideAutomationApproval({
  runId,
  userId,
  decision,
}: {
  runId: string
  userId: string | null
  decision: AutomationApprovalDecision
}): Promise<boolean> {
  const timestamp = now()
  const approved = decision === "approved"
  const error =
    decision === "timed_out"
      ? TIMED_OUT_MESSAGE
      : approved
        ? null
        : REJECTED_MESSAGE

  const runConditions = [
    eq(aiVideoAutomationRuns.id, runId),
    eq(aiVideoAutomationRuns.status, "waiting_approval"),
  ]
  if (userId) {
    runConditions.push(eq(aiVideoAutomationRuns.userId, userId))
  }

  const decided = await db.transaction(async (tx) => {
    // Read before writing: a decision must move the run and its checkpoint
    // together or not at all, and bailing after the run update would commit
    // half of it.
    const [waiting] = await tx
      .select()
      .from(aiVideoAutomationRunSteps)
      .where(
        and(
          eq(aiVideoAutomationRunSteps.runId, runId),
          eq(aiVideoAutomationRunSteps.status, "waiting_approval")
        )
      )
      .limit(1)
    if (!waiting) return false

    const [updatedRun] = await tx
      .update(aiVideoAutomationRuns)
      .set(
        approved
          ? {
              status: "queued",
              // The wait is not an interrupted attempt; the resumed leg starts
              // its own attempt budget so a later crash still gets its retry.
              attempts: 0,
              error: null,
              leaseToken: null,
              leaseExpiresAt: null,
              updatedAt: timestamp,
            }
          : {
              status: "failed",
              error,
              leaseToken: null,
              leaseExpiresAt: null,
              finishedAt: timestamp,
              updatedAt: timestamp,
            }
      )
      .where(and(...runConditions))
      .returning({ id: aiVideoAutomationRuns.id })
    if (!updatedRun) return false

    // Keep the pass-through payload: downstream steps read it on resume, and
    // the panel keeps showing what the decision was about either way.
    const output = (waiting.output ?? {}) as AutomationStepOutput
    await tx
      .update(aiVideoAutomationRunSteps)
      .set({
        status: approved ? "completed" : "failed",
        output: { ...output, summary: DECISION_SUMMARIES[decision] },
        error,
        approvalDecision: decision,
        approvalDecidedAt: timestamp,
        finishedAt: timestamp,
        updatedAt: timestamp,
      })
      .where(eq(aiVideoAutomationRunSteps.id, waiting.id))

    if (!approved) {
      // Nothing downstream ever runs, so close those steps here — a failed run
      // has no worker to cascade the skip for it.
      await tx
        .update(aiVideoAutomationRunSteps)
        .set({ status: "skipped", finishedAt: timestamp, updatedAt: timestamp })
        .where(
          and(
            eq(aiVideoAutomationRunSteps.runId, runId),
            inArray(aiVideoAutomationRunSteps.status, ["pending", "running"])
          )
        )
    }
    return true
  })

  if (!decided) return false
  if (approved) kickAutomationWorker()
  return true
}

// Auto-rejects checkpoints nobody answered before their deadline.
async function sweepExpiredApprovals() {
  const expired = await db
    .select({
      runId: aiVideoAutomationRunSteps.runId,
      userId: aiVideoAutomationRunSteps.userId,
    })
    .from(aiVideoAutomationRunSteps)
    // Joining the run keeps the query to rows a decision can actually move; a
    // step left waiting under a run that already finished would otherwise be
    // re-picked every tick forever and silently do nothing.
    .innerJoin(
      aiVideoAutomationRuns,
      eq(aiVideoAutomationRuns.id, aiVideoAutomationRunSteps.runId)
    )
    .where(
      and(
        eq(aiVideoAutomationRunSteps.status, "waiting_approval"),
        eq(aiVideoAutomationRuns.status, "waiting_approval"),
        isNotNull(aiVideoAutomationRunSteps.approvalDeadlineAt),
        lte(aiVideoAutomationRunSteps.approvalDeadlineAt, now())
      )
    )

  for (const step of expired) {
    const decided = await decideAutomationApproval({
      runId: step.runId,
      userId: null,
      decision: "timed_out",
    }).catch((error) => {
      console.error("Automation approval timeout failed", step.runId, error)
      return false
    })
    // Only the process that actually moved the run notifies, so two instances
    // sweeping the same deadline can't double-send.
    if (decided) await notifyApproval(step.userId, step.runId, "timed_out")
  }
}

async function skipPendingSteps(runId: string) {
  await db
    .update(aiVideoAutomationRunSteps)
    .set({ status: "skipped", finishedAt: now(), updatedAt: now() })
    .where(
      and(
        eq(aiVideoAutomationRunSteps.runId, runId),
        inArray(aiVideoAutomationRunSteps.status, ["pending", "running"])
      )
    )
}

// Terminal run update, guarded by the lease token so a reclaimed run's zombie
// process can't overwrite the retry's state.
async function finishRun(run: ClaimedRun) {
  const steps = await loadRunSteps(run.id)
  const failed = steps.find((step) => step.status === "failed")
  // Non-terminal steps here mean the iteration cap tripped — a bug or a
  // pathological graph; surface it instead of reporting a clean completion.
  const stuck = steps.find((step) => !TERMINAL_STEP_STATUSES.has(step.status))
  await db
    .update(aiVideoAutomationRuns)
    .set({
      status: failed || stuck ? "failed" : "completed",
      error: failed
        ? failed.error
        : stuck
          ? "Run stopped before every step finished"
          : null,
      leaseToken: null,
      leaseExpiresAt: null,
      finishedAt: now(),
      updatedAt: now(),
    })
    .where(
      and(
        eq(aiVideoAutomationRuns.id, run.id),
        eq(aiVideoAutomationRuns.leaseToken, run.lease_token),
        eq(aiVideoAutomationRuns.status, "running")
      )
    )
}

// Requeues running runs whose lease expired (crashed or wedged process); a
// run interrupted MAX_RUN_ATTEMPTS times becomes a terminal failure.
async function reclaimStaleRuns() {
  await db.execute(sql`
    update automation_runs set
      status = case when attempts < ${MAX_RUN_ATTEMPTS} then 'queued' else 'failed' end,
      error = case when attempts < ${MAX_RUN_ATTEMPTS} then error else ${INTERRUPTED_MESSAGE} end,
      lease_token = null,
      lease_expires_at = null,
      finished_at = case when attempts < ${MAX_RUN_ATTEMPTS} then null else now() end,
      updated_at = now()
    where status = 'running' and lease_expires_at < now()
  `)
  // Terminally failed reclaims leave their unfinished steps behind; close them.
  await db.execute(sql`
    update automation_run_steps set
      status = 'skipped',
      finished_at = now(),
      updated_at = now()
    where status in ('pending', 'running')
      and run_id in (select id from automation_runs where status = 'failed' and error = ${INTERRUPTED_MESSAGE})
  `)
}

// ---------------------------------------------------------------------------
// Scheduler

export function computeNextRunAt(
  graph: AutomationGraph,
  enabled: boolean
): Date | null {
  if (!enabled) return null
  if (validateAutomationGraph(graph).length > 0) return null
  const schedule = automationScheduleTrigger(graph)
  if (!schedule) return null
  return new Date(Date.now() + scheduleIntervalMs(schedule))
}

// In-process scheduler, opt-in via AI_VIDEO_AUTOMATIONS_ENABLED=1 so local
// dev doesn't scrape/analyze on a timer (manual Run always works). The
// globalThis flag survives dev-server module reloads.
const SCHEDULER_FLAG = "__aiVideoAutomationScheduler"

export function registerAutomationScheduler() {
  if (process.env.AI_VIDEO_AUTOMATIONS_ENABLED !== "1") return
  const globals = globalThis as Record<string, unknown>
  if (globals[SCHEDULER_FLAG]) return
  globals[SCHEDULER_FLAG] = true

  // unref: the timer must never keep the process alive on shutdown.
  setInterval(() => {
    runDueAutomations().catch((error) =>
      console.error("Automation scheduler tick failed", error)
    )
  }, SCHEDULER_TICK_MS).unref()
}

// Enqueue every enabled automation whose next_run_at elapsed, then advance
// next_run_at whatever the enqueue outcome — a still-active previous run must
// not make the scheduler retry-spin every tick.
export async function runDueAutomations() {
  const due = await db
    .select()
    .from(aiVideoAutomations)
    .where(
      and(
        eq(aiVideoAutomations.enabled, true),
        lte(aiVideoAutomations.nextRunAt, now())
      )
    )

  for (const automation of due) {
    const result = await enqueueAutomationRun(automation, "schedule").catch(
      (error) => {
        console.error("Scheduled automation enqueue failed", automation.id, error)
        return null
      }
    )
    if (result?.outcome === "invalid") {
      console.error(
        "Scheduled automation is invalid",
        automation.id,
        result.reason
      )
    }
    const graph = parseGraph(automation.graph)
    // enabled = true guard: if the user disabled the automation while this
    // tick ran, their cleared next_run_at must win over our advance.
    await db
      .update(aiVideoAutomations)
      .set({
        nextRunAt: graph ? computeNextRunAt(graph, true) : null,
        updatedAt: now(),
      })
      .where(
        and(
          eq(aiVideoAutomations.id, automation.id),
          eq(aiVideoAutomations.enabled, true)
        )
      )
  }
}
