import { and, desc, eq, inArray } from "drizzle-orm"

import {
  MEMBER_SUBSCRIPTION_EVENT_KINDS,
  SUBSCRIPTION_EVENT_LIMIT,
  memberSubscriptionEvent,
  subscriptionEventSource,
  type MemberSubscriptionEvent,
  type SubscriptionEvent,
  type SubscriptionEventKind,
  type SubscriptionEventSource,
} from "@/lib/billing/subscription-events"
import { db, type CustomShellDb } from "@/server/db"
import {
  customShellSubscriptionEvents,
  type CustomShellSubscription,
} from "@/server/schema"
import { now, uuid } from "@/server/auth/security"

/**
 * Writing and reading one member's billing history.
 *
 * Two rules run through all of it. **Insert only** — nothing here updates or
 * deletes a row, because a record that can be edited is not a record. And **one
 * row per real change** — `deriveSubscriptionEvent` compares what Stripe now
 * says against what we already had, and a webhook that only repeats what we
 * knew writes nothing at all. That is what keeps the timeline a list of events
 * rather than a log of deliveries.
 */

/** The state a subscription is in, as far as the history cares. */
export type SubscriptionSnapshot = {
  planId: string | null
  planName: string | null
  status: string
  /** `manual` is a plan an admin granted; `stripe` is one being paid for. */
  source: string
  cancelAtPeriodEnd: boolean
  currentPeriodEnd: Date | null
  /** When the plan was put on hold, and null when it is running. */
  pausedAt: Date | null
}

/** Statuses that mean the plan is over rather than merely unwell. */
const DEAD_STATUSES = new Set(["canceled", "incomplete_expired"])

/** Statuses that mean Stripe could not take the money. */
const UNPAID_STATUSES = new Set(["past_due", "unpaid"])

/** Statuses where the person still has what they are paying for. */
const LIVE_STATUSES = new Set(["active", "trialing", "past_due"])

export type DerivedEvent = {
  kind: SubscriptionEventKind
  planName: string | null
  detail: string | null
}

/**
 * The one thing worth recording about a change, or null when nothing was.
 *
 * At most one event per webhook, on purpose: one Stripe event is one thing that
 * happened, and the unique `stripe_event_id` holds us to it. The order below is
 * what "the one thing" means when a single update carries more than one change
 * — the plan ending outranks a failed payment, which outranks a plan switch,
 * and so on down to the quietest.
 */
export function deriveSubscriptionEvent(
  before: SubscriptionSnapshot | null,
  after: SubscriptionSnapshot
): DerivedEvent | null {
  const plan = after.planName

  // Nothing here before: this account's first subscription.
  if (!before) {
    if (after.status === "trialing") {
      return { kind: "trial_started", planName: plan, detail: null }
    }
    if (LIVE_STATUSES.has(after.status)) {
      return { kind: "subscribed", planName: plan, detail: null }
    }
    // A subscription that arrives already dead — a checkout abandoned, an event
    // replayed long after the fact. There is no story in it.
    return null
  }

  if (DEAD_STATUSES.has(after.status) && !DEAD_STATUSES.has(before.status)) {
    return { kind: "canceled", planName: plan ?? before.planName, detail: null }
  }

  if (UNPAID_STATUSES.has(after.status) && !UNPAID_STATUSES.has(before.status)) {
    return { kind: "payment_failed", planName: plan, detail: after.status }
  }

  if (UNPAID_STATUSES.has(before.status) && after.status === "active") {
    return { kind: "payment_recovered", planName: plan, detail: null }
  }

  // A comp plan turning into a real one. Nothing else about the row need have
  // changed — same plan, same status — and starting to actually pay for
  // something is not a change the timeline can afford to miss.
  if (before.source === "manual" && after.source === "stripe") {
    return { kind: "subscribed", planName: plan, detail: null }
  }

  // Put on hold or taken off hold, whether that happened here or in the Stripe
  // dashboard. Compared as yes-or-no rather than by date: a webhook that
  // arrives while a plan is already paused must not read as a second pause.
  if (Boolean(after.pausedAt) !== Boolean(before.pausedAt)) {
    return {
      kind: after.pausedAt ? "paused" : "resumed",
      planName: plan ?? before.planName,
      detail: null,
    }
  }

  if (after.planId && before.planId && after.planId !== before.planId) {
    return { kind: "plan_changed", planName: plan, detail: before.planName }
  }

  if (after.status === "trialing" && before.status !== "trialing") {
    return { kind: "trial_started", planName: plan, detail: null }
  }

  if (before.status === "trialing" && after.status === "active") {
    return { kind: "trial_converted", planName: plan, detail: null }
  }

  if (after.cancelAtPeriodEnd && !before.cancelAtPeriodEnd) {
    return {
      kind: "cancel_scheduled",
      planName: plan,
      detail: after.currentPeriodEnd?.toISOString() ?? null,
    }
  }

  if (!after.cancelAtPeriodEnd && before.cancelAtPeriodEnd) {
    return { kind: "cancel_stopped", planName: plan, detail: null }
  }

  // Back from the dead: a lapsed or cancelled subscription that is live again.
  if (!LIVE_STATUSES.has(before.status) && LIVE_STATUSES.has(after.status)) {
    return { kind: "subscribed", planName: plan, detail: null }
  }

  // A renewal, a card swapped, a field we do not show — nothing to say.
  return null
}

