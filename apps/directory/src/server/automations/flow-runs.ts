import { and, eq, inArray, or, sql, type SQL } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"

import { readSendSequence, sendSequenceNode } from "@/lib/automations/nodes/send-sequence"
import type { CustomShellDb } from "@/server/db"
import { customShellAutomationRuns } from "@/server/schema"

const runs = customShellAutomationRuns
const flowRuns = alias(customShellAutomationRuns, "flow_runs")

/** The flow run a sequence run was started by: `run:<flowRunId>:<nodeId>…`. */
export const startedByFlowRun = sql<string>`split_part(${runs.triggerKey}, ':', 2)`
/** The Send sequence step that started a sequence run. */
export const startedByStep = sql<string>`split_part(${runs.triggerKey}, ':', 3)`

/** This flow's own real runs, as a list of ids to match against. */
function realRunIdsOf(automationId: string, database: CustomShellDb) {
  return database
    .select({ id: flowRuns.id })
    .from(flowRuns)
    .where(and(eq(flowRuns.automationId, automationId), eq(flowRuns.testRun, false)))
}

/** The sequences a flow's Send sequence steps name, from a copy of the flow. */
export function flowSequenceIds(config: { nodes: Record<string, { kind: string; settings: Record<string, unknown> }> } | null): string[] {
  if (!config) return []
  const ids = Object.values(config.nodes).flatMap((node) =>
    node.kind === sendSequenceNode.kind ? [readSendSequence(node.settings).sequenceId] : []
  )
  return [...new Set(ids.filter(Boolean))]
}

/**
 * The sequence runs a flow's Send sequence steps started. A person on a
 * sequence is on a run of the sequence's own, keyed back to the flow run that
 * put them there, so this is how the flow finds the emails it caused. Only
 * the sequences the flow names are searched (`flowSequenceIds`), so nothing
 * reads every other sequence's runs.
 */
export function sequenceRunsOfFlow(automationId: string, database: CustomShellDb, sequenceIds: string[]): SQL {
  return and(
    inArray(runs.automationId, sequenceIds.length ? sequenceIds : [""]),
    eq(runs.triggerKind, sendSequenceNode.kind),
    eq(runs.testRun, false),
    inArray(startedByFlowRun, realRunIdsOf(automationId, database))
  ) as SQL
}

/** A flow's own real runs, and the sequence runs it started. */
export function realRunsOfFlowAndItsSequences(automationId: string, database: CustomShellDb, sequenceIds: string[]): SQL {
  return or(
    and(eq(runs.automationId, automationId), eq(runs.testRun, false)),
    sequenceRunsOfFlow(automationId, database, sequenceIds)
  ) as SQL
}
