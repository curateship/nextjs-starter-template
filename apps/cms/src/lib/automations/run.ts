import type { AutomationCompiledConfig } from "./compile"
import {
  automationKindCanStartManually,
  automationKindIsTrigger,
} from "./node-registry"

/**
 * The words a run and its steps are described by, and the plain-English names
 * the screens show for them. Shared by the engine, the API and the pages, so
 * the database, the badge and the sentence can never disagree.
 */

/**
 * What a trigger knew when it started a run: the amount that failed, the day a
 * trial ends, the last four digits of a card. Saved with the run so the steps
 * after the trigger can act on the moment rather than look it up again — by
 * then the invoice may have been paid and the trial may have ended.
 *
 * Flat and JSON-only, the same claim `AutomationSettingValue` makes, because
 * these travel to the browser inside the run history's answer.
 */
export type AutomationTriggerFacts = Record<
  string,
  string | number | boolean | null
>

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
 * Where a run starts.
 *
 * A trigger step says so outright: it is the one step that begins a flow, and
 * nothing can connect into it, so when there is one it is the start. Flows
 * without a trigger — everything drawn before triggers existed — fall back to
 * the shape rule: the one step nothing else feeds into.
 *
 * Either way, "more than one candidate" answers null rather than picking. A
 * flow drawn as two disconnected lines has two starts, and the engine walks
 * exactly one path, so guessing would silently run half the flow.
 */
export function automationEntryNodeId(
  config: AutomationCompiledConfig
): string | null {
  const triggers = Object.entries(config.nodes)
    .filter(([, node]) => automationKindIsTrigger(node.kind))
    .map(([id]) => id)
  if (triggers.length > 0) return triggers.length === 1 ? triggers[0] : null

  const fedInto = new Set(config.edges.map((edge) => edge.to))
  const roots = Object.keys(config.nodes).filter((id) => !fedInto.has(id))
  return roots.length === 1 ? roots[0] : null
}

/** The trigger a flow reacts to, or null when it only ever runs by hand. */
export function automationTriggerKind(
  config: AutomationCompiledConfig
): string | null {
  const entry = automationEntryNodeId(config)
  const kind = entry ? config.nodes[entry]?.kind : undefined
  return kind && automationKindIsTrigger(kind) ? kind : null
}

/** Whether pressing Run can supply everything the flow's first step needs. */
export function automationCanStartManually(
  config: AutomationCompiledConfig
): boolean {
  const entry = automationEntryNodeId(config)
  const kind = entry ? config.nodes[entry]?.kind : undefined
  return Boolean(kind && automationKindCanStartManually(kind))
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
