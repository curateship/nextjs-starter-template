import type Stripe from "stripe"
import { count, desc, eq, notInArray } from "drizzle-orm"

import { describeCode } from "@/lib/code-label"
import { db, type CustomShellDb } from "@/server/db"
import {
  customShellDisputes,
  customShellSubscriptions,
  customShellUsers,
} from "@/server/schema"
import { now, uuid } from "@/server/security"

/**
 * Chargebacks: a member telling their bank to take a payment back.
 *
 * The app does not answer disputes — Stripe's dashboard does that. Everything
 * here exists so that an open one with a deadline cannot go unnoticed, which is
 * the only way a dispute turns into money lost by default.
 */

/**
 * The Stripe statuses that mean the argument is over.
 *
 * Everything else counts as open, including a status Stripe has not invented
 * yet. That is the safe direction: an unknown status makes the alert appear
 * when it maybe need not, rather than hiding one that matters.
 */
const CLOSED_STATUSES = ["won", "lost", "warning_closed"]

export function disputeIsOpen(status: string) {
  return !CLOSED_STATUSES.includes(status)
}

/** Stripe's status words, said the way a person would. */
const STATUS_LABELS: Record<string, string> = {
  warning_needs_response: "Early warning",
  warning_under_review: "Early warning, with the bank",
  warning_closed: "Warning withdrawn",
  needs_response: "Needs a response",
  under_review: "With the bank",
  won: "Won",
  lost: "Lost",
}

export function disputeStatusLabel(status: string) {
  // A word Stripe added after this was written falls back to being tidied up
  // rather than shown raw or blank.
  return STATUS_LABELS[status] ?? describeCode(status)
}

/** Reads the charge a dispute is against. Injectable so tests need no Stripe. */
export type ChargeReader = (chargeId: string) => Promise<Stripe.Charge>

export type DisputeRow = {
  id: string
  /** The member the disputed charge belongs to, when it could be matched. */
  memberName: string | null
  memberEmail: string | null
  amountCents: number
  currency: string
  /** Stripe's reason, already in words — "Product not received". */
  reason: string
  status: string
  statusLabel: string
  evidenceDueBy: string | null
  openedAt: string
  closedAt: string | null
  open: boolean
  /** Straight to this dispute in Stripe, where it is actually answered. */
  stripeUrl: string
}

export type DisputeList = {
  open: DisputeRow[]
  /** The most recently opened disputes, settled ones included. */
  recent: DisputeRow[]
  /** Every dispute ever, so a capped list never reads as the whole story. */
  total: number
}

const RECENT_LIMIT = 25

/**
 * Everything the admin billing page shows about disputes, in one query.
 *
 * Open ones come back soonest-deadline-first, because the deadline is the whole
 * reason this screen exists. A dispute with no deadline yet (the early-warning
 * stages) sorts after the ones that have one.
 */
export async function listDisputes(
  database: CustomShellDb = db
): Promise<DisputeList> {
  const [openRows, recentRows, [totals]] = await Promise.all([
    // Asked for separately, and deliberately uncapped. Reading the open ones
    // off the recent page would hide an old dispute still running whenever the
    // newest 25 all happened to be settled — and the whole job of the alert is
    // that it never misses one. `not in` rather than a list of open statuses,
    // so a status Stripe adds later still counts as open here, exactly as
    // `disputeIsOpen` treats it.
    withMember(database)
      .where(notInArray(customShellDisputes.status, CLOSED_STATUSES))
      .orderBy(desc(customShellDisputes.openedAt)),
    withMember(database)
      .orderBy(desc(customShellDisputes.openedAt))
      .limit(RECENT_LIMIT),
    database.select({ total: count() }).from(customShellDisputes),
  ])

  const recent = recentRows.map(toRow)
  const open = openRows.map(toRow).sort(byDeadline)

  return { open, recent, total: totals?.total ?? recent.length }
}

/** The join both lists share: a dispute plus whoever it belongs to. */
function withMember(database: CustomShellDb) {
  return database
    .select({
      dispute: customShellDisputes,
      memberName: customShellUsers.name,
      memberEmail: customShellUsers.email,
    })
    .from(customShellDisputes)
    .leftJoin(
      customShellUsers,
      eq(customShellUsers.id, customShellDisputes.userId)
    )
}

function toRow(row: {
  dispute: typeof customShellDisputes.$inferSelect
  memberName: string | null
  memberEmail: string | null
}) {
  return toDisputeRow(row.dispute, row.memberName, row.memberEmail)
}

