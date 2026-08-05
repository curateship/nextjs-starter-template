import type { AutomationCompiledConfig } from "./compile"

/**
 * The words a run and its steps are described by, and the plain-English names
 * the screens show for them. Shared by the engine, the API and the pages, so
 * the database, the badge and the sentence can never disagree.
 */

export type AutomationRunStatus =
  | "active"
  | "waiting_approval"
  | "completed"
  | "failed"
  | "rejected"

export type AutomationRunStepStatus = "completed" | "failed" | "rejected"

export type AutomationApprovalDecision = "approved" | "rejected" | "timed_out"

/**
 * What the badge says. A rejected run reads differently depending on *why* it
 * was rejected, so the label takes the decision too — "Rejected" when a person
 * said no, "Timed out" when nobody answered.
 */
export function automationRunStatusLabel(
  status: AutomationRunStatus,
  decision: AutomationApprovalDecision | null
): string {
  if (status === "rejected") {
    return decision === "timed_out" ? "Timed out" : "Rejected"
  }
  return {
    active: "Running",
    waiting_approval: "Waiting for approval",
    completed: "Completed",
    failed: "Failed",
  }[status]
}

export const automationRunStepStatusLabels: Record<
  AutomationRunStepStatus,
  string
> = {
  completed: "Done",
  failed: "Failed",
  rejected: "Rejected",
}

/**
 * Where a run starts: the one step nothing else feeds into.
 *
 * A flow drawn as two disconnected lines has two of those, and the engine walks
 * exactly one path — so rather than silently picking one and running half the
 * flow, this returns null and the caller refuses to start it.
 */
export function automationEntryNodeId(
  config: AutomationCompiledConfig
): string | null {
  const fedInto = new Set(config.edges.map((edge) => edge.to))
  const roots = Object.keys(config.nodes).filter((id) => !fedInto.has(id))
  return roots.length === 1 ? roots[0] : null
}

/** The step after this one, or null when the flow ends here. */
export function automationNextNodeId(
  config: AutomationCompiledConfig,
  fromNodeId: string,
  sourcePort = "then"
): string | null {
  const edge = config.edges.find(
    (candidate) =>
      candidate.from === fromNodeId && candidate.sourcePort === sourcePort
  )
  return edge?.to ?? null
}
