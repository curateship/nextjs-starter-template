import { and, asc, eq, exists, isNull, lt, lte, or, sql } from "drizzle-orm"

import type { AutomationNode } from "@/lib/automations/graph"
import { flowFeeders } from "@/lib/video/flow/advance"
import { flowKindOf, flowNodeName, readFlowNodeSettings } from "@/lib/video/flow/node-kinds"
import type { FlowFeed } from "@/lib/video/flow/prompt"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { customShellAiUsageEvents } from "@/server/schema"
import {
  videoFlowRuns,
  videoFlowRunSteps,
  type VideoFlowRunRow,
  type VideoFlowRunStepRow,
} from "@/server/video/schema"

import { runFlowStep, type FlowStepContext } from "./executors"
import { settleFlowRun } from "./runs"

/**
 * The worker for Flow (`video-flow` in `src/app/server-options.ts`), every
 * 15 seconds with the rest. It takes up to three runs that have a step
 * queued, one worker each by lease, and makes their queued steps one after
 * the other. Closing the tab never stops a run; a worker stopped mid-step
 * leaves a lease that runs out, and the next pass makes that step again.
 */
const RUNS_PER_PASS = 3
/** Long enough for an AI video's writing-down of an hour's talk. */
const LEASE_MS = 20 * 60_000
/** The most steps one run makes in one pass, so one run never holds the worker for ever. */
const STEPS_PER_PASS = 10
/** How the reason a step failed is kept: whole sentences, at most this long. */
const ERROR_MAX = 600

export async function flowTick() {
  // A step left "working" by a worker that stopped goes back in the queue.
  await db
    .update(videoFlowRunSteps)
    .set({ status: "queued", updatedAt: now() })
    .where(
      and(
        eq(videoFlowRunSteps.status, "working"),
        exists(
          db
            .select({ id: videoFlowRuns.id })
            .from(videoFlowRuns)
            .where(
              and(
                eq(videoFlowRuns.id, videoFlowRunSteps.runId),
                or(isNull(videoFlowRuns.leaseToken), lt(videoFlowRuns.leaseExpiresAt, now()))
              )
            )
        )
      )
    )
  const claimed: (VideoFlowRunRow & { leaseToken: string })[] = []
  for (let count = 0; count < RUNS_PER_PASS; count += 1) {
    const run = await claimRun()
    if (!run) break
    claimed.push(run)
  }
  await Promise.all(
    claimed.map((run) =>
      makeRun(run).catch((error) => {
        console.error("A flow run's steps could not be made", error)
      })
    )
  )
}

function dueStep() {
  return and(
    eq(videoFlowRunSteps.runId, videoFlowRuns.id),
    eq(videoFlowRunSteps.status, "queued"),
    or(isNull(videoFlowRunSteps.wakeAt), lte(videoFlowRunSteps.wakeAt, now()))
  )
}

async function claimRun() {
  const timestamp = now()
  const available = or(isNull(videoFlowRuns.leaseToken), lt(videoFlowRuns.leaseExpiresAt, timestamp))
  const [candidate] = await db
    .select({ id: videoFlowRuns.id })
    .from(videoFlowRuns)
    .where(
      and(
        eq(videoFlowRuns.status, "running"),
        available,
        exists(db.select({ id: videoFlowRunSteps.id }).from(videoFlowRunSteps).where(dueStep()))
      )
    )
    .orderBy(asc(videoFlowRuns.updatedAt))
    .limit(1)
  if (!candidate) return null
  const leaseToken = uuid()
  const [run] = await db
    .update(videoFlowRuns)
    .set({ leaseToken, leaseExpiresAt: new Date(timestamp.getTime() + LEASE_MS) })
    .where(and(eq(videoFlowRuns.id, candidate.id), eq(videoFlowRuns.status, "running"), available))
    .returning()
  return run ? { ...run, leaseToken } : null
}

async function holdsLease(run: { id: string; leaseToken: string }) {
  const [row] = await db
    .update(videoFlowRuns)
    .set({ leaseExpiresAt: new Date(now().getTime() + LEASE_MS) })
    .where(and(eq(videoFlowRuns.id, run.id), eq(videoFlowRuns.leaseToken, run.leaseToken), eq(videoFlowRuns.status, "running")))
    .returning({ id: videoFlowRuns.id })
  return Boolean(row)
}

async function releaseRun(run: { id: string; leaseToken: string }) {
  await db
    .update(videoFlowRuns)
    .set({ leaseToken: null, leaseExpiresAt: null })
    .where(and(eq(videoFlowRuns.id, run.id), eq(videoFlowRuns.leaseToken, run.leaseToken)))
}

async function makeRun(run: VideoFlowRunRow & { leaseToken: string }) {
  try {
    for (let made = 0; made < STEPS_PER_PASS; made += 1) {
      if (!(await holdsLease(run))) return
      const [step] = await db
        .select()
        .from(videoFlowRunSteps)
        .where(
          and(
            eq(videoFlowRunSteps.runId, run.id),
            eq(videoFlowRunSteps.status, "queued"),
            or(isNull(videoFlowRunSteps.wakeAt), lte(videoFlowRunSteps.wakeAt, now()))
          )
        )
        .orderBy(asc(videoFlowRunSteps.position))
        .limit(1)
      if (!step) return
      await makeStep(run, step)
    }
  } finally {
    await releaseRun(run)
  }
}

