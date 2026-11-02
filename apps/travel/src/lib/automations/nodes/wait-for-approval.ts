import { UserCheckIcon } from "lucide-react"
import { z } from "zod"

import { defineNode } from "../node-descriptor"

/** How long an unanswered checkpoint waits before it auto-rejects. */
export const APPROVAL_TIMEOUT_DAYS = { min: 1, max: 30, default: 3 } as const

/**
 * The deadlines the dropdown offers. The stored value is any whole number of
 * days in range, not one of these — a flow saved with 5 when the list said 7
 * keeps its 5 rather than being quietly moved.
 */
export const APPROVAL_TIMEOUT_CHOICES = [1, 2, 3, 7, 14, 30] as const

/** The longest a summary can be — a sentence or two, not a document. */
export const APPROVAL_SUMMARY_MAX = 500

/**
 * The safety net: the flow stops here and waits for a person.
 *
 * Everything after this step is held back until somebody looks at the run and
 * says yes. Nobody answering is not the same as yes — the checkpoint carries a
 * deadline, and when it passes the run is rejected as timed out rather than
 * going ahead unattended.
 *
 * `summary` is required, and that is the point of the node. The reviewer sees
 * one screen with two buttons on it, and the only thing telling them what those
 * buttons do is this sentence — so a checkpoint that does not say what happens
 * on approve does not compile.
 */
export const waitForApprovalNode = defineNode({
  kind: "waitForApproval",
  palette: {
    key: "flow-approval",
    group: "Flow",
    description: "Pause until somebody approves it",
  },
  createSettings: () => ({
    summary: "",
    timeoutDays: APPROVAL_TIMEOUT_DAYS.default,
  }),
  settingsSchema: z.object({
    summary: z
      .string()
      .trim()
      .min(1, "Say what happens when this is approved.")
      .max(APPROVAL_SUMMARY_MAX),
    timeoutDays: z
      .number()
      .int()
      .min(APPROVAL_TIMEOUT_DAYS.min)
      .max(APPROVAL_TIMEOUT_DAYS.max),
  }),
  name: () => "Approval checkpoint",
  description: (settings) => {
    const summary =
      typeof settings.summary === "string" ? settings.summary.trim() : ""
    return summary || "Waits for somebody to approve before going on."
  },
  icon: UserCheckIcon,
  // One output. Approving continues down it; rejecting ends the run, so there
  // is no "no" path to draw — the flow simply stops.
  outputPorts: [{ id: "then", label: "Then" }],
  hasInput: true,
  connectionError: () => null,
  fields: () => import("@/components/automations/nodes/wait-for-approval-panel"),
})

/** The deadline a checkpoint parked now would carry. */
export function approvalDeadline(startedAt: Date, timeoutDays: number): Date {
  return new Date(startedAt.getTime() + timeoutDays * 24 * 60 * 60 * 1000)
}
