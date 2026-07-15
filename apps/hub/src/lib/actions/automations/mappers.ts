import type {
  AutomationGraph,
  AutomationListItem,
  AutomationRunItem,
  AutomationRunStepItem,
  AutomationRunStatus,
  AutomationStatus,
  AutomationStepStatus,
  AutomationTriggerType,
} from '@/features/automations/domain/types'
import type {
  siteAutomations,
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
  steps: Array<typeof siteAutomationRunSteps.$inferSelect>
): AutomationRunItem {
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

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}
