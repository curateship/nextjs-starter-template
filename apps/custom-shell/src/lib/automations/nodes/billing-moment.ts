import { CreditCardIcon } from "lucide-react"
import { z } from "zod"

import { plural } from "@/lib/format/plural"

import { defineNode } from "../node-descriptor"

/**
 * A money moment starts the flow.
 *
 * One node with a choice on it rather than three nodes, the same shape the
 * Audience node takes. A flow has exactly one trigger, so the choice pins down
 * what the run will be about just as tightly as three separate kinds would —
 * and it is one card in the palette, one panel and one executor instead of
 * three of each.
 */
export const BILLING_MOMENTS = [
  "paymentFailed",
  "trialEnding",
  "cardExpiring",
] as const

export type BillingMoment = (typeof BILLING_MOMENTS)[number]

/**
 * The name of each moment — the node's own card, the palette's, and the line
 * the run history writes. One place, so the canvas and the history can never
 * describe the same choice two different ways.
 */
export const BILLING_MOMENT_LABELS: Record<BillingMoment, string> = {
  paymentFailed: "Payment failed",
  trialEnding: "Trial ending",
  cardExpiring: "Card expiring",
}

/** How far ahead of the end of a trial this can look. */
export const TRIAL_ENDING_DAYS = { min: 1, max: 30, default: 3 } as const

/**
 * The days the dropdown offers. The stored value is any whole number of days in
 * range, not one of these — a flow saved with 5 when the list said 7 keeps its
 * 5 rather than being quietly moved.
 */
export const TRIAL_ENDING_CHOICES = [1, 2, 3, 5, 7, 14] as const

export function isBillingMomentValue(value: unknown): value is BillingMoment {
  return (
    typeof value === "string" &&
    (BILLING_MOMENTS as readonly string[]).includes(value)
  )
}

/**
 * Which moment a saved node means, or null when it cannot be read.
 *
 * Null rather than a default on purpose. A *drawing* may fall back to the first
 * choice so a card still renders; deciding a flow fires on payment failures
 * because its settings were unreadable is the kind of guess that sends real
 * email to real people.
 */
export function readBillingMoment(
  settings: Record<string, unknown>
): BillingMoment | null {
  return isBillingMomentValue(settings.moment) ? settings.moment : null
}

/** Whether a flow's trigger settings mean this moment. */
export function isBillingMoment(moment: BillingMoment) {
  return (settings: Record<string, unknown>) =>
    readBillingMoment(settings) === moment
}

/** How many days of warning a trial-ending flow asked for. */
export function readTrialDaysBefore(settings: Record<string, unknown>): number {
  return typeof settings.daysBefore === "number"
    ? settings.daysBefore
    : TRIAL_ENDING_DAYS.default
}

/**
 * What each moment is, and the promise each one makes about firing once.
 *
 * These are the sentences the settings panel shows, so the rule that surprises
 * people — a bill Stripe retries is one failure, not four — is on screen next
 * to the choice rather than buried in a doc.
 */
export const BILLING_MOMENT_HINTS: Record<BillingMoment, string> = {
  paymentFailed:
    "The moment Stripe tells us a member's payment did not go through. Once for that bill — Stripe retries a bill it could not collect, and those retries start nothing, so nobody gets the same apology four times.",
  trialEnding:
    "A few times an hour the app looks for trials that have reached the warning below. One member is started once for one trial; extending their trial moves the end date, so the flow runs again against the new one.",
  cardExpiring:
    "Once a day the app compares the last day each saved card works against the day that member's plan renews, and starts for the members whose card loses. Quiet where a warning would be wrong: a plan already set to end has no renewal to fail, and a plan an admin granted is not charged to a card at all.",
}

export const billingMomentNode = defineNode({
  kind: "billingMoment",
  palette: {
    key: "trigger-billing-moment",
    group: "Triggers",
    // The card is titled by whichever moment a fresh one starts on, because its
    // title is its `name` and that follows the setting — which is what makes
    // the node on the canvas, and the run in the history, say "Trial ending"
    // rather than the family it belongs to. So the description carries the
    // other two, and says out loud that the choice is yours.
    description: "Pick one: a payment fails, a trial ends, or a card runs out",
  },
  createSettings: () => ({
    moment: "paymentFailed",
    daysBefore: TRIAL_ENDING_DAYS.default,
  }),
  settingsSchema: z.object({
    moment: z.enum(BILLING_MOMENTS),
    // Kept on every node rather than only on the one moment that reads it, so
    // switching the choice back and forth cannot lose what was typed. The two
    // moments that ignore it ignore it in the run as well.
    daysBefore: z
      .number()
      .int()
      .min(TRIAL_ENDING_DAYS.min)
      .max(TRIAL_ENDING_DAYS.max),
  }),
  // Display only, so settings that cannot be read draw as the first choice
  // rather than taking the card down. What must never fall back like this is a
  // *run* — see `readBillingMoment`.
  name: (settings) =>
    BILLING_MOMENT_LABELS[readBillingMoment(settings) ?? "paymentFailed"],
  description: (settings) => {
    const moment = readBillingMoment(settings) ?? "paymentFailed"
    if (moment === "trialEnding") {
      const days = readTrialDaysBefore(settings)
      return `Starts when a trial has ${days} ${plural(days, "day", "days")} left.`
    }
    return moment === "paymentFailed"
      ? "Starts when a member's payment fails. Once per bill, not once per retry."
      : "Starts when a member's saved card runs out before their plan renews."
  },
  icon: CreditCardIcon,
  outputPorts: [{ id: "then", label: "Then" }],
  hasInput: false,
  connectionError: () => null,
  fields: () => import("@/components/automations/nodes/billing-moment-panel"),
})
