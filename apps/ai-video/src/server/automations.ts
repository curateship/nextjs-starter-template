import { and, desc, eq, inArray, sql } from "drizzle-orm"

import { db } from "@/server/db"
import { requireAppOrigin } from "@/server/origin"
import {
  aiVideoAutomationRuns,
  aiVideoAutomationRunSteps,
  aiVideoAutomations,
  aiVideoCreators,
  type AiVideoAutomation,
  type AiVideoAutomationRun,
  type AiVideoAutomationRunStep,
} from "@/server/schema"
import { now, requireUser, uuid } from "@/server/security"
import {
  computeNextRunAt,
  enqueueAutomationRun,
} from "@/server/automation-engine"
import type { AutomationStepOutput } from "@/server/automation-nodes"
import { automationNodeKindName } from "@/lib/automations/node-registry"
import {
  automationGraphSchema,
  automationScheduleSummary,
  emptyAutomationGraph,
  validateAutomationGraph,
  type AutomationGraph,
  type AutomationValidationError,
} from "@/lib/automations/automation"

// CRUD + run endpoints for the automation canvas. Graph documents are stored
// verbatim; validation errors are returned alongside saves (drafts with
// issues may be saved, but can't run or schedule).

export type AutomationRunStatus =
  | "queued"
  | "running"
  | "completed"
  | "failed"
  | "canceled"

export type AutomationStepItem = {
  id: string
  node_id: string
  node_kind: string
  node_name: string
  status: "pending" | "running" | "completed" | "failed" | "skipped"
  attempts: number
  output: AutomationStepOutput | null
  error: string | null
  started_at: string | null
  finished_at: string | null
}

export type AutomationRunSummary = {
  id: string
  status: AutomationRunStatus
  trigger_type: "manual" | "schedule" | "creator_posted"
  error: string | null
  started_at: string | null
  finished_at: string | null
  created_at: string
}

export type AutomationRunDetail = {
  run: AutomationRunSummary
  steps: AutomationStepItem[]
}

export type AutomationListItem = {
  id: string
  name: string
  enabled: boolean
  schedule_summary: string
  node_count: number
  next_run_at: string | null
  updated_at: string
  last_run_status: AutomationRunStatus | null
  last_run_at: string | null
}

export type AutomationCreatorOption = {
  id: string
  label: string
  watch: boolean
}

export type AutomationDetail = {
  id: string
  name: string
  enabled: boolean
  graph: AutomationGraph
  next_run_at: string | null
  validation_errors: AutomationValidationError[]
}

export type AutomationEditorData = {
  automation: AutomationDetail
  creators: AutomationCreatorOption[]
  latest_run: AutomationRunDetail | null
}

const NAME_REQUIRED_ERROR = "Automation name is required."

function cleanName(name: string) {
  const trimmed = name.trim().slice(0, 120)
  if (!trimmed) throw new Error(NAME_REQUIRED_ERROR)
  return trimmed
}

function toIso(value: Date | null) {
  return value ? value.toISOString() : null
}

function parseStoredGraph(automation: AiVideoAutomation): AutomationGraph {
  const parsed = automationGraphSchema.safeParse(automation.graph)
  // Stored graphs are written through the same schema; a mismatch means a
  // failed migration or manual edit — fall back to empty rather than crash.
  return parsed.success
    ? (parsed.data as AutomationGraph)
    : emptyAutomationGraph()
}

function serializeAutomation(automation: AiVideoAutomation): AutomationDetail {
  const graph = parseStoredGraph(automation)
  return {
    id: automation.id,
    name: automation.name,
    enabled: automation.enabled,
    graph,
    next_run_at: toIso(automation.nextRunAt),
    validation_errors: validateAutomationGraph(graph),
  }
}

function serializeRun(run: AiVideoAutomationRun): AutomationRunSummary {
  return {
    id: run.id,
    status: run.status as AutomationRunStatus,
    trigger_type: run.triggerType as AutomationRunSummary["trigger_type"],
    error: run.error,
    started_at: toIso(run.startedAt),
    finished_at: toIso(run.finishedAt),
    created_at: run.createdAt.toISOString(),
  }
}

function serializeStep(step: AiVideoAutomationRunStep): AutomationStepItem {
  return {
    id: step.id,
    node_id: step.nodeId,
    node_kind: step.nodeKind,
    node_name: automationNodeKindName(step.nodeKind),
    status: step.status as AutomationStepItem["status"],
    attempts: step.attempts,
    output: (step.output as AutomationStepOutput | null) ?? null,
    error: step.error,
    started_at: toIso(step.startedAt),
    finished_at: toIso(step.finishedAt),
  }
}

