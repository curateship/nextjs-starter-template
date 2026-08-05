import { audienceNode, audienceWording } from "@/lib/automations/nodes/audience"
import {
  approvalDeadline,
  waitForApprovalNode,
} from "@/lib/automations/nodes/wait-for-approval"
import { appAutomationExecutors } from "@/server/app-options"
import {
  countAutomationAudience,
  readAutomationAudience,
} from "@/server/automation-audience"
import type { CustomShellDb } from "@/server/db"
import type { CustomShellAutomationRun } from "@/server/schema"
import { plural } from "@/lib/plural"

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
 * Every node kind the shell itself can run. A kind with a descriptor but no
 * executor still draws and compiles; reaching one at run time fails the run in
 * plain words rather than pretending the step happened.
 */
export const automationExecutors: Record<string, AutomationExecutor> = {
  placeholder: async () => ({
    type: "next",
    summary: "Did nothing — this is a stand-in step.",
  }),

  /**
   * Works out who the rest of the flow is about and writes the answer into the
   * run's history — the choice and the number it matched, never the names.
   *
   * Matching nobody is not a failure: a flow that runs on a week when nobody
   * qualifies should say so and carry on, not stop as broken. A plan the flow
   * points at having been deleted *is* a failure, because carrying on would
   * mean guessing.
   */
  [audienceNode.kind]: async ({ database, settings, now }) => {
    const audience = readAutomationAudience(settings)
    const matched = await countAutomationAudience(audience, database, now())
    const who = audienceWording(audience.kind, audience.planSlug)

    return {
      type: "next",
      summary:
        matched === 0
          ? `Nobody matched just now — ${who}. The rest of the flow has no one to act on.`
          : `Matched ${matched} ${plural(matched, "person", "people")} — ${who}.`,
    }
  },

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

let appExecutors: Record<string, AutomationExecutor> | null = null

/**
 * The steps this app added, checked once against the shell's own.
 *
 * Read on demand rather than at the top of this file: the app's answers import
 * app code, which imports shell code, which can lead back here.
 */
function checkedAppExecutors(): Record<string, AutomationExecutor> {
  if (appExecutors) return appExecutors
  const supplied = appAutomationExecutors()
  for (const kind of Object.keys(supplied)) {
    // An app adds steps; it never takes one of the shell's over. Letting it
    // would change what already-saved flows do with nothing on screen saying
    // so.
    if (Object.hasOwn(automationExecutors, kind)) {
      throw new Error(
        `This app supplies its own "${kind}" automation step, but the shell already runs one. An app's own step needs a kind the shell isn't already using.`
      )
    }
  }
  appExecutors = supplied
  return appExecutors
}

/**
 * What runs a step of this kind — the shell's own first — or null if nothing
 * does.
 *
 * `hasOwn` rather than plain indexing because a kind is whatever a saved graph
 * says it is, and `automationExecutors["constructor"]` would otherwise hand
 * back something off `Object`'s prototype and the engine would try to run it.
 */
export function automationExecutorFor(
  kind: string
): AutomationExecutor | null {
  if (Object.hasOwn(automationExecutors, kind)) return automationExecutors[kind]
  const supplied = checkedAppExecutors()
  return Object.hasOwn(supplied, kind) ? supplied[kind] : null
}
