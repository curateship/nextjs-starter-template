import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  decideAutomationApproval,
  deleteAutomationRuns,
  runAutomationTick,
  startAutomationRun,
} from "@/server/automation-engine"
import {
  getAutomationRun as readAutomationRun,
  listRunsAwaitingApproval as readRunsAwaitingApproval,
  listRunsForAutomation as readRunsForAutomation,
  type AutomationRunRow,
} from "@/server/automation-runs"
import { adminGet, adminPost } from "@/server/guards"

import type {
  AutomationApprovalDecision,
  AutomationRunStatus,
  AutomationRunStepStatus,
} from "@/lib/automations/run"
import { createErrorMessage } from "./error-message"

export type AutomationRunItem = {
  id: string
  automation_id: string
  automation_name: string
  status: AutomationRunStatus
  /** Which of the three ways an approval ended, once one has. */
  approval_decision: AutomationApprovalDecision | null
  approval_deadline_at: string | null
  step_count: number
  started_at: string
  finished_at: string | null
}

export type AutomationRunStepItem = {
  id: string
  node_id: string
  step_name: string
  status: AutomationRunStepStatus
  summary: string
  error: string | null
  started_at: string
  finished_at: string
}

export type AutomationRunDetailItem = AutomationRunItem & {
  /** What the reviewer is told happens on approve. Null outside a checkpoint. */
  approval_summary: string | null
  approval_decided_at: string | null
  approval_decided_by_name: string | null
  error: string | null
  steps: AutomationRunStepItem[]
}

/** What the editor's bottom panel opens with: both tabs, in one round trip. */
export type AutomationRunsPanelData = {
  runs: AutomationRunItem[]
  total: number
  waiting: AutomationRunItem[]
  waiting_total: number
}

const automationIdSchema = z.object({
  automationId: z.string().min(1).max(36),
})
const runIdSchema = z.object({ runId: z.string().min(1).max(36) })

const runListSchema = automationIdSchema.extend({
  offset: z.number().int().min(0).max(100_000).default(0),
})

const decideSchema = runIdSchema.extend({
  decision: z.enum(["approved", "rejected"]),
})

const runErrorMessages: Record<string, string> = {
  NOT_FOUND: "That run no longer exists.",
  NOT_RUNNABLE:
    "This flow has something to fix before it can run. Check the steps marked in red.",
  NO_SINGLE_START:
    "This flow has more than one starting step, so there is no single place to begin. Connect the steps into one line and try again.",
  ALREADY_DECIDED:
    "That run was already decided — somebody else got there first, or the deadline passed.",
}

export const getAutomationRunErrorMessage = createErrorMessage(
  runErrorMessages,
  "We could not do that. Please try again."
)

const loadRunsPanelFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(automationIdSchema)
  .handler(async ({ data, context }): Promise<AutomationRunsPanelData> => {
    const [flow, waiting] = await Promise.all([
      readRunsForAutomation(context.user.id, data.automationId),
      readRunsAwaitingApproval(context.user.id),
    ])
    return {
      runs: flow.runs.map(serializeRun),
      total: flow.total,
      waiting: waiting.runs.map(serializeRun),
      waiting_total: waiting.total,
    }
  })

const listRunsForAutomationFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(runListSchema)
  .handler(async ({ data, context }) => {
    const page = await readRunsForAutomation(
      context.user.id,
      data.automationId,
      data.offset
    )
    return { runs: page.runs.map(serializeRun), total: page.total }
  })

const listWaitingRunsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }) => {
    const waiting = await readRunsAwaitingApproval(context.user.id)
    return { runs: waiting.runs.map(serializeRun), total: waiting.total }
  })

const getAutomationRunFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(runIdSchema)
  .handler(async ({ data, context }): Promise<AutomationRunDetailItem> => {
    const run = await readAutomationRun(context.user.id, data.runId)
    if (!run) throw new Error("NOT_FOUND")

    return {
      ...serializeRun(run),
      approval_summary: run.approvalSummary,
      approval_decided_at: run.approvalDecidedAt?.toISOString() ?? null,
      approval_decided_by_name: run.approvalDecidedByName,
      error: run.error,
      steps: run.steps.map((step) => ({
        id: step.id,
        node_id: step.nodeId,
        step_name: step.stepName,
        status: step.status as AutomationRunStepStatus,
        summary: step.summary,
        error: step.error,
        started_at: step.startedAt.toISOString(),
        finished_at: step.finishedAt.toISOString(),
      })),
    }
  })

/**
 * Sets a flow going, then walks it once before answering. Waiting the extra
 * moment is what lets the panel say what actually happened — a run that parked
 * at a checkpoint is already parked by the time the list redraws, instead of
 * reading as "Running" for fifteen seconds and then quietly changing.
 */
const runAutomationNowFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(automationIdSchema)
  .handler(async ({ data, context }): Promise<{ runId: string }> => {
    const run = await startAutomationRun(context.user.id, data.automationId)
    // The run is already saved, so a failure in the walk is the ticker's
    // problem to pick up rather than something to fail the button over.
    await runAutomationTick().catch((error) => {
      console.error("Automation tick after Run now failed", error)
    })
    return { runId: run.id }
  })

const decideApprovalFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(decideSchema)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    // Ownership first: `decideAutomationApproval` is the shared exit used by the
    // deadline sweep too, so it does not ask whose run it is.
    const run = await readAutomationRun(context.user.id, data.runId)
    if (!run) throw new Error("NOT_FOUND")

    const decided = await decideAutomationApproval({
      runId: data.runId,
      decision: data.decision,
      decidedByUserId: context.user.id,
      decidedByName: context.user.name,
    })
    if (!decided) throw new Error("ALREADY_DECIDED")

    // An approved run carries straight on rather than waiting for the ticker.
    if (data.decision === "approved") {
      await runAutomationTick().catch((error) => {
        console.error("Automation tick after approval failed", error)
      })
    }
    return { ok: true }
  })

const deleteAutomationRunFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(runIdSchema)
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const result = await deleteAutomationRuns(context.user.id, [data.runId])
    return { ok: result.deleted.length > 0 }
  })

export function loadAutomationRunsPanel(automationId: string) {
  return loadRunsPanelFn({ data: { automationId } })
}

export function listRunsForAutomation(automationId: string, offset: number) {
  return listRunsForAutomationFn({ data: { automationId, offset } })
}

export function listWaitingRuns() {
  return listWaitingRunsFn()
}

export function getAutomationRun(runId: string) {
  return getAutomationRunFn({ data: { runId } })
}

export function runAutomationNow(automationId: string) {
  return runAutomationNowFn({ data: { automationId } })
}

export function decideApproval(
  runId: string,
  decision: "approved" | "rejected"
) {
  return decideApprovalFn({ data: { runId, decision } })
}

export function deleteAutomationRun(runId: string) {
  return deleteAutomationRunFn({ data: { runId } })
}

function serializeRun(run: AutomationRunRow): AutomationRunItem {
  return {
    id: run.id,
    automation_id: run.automationId,
    automation_name: run.automationName,
    status: run.status,
    approval_decision:
      (run.approvalDecision as AutomationApprovalDecision | null) ?? null,
    approval_deadline_at: run.approvalDeadlineAt?.toISOString() ?? null,
    step_count: run.stepCount,
    started_at: run.startedAt.toISOString(),
    finished_at: run.finishedAt?.toISOString() ?? null,
  }
}
