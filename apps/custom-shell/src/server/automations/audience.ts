import {
  and,
  countDistinct,
  eq,
  isNotNull,
  isNull,
  notInArray,
  or,
  type SQL,
} from "drizzle-orm"

import {
  isAudienceKind,
  type AutomationAudienceKind,
} from "@/lib/automations/nodes/audience"
import {
  readSegment,
  segmentConditions,
  type SegmentDefinition,
} from "@/server/people/contact-segments"
import { db, type CustomShellDb } from "@/server/db"
import { activeSubscriptionCondition } from "@/server/billing/entitlements"
import {
  customShellContactSegments,
  customShellContacts,
  customShellPlans,
  customShellSubscriptions,
  customShellUsers,
} from "@/server/schema"
import { now } from "@/server/auth/security"

/**
 * Who a flow is about, worked out fresh every single time.
 *
 * The flow stores the *choice* — everyone, confirmed members, paying members,
 * one plan, one segment — and never the people. That is the whole point of the
 * node: a member who cancelled yesterday is not in today's run, and nobody had
 * to remember to take them off a list.
 *
 * The answer is a set of **contacts**, not accounts. Contacts are the one list
 * that has everybody — every account is kept in step with it by
 * `syncContactsFromUsers`, and an address added by hand with no account behind
 * it is a normal row, not an edge case. It is also where "unsubscribed" lives,
 * so an audience read from here can never include somebody who opted out.
 *
 * The compiled flow a run carries (`config_snapshot`) already holds this
 * choice, so a later send-style step reads it from there and asks again rather
 * than being handed a list that has since gone stale.
 */
export type AutomationAudience = {
  kind: AutomationAudienceKind
  /** The plan's short id, and "" for every kind except "plan". */
  planSlug: string
  /** The segment's row id, and "" for every kind except "segment". */
  segmentId: string
}

/** Thrown when a flow points at a plan that no longer exists. */
export class MissingAudiencePlanError extends Error {
  constructor(planSlug: string) {
    super(
      `No plan with the id "${planSlug}" exists any more, so this step cannot work out who it means.`
    )
    this.name = "MissingAudiencePlanError"
  }
}

/** Thrown when a flow points at a segment that no longer exists. */
export class MissingAudienceSegmentError extends Error {
  constructor() {
    super(
      "The segment this step points at no longer exists, so it cannot work out who it means."
    )
    this.name = "MissingAudienceSegmentError"
  }
}

/**
 * Reads a saved node's settings as an audience.
 *
 * Deliberately refuses rather than falling back. Every wrong answer this could
 * give is a *wider* audience than the flow asked for, and the whole point of
 * the node is that it is never wider than you said. Nothing valid can land here
 * anyway — a run only ever walks a flow the compiler has already accepted — so
 * an unreadable choice means something is genuinely wrong and the run should
 * stop and say so.
 */
export function readAutomationAudience(
  settings: Record<string, unknown>
): AutomationAudience {
  if (!isAudienceKind(settings.audience)) {
    throw new Error(
      "This step does not say who the flow is about, so it cannot go ahead."
    )
  }
  const kind = settings.audience
  const planSlug =
    kind === "plan" && typeof settings.planSlug === "string"
      ? settings.planSlug.trim()
      : ""
  const segmentId =
    kind === "segment" && typeof settings.segmentId === "string"
      ? settings.segmentId.trim()
      : ""
  return { kind, planSlug, segmentId }
}

/**
 * Two kinds of account are never in an audience, whatever the choice says:
 * somebody who has been suspended, and somebody whose account is on its way out
 * because they asked to close it. Neither should be hearing from us.
 */
const EXCLUDED_STATUSES = ["suspended", "pending_deletion"]

/**
 * The database condition for one audience, over `contacts` — joined against
 * accounts, subscriptions and plans by the caller below.
 */
