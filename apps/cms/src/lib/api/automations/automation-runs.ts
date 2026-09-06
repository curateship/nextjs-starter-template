import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  decideAutomationApproval,
  deleteAutomationRuns,
  runAutomationTick,
  startAutomationRun,
  startAutomationTestRun,
} from "@/server/automations/engine"
import {
  getAutomationRun as readAutomationRun,
  listAutomationRunDeliveries as readAutomationRunDeliveries,
  listRunsAwaitingApproval as readRunsAwaitingApproval,
  listRunsForAutomation as readRunsForAutomation,
  type AutomationDeliveryState,
  type AutomationRunRow,
} from "@/server/automations/runs"
import { adminGet, adminPost } from "@/server/guards"
import {
  listActiveWorkspaceMembers,
  type WorkspaceMember,
} from "@/server/people/workspace-users"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

import type {
  AutomationApprovalDecision,
  AutomationRunStatus,
  AutomationRunStepStatus,
} from "@/lib/automations/run"
import type { AutomationRunOutput } from "@/lib/automations/node-descriptor"
import { createErrorMessage } from "../error-message"

export type AutomationTestMember = WorkspaceMember

export type AutomationRunItem = {
  id: string
  automation_id: string
  automation_name: string
  status: AutomationRunStatus
  /** Which of the three ways an approval ended, once one has. */
  approval_decision: AutomationApprovalDecision | null
  approval_deadline_at: string | null
  step_count: number
  /** Who the run is about, as they read on the day. Null for a hand-started run. */
  subject_label: string | null
  /** The step that started it, or null when somebody pressed Run. */
  trigger_name: string | null
  started_at: string
  finished_at: string | null
  is_test: boolean
}

export type AutomationRunStepItem = {
  id: string
  node_id: string
  kind: string
  step_name: string
  status: AutomationRunStepStatus
  summary: string
  output: AutomationRunOutput | null
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

export type AutomationRunDeliveryItem = {
  id: string
  to_email: string
  state: AutomationDeliveryState
  occurred_at: string
}

export type AutomationRunDeliveryPageItem = {
  deliveries: AutomationRunDeliveryItem[]
  total: number
  sent: number
  failed: number
  delivered: number
  opened: number
  clicked: number
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
const deliveryListSchema = runIdSchema.extend({
  nodeId: z.string().min(1).max(64),
  offset: z.number().int().min(0).max(100_000).default(0),
})
const testRunSchema = automationIdSchema.extend({
  memberId: z.string().min(1).max(36),
})
const testMemberSearchSchema = z.object({
  search: z.string().trim().max(120).default(""),
})

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
  REQUIRES_SUBJECT:
    "This flow needs a real member or event to begin. Use Test with member instead.",
  ALREADY_DECIDED:
    "That run was already decided — somebody else got there first, or the deadline passed.",
  AUTOMATIONS_PAUSED:
    "Every automation is paused right now, so nothing new can be started. Resume them first.",
  MEMBER_NOT_FOUND:
    "That active member no longer exists. Choose another member and try again.",
}

export const getAutomationRunErrorMessage = createErrorMessage(
  runErrorMessages,
  "We could not update that automation run. Please try again."
)

const loadRunsPanelFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(automationIdSchema)
  .handler(async ({ data, context }): Promise<AutomationRunsPanelData> => {
    // The SITE's runs, not the person's. These read by workspace, and passing
    // a user id here matched no rows at all — every flow's Runs tab said it had
    // never run while the runs sat in the table.
    const workspaceId = await workspaceIdForRequest(context.user.id)
    const [flow, waiting] = await Promise.all([
      readRunsForAutomation(workspaceId, data.automationId),
      readRunsAwaitingApproval(workspaceId),
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
    const workspaceId = await workspaceIdForRequest(context.user.id)
    const page = await readRunsForAutomation(
      workspaceId,
      data.automationId,
      data.offset
    )
    return { runs: page.runs.map(serializeRun), total: page.total }
  })

const listWaitingRunsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }) => {
    const waiting = await readRunsAwaitingApproval(
      await workspaceIdForRequest(context.user.id)
    )
    return { runs: waiting.runs.map(serializeRun), total: waiting.total }
  })

const getAutomationRunFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(runIdSchema)
  .handler(async ({ data, context }): Promise<AutomationRunDetailItem> => {
    const run = await readAutomationRun(
      await workspaceIdForRequest(context.user.id),
      data.runId
    )
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
        kind: step.kind,
        step_name: step.stepName,
        status: step.status as AutomationRunStepStatus,
        summary: step.summary,
        output: step.output,
        error: step.error,
        started_at: step.startedAt.toISOString(),
        finished_at: step.finishedAt.toISOString(),
      })),
    }
  })

const listAutomationRunDeliveriesFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .validator(deliveryListSchema)
  .handler(async ({ data, context }): Promise<AutomationRunDeliveryPageItem> => {
    const page = await readAutomationRunDeliveries(
      await workspaceIdForRequest(context.user.id),
      data.runId,
      data.nodeId,
      data.offset
    )
    if (!page) throw new Error("NOT_FOUND")
    return {
      ...page,
      deliveries: page.deliveries.map((delivery) => ({
        id: delivery.id,
        to_email: delivery.toEmail,
        state: delivery.state,
        occurred_at: delivery.occurredAt.toISOString(),
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
    const run = await startAutomationRun(
      await workspaceIdForRequest(context.user.id),
      context.user.id,
      data.automationId
    )
    // The run is already saved, so a failure in the walk is the ticker's
    // problem to pick up rather than something to fail the button over.
    await runAutomationTick().catch((error) => {
      console.error("Automation tick after Run now failed", error)
    })
    return { runId: run.id }
  })

const testAutomationWithMemberFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(testRunSchema)
  .handler(async ({ data, context }): Promise<{ runId: string }> => {
    const run = await startAutomationTestRun(
      await workspaceIdForRequest(context.user.id),
      context.user.id,
      data.automationId,
      data.memberId
    )
    await runAutomationTick().catch((error) => {
      console.error("Automation tick after member test failed", error)
    })
    return { runId: run.id }
  })

const listAutomationTestMembersFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(testMemberSearchSchema)
  .handler(async ({ data, context }): Promise<WorkspaceMember[]> => {
    return listActiveWorkspaceMembers(
      await workspaceIdForRequest(context.user.id),
      data.search
    )
  })

const decideApprovalFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(decideSchema)
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    // Ownership first: `decideAutomationApproval` is the shared exit used by the
    // deadline sweep too, so it does not ask whose run it is.
    const run = await readAutomationRun(
      await workspaceIdForRequest(context.user.id),
      data.runId
    )
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
    const result = await deleteAutomationRuns(
      await workspaceIdForRequest(context.user.id),
      [data.runId]
    )
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

export function listAutomationRunDeliveries(
  runId: string,
  nodeId: string,
  offset: number
) {
  return listAutomationRunDeliveriesFn({ data: { runId, nodeId, offset } })
}

export function runAutomationNow(automationId: string) {
  return runAutomationNowFn({ data: { automationId } })
}

export function testAutomationWithMember(
  automationId: string,
  memberId: string
) {
  return testAutomationWithMemberFn({ data: { automationId, memberId } })
}

export function listAutomationTestMembers(search: string) {
  return listAutomationTestMembersFn({ data: { search } })
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
    subject_label: run.subjectLabel,
    trigger_name: run.triggerName,
    started_at: run.startedAt.toISOString(),
    finished_at: run.finishedAt?.toISOString() ?? null,
    is_test: run.testRun,
  }
}
