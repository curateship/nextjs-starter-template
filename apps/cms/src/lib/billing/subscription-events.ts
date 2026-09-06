import { formatDate } from "@/lib/format/format-time"

/**
 * The facts and wording for billing history.
 *
 * The table stores facts — a kind, the plan's name at the time, one extra
 * detail — and this turns them into the sentences the admin and member
 * timelines show. The member wording also decides which event kinds are safe
 * to show outside the back office.
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
  "paused",
  "resumed",
  "plan_granted",
  "grant_removed",
] as const

export type SubscriptionEventKind = (typeof SUBSCRIPTION_EVENT_KINDS)[number]

/**
 * Who caused it: a Stripe webhook, an admin in the back office, or the member
 * themselves. The third exists because pausing is the first thing a member can
 * do to their own plan from inside the app, and "an admin paused this" would be
 * a lie on their own timeline.
 */
export const SUBSCRIPTION_EVENT_SOURCES = ["stripe", "admin", "member"] as const

export type SubscriptionEventSource =
  (typeof SUBSCRIPTION_EVENT_SOURCES)[number]

/**
 * A stored source word, read back as one of the three. Anything else — a row
 * written by a version that knew a word this one does not — reads as Stripe,
 * which is the one that claims nothing about who did it.
 */
export function subscriptionEventSource(value: string): SubscriptionEventSource {
  return SUBSCRIPTION_EVENT_SOURCES.find((source) => source === value) ?? "stripe"
}

export type SubscriptionEvent = {
  id: string
  kind: string
  /** The plan the event is about, as it was named at the time. */
  planName: string | null
  /** Meaning depends on the kind — see `describeSubscriptionEvent`. */
  detail: string | null
  source: SubscriptionEventSource
  createdAt: string
}

type MemberEventFacts = {
  planName: string | null
  previousPlanName: string | null
  endsAt: string | null
}

/**
 * The billing events a member may read, and the words they see for each one.
 *
 * This map is also the allowlist. A new internal event stays off the member's
 * page until it has an entry here, which makes the safe wording a deliberate
 * decision instead of exposing a new kind by default.
 */
const MEMBER_EVENT_DESCRIPTIONS = {
  trial_started: (event: MemberEventFacts) =>
    `You started a trial of ${event.planName ?? "your plan"}.`,
  subscribed: (event: MemberEventFacts) =>
    `You subscribed to ${event.planName ?? "your plan"}.`,
  trial_converted: (event: MemberEventFacts) =>
    `Your trial ended and billing for ${event.planName ?? "your plan"} began.`,
  plan_changed: (event: MemberEventFacts) =>
    event.previousPlanName
      ? `You switched from ${event.previousPlanName} to ${event.planName ?? "your new plan"}.`
      : `You switched to ${event.planName ?? "a new plan"}.`,
  payment_failed: () => "Your payment failed.",
  payment_recovered: (event: MemberEventFacts) =>
    `Your payment went through and ${event.planName ?? "your plan"} is active again.`,
  cancel_scheduled: (event: MemberEventFacts) =>
    `${event.planName ?? "Your plan"} is set to end ${
      event.endsAt
        ? `on ${formatDate(event.endsAt)}`
        : "at the end of your current billing period"
    }. It will not renew.`,
  cancel_stopped: (event: MemberEventFacts) =>
    `The cancellation was stopped. ${event.planName ?? "Your plan"} will renew.`,
  canceled: (event: MemberEventFacts) =>
    `${event.planName ?? "Your plan"} ended.`,
  paused: (event: MemberEventFacts) =>
    `${event.planName ?? "Your plan"} was paused. Billing stopped and your account moved to the free plan.`,
  resumed: (event: MemberEventFacts) =>
    `${event.planName ?? "Your plan"} restarted. Billing started again.`,
  plan_granted: (event: MemberEventFacts) =>
    event.endsAt
      ? `${event.planName ?? "A plan"} was added to your account until ${formatDate(event.endsAt)}.`
      : `${event.planName ?? "A plan"} was added to your account with no end date.`,
  grant_removed: () => "The plan added to your account was removed.",
} satisfies Partial<
  Record<SubscriptionEventKind, (event: MemberEventFacts) => string>
>

type MemberSubscriptionEventKind = keyof typeof MEMBER_EVENT_DESCRIPTIONS

export type MemberSubscriptionEvent = Pick<
  SubscriptionEvent,
  "id" | "createdAt"
> &
  MemberEventFacts & { kind: MemberSubscriptionEventKind }

export const MEMBER_SUBSCRIPTION_EVENT_KINDS = Object.keys(
  MEMBER_EVENT_DESCRIPTIONS
) as MemberSubscriptionEventKind[]

function isMemberSubscriptionEventKind(
  kind: string
): kind is MemberSubscriptionEventKind {
  return Object.hasOwn(MEMBER_EVENT_DESCRIPTIONS, kind)
}

/** Remove provider status and who caused the change before returning it. */
export function memberSubscriptionEvent(
  event: SubscriptionEvent
): MemberSubscriptionEvent | null {
  if (!isMemberSubscriptionEventKind(event.kind)) return null

  return {
    id: event.id,
    kind: event.kind,
    planName: event.planName,
    previousPlanName: event.kind === "plan_changed" ? event.detail : null,
    endsAt:
      event.kind === "cancel_scheduled" || event.kind === "plan_granted"
        ? event.detail
        : null,
    createdAt: event.createdAt,
  }
}

/** One plan change in words written for the member it happened to. */
export function describeMemberSubscriptionEvent(
  event: MemberSubscriptionEvent
) {
  return MEMBER_EVENT_DESCRIPTIONS[event.kind](event)
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
  source: SubscriptionEventSource
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
    case "paused":
      return `${byAdmin ? "An admin paused" : "Paused"} ${plan}. Billing stopped and access dropped to the free plan.`
    case "resumed":
      return `${byAdmin ? "An admin restarted" : "Restarted"} ${plan}. Billing runs again.`
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