/** The snapshot a stored subscription row makes, given its plan's name. */
export function snapshotOf(
  subscription: Pick<
    CustomShellSubscription,
    | "planId"
    | "status"
    | "source"
    | "cancelAtPeriodEnd"
    | "currentPeriodEnd"
    | "pausedAt"
  >,
  planName: string | null
): SubscriptionSnapshot {
  return {
    planId: subscription.planId,
    planName,
    status: subscription.status,
    source: subscription.source,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    currentPeriodEnd: subscription.currentPeriodEnd,
    pausedAt: subscription.pausedAt,
  }
}

/**
 * Writes one event.
 *
 * `onConflictDoNothing` covers the one duplicate this table can see: the same
 * Stripe event delivered twice at the same moment, where both copies get past
 * the caller's own check. Without a Stripe event id there is nothing to collide
 * on — an admin pressing cancel twice made two things happen, and both belong
 * in the history.
 */
export async function recordSubscriptionEvent(
  // Only the one verb this needs, so a transaction can be passed in as easily
  // as the database itself — the webhook writes its event inside the same
  // transaction as the change it describes.
  database: Pick<CustomShellDb, "insert">,
  event: {
    userId: string
    kind: SubscriptionEventKind
    planName?: string | null
    detail?: string | null
    source: SubscriptionEventSource
    stripeEventId?: string | null
  },
  at: Date = now()
) {
  await database
    .insert(customShellSubscriptionEvents)
    .values({
      id: uuid(),
      userId: event.userId,
      kind: event.kind,
      planName: event.planName ?? null,
      detail: event.detail ?? null,
      source: event.source,
      stripeEventId: event.stripeEventId ?? null,
      createdAt: at,
    })
    .onConflictDoNothing()
}

function toSubscriptionEvent(
  row: typeof customShellSubscriptionEvents.$inferSelect
): SubscriptionEvent {
  return {
    id: row.id,
    kind: row.kind,
    planName: row.planName,
    detail: row.detail,
    source: subscriptionEventSource(row.source),
    createdAt: row.createdAt.toISOString(),
  }
}

/** One person's history, newest first. */
export async function listSubscriptionEvents(
  userId: string,
  database: CustomShellDb = db
): Promise<SubscriptionEvent[]> {
  const rows = await database
    .select()
    .from(customShellSubscriptionEvents)
    .where(eq(customShellSubscriptionEvents.userId, userId))
    .orderBy(desc(customShellSubscriptionEvents.createdAt))
    .limit(SUBSCRIPTION_EVENT_LIMIT)

  return rows.map(toSubscriptionEvent)
}

/**
 * One member's own safe history, newest first.
 *
 * The caller supplies the trusted session user id, never a browser value. The
 * kind filter runs before the limit so hidden internal events cannot crowd an
 * older member-visible event out of the result.
 */
export async function listMemberSubscriptionEvents(
  userId: string,
  database: CustomShellDb = db
): Promise<MemberSubscriptionEvent[]> {
  const rows = await database
    .select()
    .from(customShellSubscriptionEvents)
    .where(
      and(
        eq(customShellSubscriptionEvents.userId, userId),
        inArray(
          customShellSubscriptionEvents.kind,
          MEMBER_SUBSCRIPTION_EVENT_KINDS
        )
      )
    )
    .orderBy(desc(customShellSubscriptionEvents.createdAt))
    .limit(SUBSCRIPTION_EVENT_LIMIT)

  return rows.flatMap((row) => {
    const event = memberSubscriptionEvent(toSubscriptionEvent(row))
    return event ? [event] : []
  })
}