/** Soonest deadline first; anything without one goes last. */
function byDeadline(left: DisputeRow, right: DisputeRow) {
  if (left.evidenceDueBy && right.evidenceDueBy) {
    return left.evidenceDueBy.localeCompare(right.evidenceDueBy)
  }
  if (left.evidenceDueBy) return -1
  if (right.evidenceDueBy) return 1
  return 0
}

function toDisputeRow(
  dispute: typeof customShellDisputes.$inferSelect,
  memberName: string | null,
  memberEmail: string | null
): DisputeRow {
  return {
    id: dispute.id,
    memberName,
    memberEmail,
    amountCents: dispute.amountCents,
    currency: dispute.currency,
    reason: describeCode(dispute.reason),
    status: dispute.status,
    statusLabel: disputeStatusLabel(dispute.status),
    evidenceDueBy: dispute.evidenceDueBy?.toISOString() ?? null,
    openedAt: dispute.openedAt.toISOString(),
    closedAt: dispute.closedAt?.toISOString() ?? null,
    open: disputeIsOpen(dispute.status),
    stripeUrl: disputeUrl(dispute.stripeDisputeId, dispute.livemode),
  }
}

/** Test-mode disputes live under a different path in Stripe's dashboard. */
function disputeUrl(stripeDisputeId: string, livemode: boolean) {
  return `https://dashboard.stripe.com/${livemode ? "" : "test/"}disputes/${stripeDisputeId}`
}

/**
 * Turns a `charge.dispute.*` event into the row to write.
 *
 * Every read the write needs happens here, before the caller opens its
 * transaction — the same shape `applyStripeEvent` already uses for
 * subscriptions, so the transaction holds locks for the write alone.
 */
export async function buildDisputeValues(
  database: CustomShellDb,
  event: Stripe.Event,
  readCharge: ChargeReader
) {
  const dispute = event.data.object as Stripe.Dispute
  const chargeId = idOf(dispute.charge)

  const [userId, existing] = await Promise.all([
    resolveDisputeUser(database, dispute.id, chargeId, readCharge),
    findDispute(database, dispute.id),
  ])

  const timestamp = now()
  const open = disputeIsOpen(dispute.status)

  const update = {
    stripeChargeId: chargeId,
    userId,
    amountCents: dispute.amount,
    currency: dispute.currency,
    reason: dispute.reason,
    status: dispute.status,
    evidenceDueBy: dispute.evidence_details?.due_by
      ? new Date(dispute.evidence_details.due_by * 1_000)
      : null,
    livemode: event.livemode,
    openedAt: new Date(dispute.created * 1_000),
    // The first close is the one that counts. A later event on an already
    // settled dispute — funds moving back and forth — must not restamp it.
    closedAt: open ? null : (existing?.closedAt ?? timestamp),
    updatedAt: timestamp,
  }

  return {
    insert: {
      id: uuid(),
      stripeDisputeId: dispute.id,
      createdAt: timestamp,
      ...update,
    },
    update,
  }
}

function findDispute(database: CustomShellDb, stripeDisputeId: string) {
  return database
    .select({ closedAt: customShellDisputes.closedAt })
    .from(customShellDisputes)
    .where(eq(customShellDisputes.stripeDisputeId, stripeDisputeId))
    .limit(1)
    .then((rows) => rows[0] ?? null)
}

/**
 * Whose charge was disputed, or null when it cannot be worked out.
 *
 * Null is a normal answer, not a failure: the charge may predate the account,
 * or belong to a Stripe customer this app never recorded. Stripe refusing to
 * answer lands here too — a dispute nobody can be named for still has a
 * deadline, and losing the whole record over a missing name would be the one
 * outcome worse than an unattributed alert.
 */
async function resolveDisputeUser(
  database: CustomShellDb,
  disputeId: string,
  chargeId: string | null,
  readCharge: ChargeReader
) {
  if (!chargeId) {
    return null
  }

  let customerId: string | null
  try {
    customerId = idOf((await readCharge(chargeId)).customer)
  } catch (error) {
    console.error("Dispute charge lookup failed", disputeId, error)
    return null
  }

  if (!customerId) {
    return null
  }

  const [match] = await database
    .select({ userId: customShellSubscriptions.userId })
    .from(customShellSubscriptions)
    .where(eq(customShellSubscriptions.stripeCustomerId, customerId))
    .limit(1)

  return match?.userId ?? null
}

function idOf(value: string | { id: string } | null | undefined) {
  if (!value) return null
  return typeof value === "string" ? value : value.id
}
