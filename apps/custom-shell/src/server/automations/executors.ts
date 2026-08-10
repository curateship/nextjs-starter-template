import { audienceNode, audienceWording } from "@/lib/automations/nodes/audience"
import {
  billingMomentNode,
  readBillingMoment,
} from "@/lib/automations/nodes/billing-moment"
import {
  approvalDeadline,
  waitForApprovalNode,
} from "@/lib/automations/nodes/wait-for-approval"
import { sendEmailNode } from "@/lib/automations/nodes/send-email"
import { webhookNode } from "@/lib/automations/nodes/webhook"
import { appAutomationExecutors } from "@/server/app-options"
import {
  countAutomationAudience,
  readAutomationAudience,
  requireAudienceSegment,
} from "@/server/automations/audience"
import { syncContactsFromUsers } from "@/server/people/contacts"
import type { CustomShellDb } from "@/server/db"
import type { CustomShellAutomationRun } from "@/server/schema"
import { workspaceForRun } from "@/server/automations/runs"
import type { AutomationTriggerFacts } from "@/lib/automations/run"
import { formatDate } from "@/lib/format/format-time"
import { plural } from "@/lib/format/plural"
import { executeSendEmailNode } from "@/server/automations/send-email"
import { executeWebhookNode } from "@/server/automations/webhook"

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
  /** The dry-run task sets this so outside effects can describe, not happen. */
  dryRun?: boolean
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
   * The billing trigger, and all a trigger step does when the flow reaches it
   * is say why the flow is running.
   *
   * The work happened before the run existed — the webhook, or the look that
   * spotted the date. This writes the first line of the history, and it is the
   * line that names the moment and the person.
   *
   * A flow started by hand has no moment and nobody to be about, and that is
   * allowed on purpose: it is how you try the rest of a recovery flow without
   * having to make a real payment fail.
   */
  [billingMomentNode.kind]: async ({ run, settings }) => {
    const facts = run.triggerFacts
    const who = run.subjectLabel?.trim()
    if (!facts || !who) {
      return {
        type: "next",
        summary:
          "Started by hand, so there is nobody in particular this run is about. The steps after this one act on whoever they are set to.",
      }
    }
    return { type: "next", summary: billingMomentLine(settings, facts, who) }
  },

  /**
   * Works out who the rest of the flow is about and writes the answer into the
   * run's history — the choice and the number it matched, never the names.
   *
   * The answer is a count of contacts, in the flow owner's current workspace —
   * the same list a newsletter reads, so a person who unsubscribed can never be
   * in an audience and an address with no account behind it can. The contact
   * list is brought up to date with the accounts first, the same first move
   * every send batch makes, so nobody who signed up since the last sync is
   * missing from the count.
   *
   * Matching nobody is not a failure: a flow that runs on a week when nobody
   * qualifies should say so and carry on, not stop as broken. A plan or a
   * segment the flow points at having been deleted *is* a failure, because
   * carrying on would mean guessing.
   */
  [audienceNode.kind]: async ({ database, run, settings, now }) => {
    const audience = readAutomationAudience(settings)
    // The run's own workspace, fixed when it started. Only a run that predates
    // that column falls back to its owner's — looking it up every time is how a
    // flow's audience used to change when its owner switched workspace.
    const workspaceId = await workspaceForRun(run, database)
    await syncContactsFromUsers(workspaceId, database)

    // Looked up here as well as inside the count so the run history can say
    // the segment's name — and looked up by id, so a renamed segment still
    // means the same people.
    const segment = await requireAudienceSegment(
      audience,
      workspaceId,
      database
    )
    const matched = await countAutomationAudience(
      audience,
      workspaceId,
      database,
      now(),
      segment
    )
    const who = audienceWording(
      audience.kind,
      audience.planSlug,
      segment?.name ?? ""
    )

    return {
      type: "next",
      summary:
        matched === 0
          ? `Nobody matched just now — ${who}. The rest of the flow has no one to act on.`
          : `Matched ${matched} ${plural(matched, "person", "people")} — ${who}.`,
    }
  },

  [sendEmailNode.kind]: executeSendEmailNode,

  [webhookNode.kind]: executeWebhookNode,

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

/**
 * One sentence saying what happened and to whom, in the words of whichever
 * moment the node was set to.
 *
 * The moment comes from the node's own settings rather than from the facts,
 * because the settings are the run's frozen copy of what the flow was watching
 * for — the same thing that decided it should start at all.
 */
function billingMomentLine(
  settings: Record<string, unknown>,
  facts: AutomationTriggerFacts,
  who: string
): string {
  const moment = readBillingMoment(settings)

  if (moment === "trialEnding") {
    const days = typeof facts.daysLeft === "number" ? facts.daysLeft : null
    const ends = text(facts.trialEndsAt)
    return days === null
      ? `${who}'s free trial is running out.`
      : `${who}'s free trial has ${days} ${plural(days, "day", "days")} left${
          ends ? `, ending ${formatDate(ends)}` : ""
        }.`
  }

  if (moment === "cardExpiring") {
    const card = [text(facts.cardBrand), text(facts.cardLast4)]
      .filter(Boolean)
      .join(" ending ")
    const expires = text(facts.cardExpiresOn)
    const renews = text(facts.renewsAt)
    return [
      card
        ? `${who}'s ${card} runs out${expires ? ` in ${expires}` : ""}.`
        : `${who}'s saved card runs out${expires ? ` in ${expires}` : ""}.`,
      renews ? `Their plan renews on ${formatDate(renews)}.` : "",
    ]
      .filter(Boolean)
      .join(" ")
  }

  const amount = text(facts.amountDue)
  const next = text(facts.nextAttemptAt)
  return [
    amount
      ? `${who}'s payment of ${amount} did not go through.`
      : `${who}'s payment did not go through.`,
    text(facts.invoiceNumber) ? `Bill ${text(facts.invoiceNumber)}.` : "",
    next ? `Stripe tries again on ${formatDate(next)}.` : "",
  ]
    .filter(Boolean)
    .join(" ")
}

/** A fact as a trimmed string, or "" for anything that is not text. */
function text(value: AutomationTriggerFacts[string]): string {
  return typeof value === "string" ? value.trim() : ""
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
