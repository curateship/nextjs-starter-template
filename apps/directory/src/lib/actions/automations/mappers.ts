import type {
  AutomationApprovalStatus,
  AutomationApprovalSummary,
  AutomationGraph,
  AutomationJsonValue,
  AutomationListItem,
  AutomationRunApprovalItem,
  AutomationRunItem,
  AutomationRunStepItem,
  AutomationRunStatus,
  AutomationStatus,
  AutomationStepStatus,
  AutomationTriggerType,
} from '@/features/automations/domain/types'
import type {
  siteAutomations,
  siteAutomationApprovals,
  siteAutomationRuns,
  siteAutomationRunSteps,
} from '@/lib/db/schema'

export function automationRowToListItem(
  row: typeof siteAutomations.$inferSelect,
  graph: AutomationGraph
): AutomationListItem {
  return {
    id: row.id,
    siteId: row.siteId,
    name: row.name,
    status: row.status as AutomationStatus,
    nodeCount: graph.nodes.length,
    schedule: graph.nodes.find((node) => node.kind === 'time')?.config.schedule ?? null,
    nextRunAt: row.nextRunAt?.toISOString() ?? null,
    lastRunAt: row.lastRunAt?.toISOString() ?? null,
    lastRunStatus: (row.lastRunStatus as AutomationRunStatus | null) ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function automationRunRowToItem(
  row: typeof siteAutomationRuns.$inferSelect,
  steps: Array<typeof siteAutomationRunSteps.$inferSelect>,
  approvals: Array<typeof siteAutomationApprovals.$inferSelect> = []
): AutomationRunItem {
  const stepNames = new Map(steps.map((step) => [step.nodeId, step.nodeName]))
  return {
    id: row.id,
    automationId: row.automationId,
    status: row.status as AutomationRunStatus,
    triggerType: row.triggerType as AutomationTriggerType,
    error: row.error,
    startedAt: row.startedAt.toISOString(),
    completedAt: row.completedAt?.toISOString() ?? null,
    durationMs: row.durationMs,
    steps: steps.map(automationStepRowToItem),
    // The held payload never leaves the server — only the display summary does.
    approvals: approvals.map((approval) => ({
      id: approval.id,
      nodeId: approval.nodeId,
      nodeName: stepNames.get(approval.nodeId) ?? 'Approval',
      status: approval.status as AutomationApprovalStatus,
      summary: approvalSummary(approval.summary),
      expiresAt: approval.expiresAt.toISOString(),
      decidedAt: approval.decidedAt?.toISOString() ?? null,
    })) satisfies AutomationRunApprovalItem[],
  }
}

function approvalSummary(value: unknown): AutomationApprovalSummary {
  const record = asRecord(value)
  return {
    ...(typeof record.title === 'string' ? { title: record.title } : {}),
    ...(typeof record.excerpt === 'string' ? { excerpt: record.excerpt } : {}),
    ...(typeof record.wordCount === 'number' ? { wordCount: record.wordCount } : {}),
  }
}

function automationStepRowToItem(row: typeof siteAutomationRunSteps.$inferSelect): AutomationRunStepItem {
  return {
    id: row.id,
    nodeId: row.nodeId,
    nodeKind: row.nodeKind as AutomationRunStepItem['nodeKind'],
    nodeName: row.nodeName,
    status: row.status as AutomationStepStatus,
    attemptCount: row.attemptCount,
    inputSummary: asRecord(row.inputSummary),
    outputSummary: asRecord(row.outputSummary),
    error: row.error,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
    durationMs: row.durationMs,
  }
}

function asRecord(value: unknown): Record<string, AutomationJsonValue> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, AutomationJsonValue>
    : {}
}