async function getOwnedAutomation(userId: string, automationId: string) {
  const [row] = await db
    .select()
    .from(aiVideoAutomations)
    .where(
      and(
        eq(aiVideoAutomations.id, automationId),
        eq(aiVideoAutomations.userId, userId)
      )
    )
    .limit(1)
  if (!row) {
    throw new Error("Automation not found")
  }
  return row
}

export async function listAutomationsForCurrentUser(): Promise<{
  automations: AutomationListItem[]
}> {
  const user = await requireUser()
  const rows = await db
    .select()
    .from(aiVideoAutomations)
    .where(eq(aiVideoAutomations.userId, user.id))
    .orderBy(desc(aiVideoAutomations.updatedAt))

  // Latest run per automation; run history grows without bound, so let
  // Postgres pick one row per automation instead of scanning them all.
  const lastRuns = await db.execute(sql`
    select distinct on (automation_id) automation_id, status, created_at
    from automation_runs
    where user_id = ${user.id}
    order by automation_id, created_at desc
  `)
  const lastRunByAutomation = new Map(
    (
      lastRuns.rows as {
        automation_id: string
        status: AutomationRunStatus
        created_at: string
      }[]
    ).map((run) => [
      run.automation_id,
      { status: run.status, createdAt: new Date(run.created_at) },
    ])
  )

  return {
    automations: rows.map((row) => {
      const graph = parseStoredGraph(row)
      const lastRun = lastRunByAutomation.get(row.id) ?? null
      return {
        id: row.id,
        name: row.name,
        enabled: row.enabled,
        schedule_summary: automationScheduleSummary(graph),
        node_count: graph.nodes.length,
        next_run_at: toIso(row.nextRunAt),
        updated_at: row.updatedAt.toISOString(),
        last_run_status: lastRun?.status ?? null,
        last_run_at: lastRun ? lastRun.createdAt.toISOString() : null,
      }
    }),
  }
}

