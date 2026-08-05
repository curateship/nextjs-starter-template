import { formatDate } from "@/lib/format-time"

/**
 * The words for one member's billing history.
 *
 * The table stores facts — a kind, the plan's name at the time, one extra
 * detail — and this turns them into the sentence the timeline shows. Kept here,
 * away from the server, so the admin window and the member's own billing page
 * (a later task) can never word the same event two different ways.
 */

/**
 * Everything that can happen to a plan. The webhook derives these by comparing
 * what Stripe now says against what we already had; the back office writes its
 * own directly.
 */
export const SUBSCRIPTION_EVENT_KINDS = [
  "trial_started",
  "subscribed",
  "trial_converted",
  "plan_changed",
  "payment_failed",
  "payment_recovered",
  "cancel_scheduled",
  "cancel_stopped",
  "canceled",
  "plan_granted",
  "grant_removed",
] as const

export type SubscriptionEventKind = (typeof SUBSCRIPTION_EVENT_KINDS)[number]

export type SubscriptionEvent = {
  id: string
  kind: string
  /** The plan the event is about, as it was named at the time. */
  planName: string | null
  /** Meaning depends on the kind — see `describeSubscriptionEvent`. */
  detail: string | null
  source: "stripe" | "admin"
  createdAt: string
}

/**
 * The day this app started keeping billing history.
 *
 * Nothing before it was recorded and nothing is reconstructed, so the timeline
 * says this out loud. A member who has been paying for a year would otherwise
 * look like a member who joined last week.
 */
export const BILLING_HISTORY_START = "2026-08-03T00:00:00.000Z"

/**
 * How many events one account's window asks for and shows. Older ones stay in
 * the table — nothing here is ever thrown away — so the card says when it is
 * showing a capped list rather than letting it read as the whole story.
 */
export const SUBSCRIPTION_EVENT_LIMIT = 50

/** One event, as a sentence somebody reading a support ticket would write. */
export function describeSubscriptionEvent(event: {
  kind: string
  planName: string | null
  detail: string | null
  source: "stripe" | "admin"
}) {
  const plan = event.planName ?? "their plan"
  const byAdmin = event.source === "admin"

  switch (event.kind) {
    case "trial_started":
      return `Started a trial of ${plan}.`
    case "subscribed":
      return `Subscribed to ${plan}.`
    case "trial_converted":
      return `The trial finished and ${plan} started being paid for.`
    case "plan_changed":
      return event.detail
        ? `Switched from ${event.detail} to ${plan}.`
        : `Switched to ${plan}.`
    case "payment_failed":
      return "A payment failed."
    case "payment_recovered":
      return `A payment went through and ${plan} is live again.`
    case "cancel_scheduled":
      return `${byAdmin ? "An admin set " : "Set "}${plan} to end${
        event.detail ? ` on ${formatDate(event.detail)}` : ""
      }, with no renewal.`
    case "cancel_stopped":
      return `The cancellation was called off — ${plan} renews again.`
    case "canceled":
      return byAdmin ? `An admin ended ${plan}.` : `${plan} ended.`
    case "plan_granted":
      return event.detail
        ? `An admin granted ${plan} until ${formatDate(event.detail)}.`
        : `An admin granted ${plan}, with no end date.`
    case "grant_removed":
      return "An admin took the granted plan away."
    default:
      // A kind added after this was written still has to read as something.
      return `${plan}: ${event.kind.replace(/[_-]+/g, " ")}.`
  }
}