async function contextFor(run: VideoFlowRunRow, step: VideoFlowRunStepRow, node: AutomationNode): Promise<FlowStepContext> {
  const steps = await db
    .select()
    .from(videoFlowRunSteps)
    .where(eq(videoFlowRunSteps.runId, run.id))
    .orderBy(asc(videoFlowRunSteps.position))
  const order = steps.map((one) => one.nodeId)
  const byNode = new Map(steps.map((one) => [one.nodeId, one]))
  const feeds: FlowContextFeed[] = flowFeeders(run.graph, node.id, order).flatMap((id) => {
    const from = run.graph.nodes.find((one) => one.id === id)
    const made = byNode.get(id)
    return from && made ? [{ title: flowNodeName(from), kind: flowKindOf(from.kind), output: made.output ?? {} }] : []
  })
  return {
    userId: run.userId,
    run,
    step,
    node,
    settings: readFlowNodeSettings(node.settings),
    feeds,
    spend: {
      ...(run.projectId ? { projectId: run.projectId } : {}),
      ...(run.videoId ? { videoId: run.videoId } : {}),
      flowRunId: run.id,
      flowStepId: step.id,
    },
  }
}

type FlowContextFeed = FlowFeed & { kind: ReturnType<typeof flowKindOf> }

/** What the reason a step failed says, cut at its last whole sentence. */
function failureText(error: unknown) {
  const message = error instanceof Error && error.message.trim() ? error.message.trim() : "The step couldn't be made this time."
  if (message.length <= ERROR_MAX) return message
  const cut = message.slice(0, ERROR_MAX)
  const end = cut.lastIndexOf(". ")
  return end > 40 ? cut.slice(0, end + 1) : `${cut.trimEnd()}…`
}

async function meteredCents(stepId: string) {
  const [row] = await db
    .select({ cents: sql<number>`coalesce(sum(${customShellAiUsageEvents.costCents}), 0)::int` })
    .from(customShellAiUsageEvents)
    .where(and(eq(customShellAiUsageEvents.status, "success"), sql`${customShellAiUsageEvents.metadata} ->> 'flowStepId' = ${stepId}`))
  return row?.cents ?? 0
}

async function makeStep(claimed: VideoFlowRunRow, step: VideoFlowRunStepRow) {
  // Read again before every step: AI video gives the run its video part-way
  // through, and the steps after it in the same pass need it.
  const [fresh] = await db.select().from(videoFlowRuns).where(eq(videoFlowRuns.id, claimed.id)).limit(1)
  const run = fresh ?? claimed
  const node = run.graph.nodes.find((one) => one.id === step.nodeId)
  const kind = flowKindOf(step.kind)
  const startedAt = now()
  const [claimedStep] = await db
    .update(videoFlowRunSteps)
    .set({ status: "working", attempts: sql`${videoFlowRunSteps.attempts} + 1`, startedAt, note: null, updatedAt: startedAt })
    .where(and(eq(videoFlowRunSteps.id, step.id), eq(videoFlowRunSteps.status, "queued")))
    .returning({ id: videoFlowRunSteps.id })
  // Changed since it was read, such as sent back by Make it again on a step before it.
  if (!claimedStep) return
  // Every write below is only for the step still being made: one sent back
  // meanwhile (Make it again on a step before it puts it back to waiting)
  // keeps its new state, and what was made from the old input is dropped.
  const stillMaking = and(eq(videoFlowRunSteps.id, step.id), eq(videoFlowRunSteps.status, "working"))
  try {
    if (!node || !kind) throw new Error("This node isn't one Flow knows any more.")
    const result = await runFlowStep(kind, await contextFor(run, step, node))
    const at = now()
    if ("wait" in result) {
      await db
        .update(videoFlowRunSteps)
        .set({ status: "queued", wakeAt: new Date(at.getTime() + result.wait.ms), note: result.wait.note, updatedAt: at })
        .where(stillMaking)
      return
    }
    const waitForOk = readFlowNodeSettings(node.settings).waitForOk
    await db
      .update(videoFlowRunSteps)
      .set({
        status: waitForOk ? "needs_ok" : "done",
        output: result.output,
        promptSent: result.promptSent ?? null,
        // Whole cents up, so a fraction of a cent still shows as a cost.
        estimateCents: result.estimateCents === undefined ? step.estimateCents : Math.ceil(result.estimateCents),
        costCents: await meteredCents(step.id),
        error: null,
        wakeAt: null,
        finishedAt: at,
        updatedAt: at,
      })
      .where(stillMaking)
  } catch (error) {
    const at = now()
    await db
      .update(videoFlowRunSteps)
      .set({ status: "failed", error: failureText(error), costCents: await meteredCents(step.id), finishedAt: at, updatedAt: at })
      .where(stillMaking)
  }
  await settleFlowRun(run.id)
}