export async function createAutomationForCurrentUser(
  name: string
): Promise<{ automationId: string }> {
  requireAppOrigin()
  const user = await requireUser()
  const timestamp = now()

  // Seed a Manual trigger so the canvas opens with a runnable starting point.
  const graph: AutomationGraph = {
    nodes: [{ id: uuid(), kind: "manualTrigger", x: 80, y: 120 }],
    edges: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  }

  const [created] = await db
    .insert(aiVideoAutomations)
    .values({
      id: uuid(),
      userId: user.id,
      name: cleanName(name),
      graph,
      enabled: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning({ id: aiVideoAutomations.id })
  if (!created) {
    throw new Error("Automation was not created")
  }
  return { automationId: created.id }
}

export async function getAutomationEditorDataForCurrentUser(
  automationId: string
): Promise<AutomationEditorData> {
  const user = await requireUser()
  const automation = await getOwnedAutomation(user.id, automationId)

  const creators = await db
    .select({
      id: aiVideoCreators.id,
      username: aiVideoCreators.username,
      platform: aiVideoCreators.platform,
      watch: aiVideoCreators.watch,
    })
    .from(aiVideoCreators)
    .where(eq(aiVideoCreators.userId, user.id))
    .orderBy(aiVideoCreators.username)

  const [latestRun] = await db
    .select()
    .from(aiVideoAutomationRuns)
    .where(eq(aiVideoAutomationRuns.automationId, automationId))
    .orderBy(desc(aiVideoAutomationRuns.createdAt))
    .limit(1)

  return {
    automation: serializeAutomation(automation),
    creators: creators.map((creator) => ({
      id: creator.id,
      label: `@${creator.username} (${creator.platform})`,
      watch: creator.watch,
    })),
    latest_run: latestRun
      ? await getAutomationRunDetail(user.id, latestRun.id)
      : null,
  }
}

export async function saveAutomationForCurrentUser(data: {
  automationId: string
  name: string
  graph: AutomationGraph
  enabled: boolean
}): Promise<AutomationDetail> {
  requireAppOrigin()
  const user = await requireUser()
  await getOwnedAutomation(user.id, data.automationId)

  const parsed = automationGraphSchema.safeParse(data.graph)
  if (!parsed.success) {
    throw new Error("Automation graph is invalid.")
  }
  const graph = parsed.data as AutomationGraph

  const [saved] = await db
    .update(aiVideoAutomations)
    .set({
      name: cleanName(data.name),
      graph,
      enabled: data.enabled,
      // Editing reschedules from now: predictable, and an interval change
      // takes effect immediately instead of waiting out the old one.
      nextRunAt: computeNextRunAt(graph, data.enabled),
      updatedAt: now(),
    })
    .where(
      and(
        eq(aiVideoAutomations.id, data.automationId),
        eq(aiVideoAutomations.userId, user.id)
      )
    )
    .returning()
  if (!saved) {
    throw new Error("Automation not found")
  }
  return serializeAutomation(saved)
}

export async function setAutomationEnabledForCurrentUser(
  automationId: string,
  enabled: boolean
): Promise<AutomationDetail> {
  requireAppOrigin()
  const user = await requireUser()
  const automation = await getOwnedAutomation(user.id, automationId)
  const graph = parseStoredGraph(automation)

  const [saved] = await db
    .update(aiVideoAutomations)
    .set({
      enabled,
      nextRunAt: computeNextRunAt(graph, enabled),
      updatedAt: now(),
    })
    .where(eq(aiVideoAutomations.id, automation.id))
    .returning()
  if (!saved) {
    throw new Error("Automation not found")
  }
  return serializeAutomation(saved)
}

export async function deleteAutomationsForCurrentUser(
  automationIds: string[]
): Promise<{ deletedCount: number }> {
  requireAppOrigin()
  const user = await requireUser()
  const uniqueIds = Array.from(new Set(automationIds))
  const rows = await db
    .delete(aiVideoAutomations)
    .where(
      and(
        eq(aiVideoAutomations.userId, user.id),
        inArray(aiVideoAutomations.id, uniqueIds)
      )
    )
    .returning({ id: aiVideoAutomations.id })
  return { deletedCount: rows.length }
}

export async function runAutomationForCurrentUser(
  automationId: string
): Promise<AutomationRunDetail> {
  requireAppOrigin()
  const user = await requireUser()
  const automation = await getOwnedAutomation(user.id, automationId)

  const result = await enqueueAutomationRun(automation, "manual")
  if (result.outcome === "invalid") {
    throw new Error("Fix the automation's validation errors before running.")
  }
  return getAutomationRunDetail(user.id, result.runId)
}

export async function cancelAutomationRunForCurrentUser(
  runId: string
): Promise<AutomationRunDetail> {
  requireAppOrigin()
  const user = await requireUser()

  // The running worker notices the cancel between steps and stops; queued
  // runs are done right here. The lease is cleared too — a canceled run is
  // terminal, so nothing should look leased.
  await db
    .update(aiVideoAutomationRuns)
    .set({
      status: "canceled",
      leaseToken: null,
      leaseExpiresAt: null,
      finishedAt: now(),
      updatedAt: now(),
    })
    .where(
      and(
        eq(aiVideoAutomationRuns.id, runId),
        eq(aiVideoAutomationRuns.userId, user.id),
        inArray(aiVideoAutomationRuns.status, ["queued", "running"])
      )
    )
  // Queued runs have no worker to skip their steps.
  await db
    .update(aiVideoAutomationRunSteps)
    .set({ status: "skipped", finishedAt: now(), updatedAt: now() })
    .where(
      and(
        eq(aiVideoAutomationRunSteps.runId, runId),
        eq(aiVideoAutomationRunSteps.userId, user.id),
        eq(aiVideoAutomationRunSteps.status, "pending")
      )
    )
  return getAutomationRunDetail(user.id, runId)
}

export async function listAutomationRunsForCurrentUser(
  automationId: string,
  limit = 20
): Promise<{ runs: AutomationRunSummary[] }> {
  const user = await requireUser()
  await getOwnedAutomation(user.id, automationId)
  const rows = await db
    .select()
    .from(aiVideoAutomationRuns)
    .where(eq(aiVideoAutomationRuns.automationId, automationId))
    .orderBy(desc(aiVideoAutomationRuns.createdAt))
    .limit(Math.min(Math.max(limit, 1), 50))
  return { runs: rows.map(serializeRun) }
}

export async function getAutomationRunForCurrentUser(
  runId: string
): Promise<AutomationRunDetail> {
  const user = await requireUser()
  return getAutomationRunDetail(user.id, runId)
}

async function getAutomationRunDetail(
  userId: string,
  runId: string
): Promise<AutomationRunDetail> {
  const [run] = await db
    .select()
    .from(aiVideoAutomationRuns)
    .where(
      and(
        eq(aiVideoAutomationRuns.id, runId),
        eq(aiVideoAutomationRuns.userId, userId)
      )
    )
    .limit(1)
  if (!run) {
    throw new Error("Run not found")
  }
  const steps = await db
    .select()
    .from(aiVideoAutomationRunSteps)
    .where(eq(aiVideoAutomationRunSteps.runId, runId))
  // Present steps in the snapshot's node order (triggers first, then the
  // pipeline as laid out) — all steps share a created_at timestamp.
  const nodeOrder = new Map(
    (run.nodes as { id: string }[]).map((node, index) => [node.id, index])
  )
  steps.sort(
    (left, right) =>
      (nodeOrder.get(left.nodeId) ?? 0) - (nodeOrder.get(right.nodeId) ?? 0)
  )
  return { run: serializeRun(run), steps: steps.map(serializeStep) }
}
