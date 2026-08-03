import {
  approvalDeadline,
  waitForApprovalNode,
} from "@/lib/automations/nodes/wait-for-approval"
import type { CustomShellDb } from "@/server/db"
import type { CustomShellAutomationRun } from "@/server/schema"

/**
 * What a step is handed, and what it may answer with.
 *
 * One executor per node kind. A node task ships its descriptor (how it draws
 * and compiles) beside its executor here (what it does), and the engine knows
 * nothing about either.
 */
export type AutomationExecutorContext = {
  database: CustomShellDb
  run: CustomShellAutomationRun
  nodeId: string
  /** The node's settings, already strict-parsed at compile time. */
  settings: Record<string, unknown>
  now: () => Date
}

export type AutomationExecutorResult =
  /** Done — carry on to whatever this step feeds into. */
  | { type: "next"; summary: string }
  /** Done, and deliberately the end of the flow. */
  | { type: "complete"; summary: string }
  /**
   * Stop and wait for a person. The engine hands the claim back, so the run
   * occupies nothing while it waits, and auto-rejects it at `deadlineAt`.
   */
  | { type: "park"; summary: string; deadlineAt: Date }

export type AutomationExecutor = (
  context: AutomationExecutorContext
) => Promise<AutomationExecutorResult>

/**
 * Every node kind that can actually run. A kind with a descriptor but no
 * executor here still draws and compiles; reaching one at run time fails the
 * run in plain words rather than pretending the step happened.
 */
export const automationExecutors: Record<string, AutomationExecutor> = {
  placeholder: async () => ({
    type: "next",
    summary: "Did nothing — this is a stand-in step.",
  }),

  [waitForApprovalNode.kind]: async ({ settings, now }) => {
    const summary =
      typeof settings.summary === "string" ? settings.summary.trim() : ""
    const timeoutDays =
      typeof settings.timeoutDays === "number" ? settings.timeoutDays : 3

    return {
      type: "park",
      summary,
      deadlineAt: approvalDeadline(now(), timeoutDays),
    }
  },
}