function audienceCondition(
  audience: AutomationAudience,
  workspaceId: string,
  planId: string | null,
  segmentFilter: SQL | null,
  timestamp: Date
): SQL {
  const filters: SQL[] = [
    eq(customShellContacts.workspaceId, workspaceId),
    // Nobody who unsubscribed is ever in an audience, whatever the choice
    // says — that is the promise the unsubscribe link makes. Bounced and
    // complained addresses are out for the same reason: not "subscribed" is
    // not somebody to act on.
    eq(customShellContacts.status, "subscribed"),
    // A contact with no account has no account to be suspended, so the
    // account-status rule only applies where there is one.
    or(
      isNull(customShellContacts.userId),
      notInArray(customShellUsers.status, EXCLUDED_STATUSES)
    ) as SQL,
  ]

  // The three account-shaped choices exclude contacts with no account on
  // their own: an address cannot have confirmed an email or paid for a plan.
  if (audience.kind === "registered") {
    filters.push(isNotNull(customShellUsers.emailVerifiedAt))
  }

  if (audience.kind === "paying" || audience.kind === "plan") {
    // A subscription with no plan buys nothing, so it does not count as paying
    // whatever its status says.
    filters.push(isNotNull(customShellSubscriptions.planId))
    filters.push(activeSubscriptionCondition(timestamp))
  }

  if (audience.kind === "plan") {
    // Without the plan this would silently become "every paying member" — a far
    // bigger group than the flow asked for. Refuse instead; this is the same
    // refusal `requireAudiencePlan` already makes, kept here so no future
    // caller can reach the query without a plan.
    if (!planId) throw new MissingAudiencePlanError(audience.planSlug)
    filters.push(eq(customShellSubscriptions.planId, planId))
  }

  if (audience.kind === "segment") {
    // Same shape as the plan refusal above: a missing segment must never
    // quietly widen into "everyone".
    if (!segmentFilter) throw new MissingAudienceSegmentError()
    filters.push(segmentFilter)
  }

  return and(...filters) as SQL
}

/** The plan row a "one plan" audience points at, refusing a slug nothing answers. */
async function requireAudiencePlan(
  audience: AutomationAudience,
  database: CustomShellDb
): Promise<string | null> {
  if (audience.kind !== "plan") return null

  const [plan] = await database
    .select({ id: customShellPlans.id })
    .from(customShellPlans)
    .where(eq(customShellPlans.slug, audience.planSlug))
    .limit(1)

  // Matching nobody and meaning nobody look identical from the outside, and the
  // difference matters when the next step is a send. Say so instead.
  if (!plan) throw new MissingAudiencePlanError(audience.planSlug)
  return plan.id
}

/** A segment as the audience needs it: its rules, plus its name for wording. */
export type AudienceSegment = {
  name: string
  definition: SegmentDefinition
}

/**
 * The segment a "segment" audience points at, refusing an id nothing answers —
 * a deleted segment fails the run rather than matching more people. Null for
 * every other kind.
 */
export async function requireAudienceSegment(
  audience: AutomationAudience,
  workspaceId: string,
  database: CustomShellDb = db
): Promise<AudienceSegment | null> {
  if (audience.kind !== "segment") return null

  const [segment] = await database
    .select({
      id: customShellContactSegments.id,
      name: customShellContactSegments.name,
      kind: customShellContactSegments.kind,
      rules: customShellContactSegments.rules,
    })
    .from(customShellContactSegments)
    .where(
      and(
        eq(customShellContactSegments.workspaceId, workspaceId),
        eq(customShellContactSegments.id, audience.segmentId)
      )
    )
    .limit(1)

  if (!segment) throw new MissingAudienceSegmentError()
  return { name: segment.name, definition: readSegment(segment) }
}

/**
 * How many contacts match right now.
 *
 * A count rather than the rows, because that is what a run records and what the
 * inspector shows. The step that finally sends something asks for the people
 * themselves, through the same condition, at the moment it sends.
 *
 * Counts distinct contacts, because the subscriptions join can hand back the
 * same contact twice when an account carries two subscription rows — and this
 * is a count of people, not of rows.
 *
 * `segment` can be passed in by a caller that already looked it up (the
 * executor wants its name for the run history); left out, it is fetched here.
 */
export async function countAutomationAudience(
  audience: AutomationAudience,
  workspaceId: string,
  database: CustomShellDb = db,
  timestamp: Date = now(),
  segment?: AudienceSegment | null
): Promise<number> {
  const planId = await requireAudiencePlan(audience, database)
  const audienceSegment =
    segment ?? (await requireAudienceSegment(audience, workspaceId, database))
  const segmentFilter = audienceSegment
    ? await segmentConditions(
        workspaceId,
        audienceSegment.definition,
        database,
        timestamp
      )
    : null

  const [row] = await database
    .select({ total: countDistinct(customShellContacts.id) })
    .from(customShellContacts)
    .leftJoin(
      customShellUsers,
      eq(customShellUsers.id, customShellContacts.userId)
    )
    .leftJoin(
      customShellSubscriptions,
      eq(customShellSubscriptions.userId, customShellContacts.userId)
    )
    .where(
      audienceCondition(audience, workspaceId, planId, segmentFilter, timestamp)
    )

  return row?.total ?? 0
}
