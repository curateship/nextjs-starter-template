import {
  and,
  asc,
  countDistinct,
  eq,
  exists,
  gt,
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
  customShellMemberTags,
  customShellPlans,
  customShellSubscriptions,
  customShellUsers,
} from "@/server/schema"
import { now } from "@/server/auth/security"
import { normalizeMemberTag } from "@/lib/member-tags"

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
  /** The normalized account label, and "" for every kind except "tag". */
  tag: string
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
  const tag =
    kind === "tag" && typeof settings.tag === "string"
      ? normalizeMemberTag(settings.tag)
      : ""
  return { kind, planSlug, segmentId, tag }
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
  timestamp: Date,
  database: CustomShellDb
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

  if (audience.kind === "tag") {
    if (!audience.tag) {
      throw new Error(
        "This audience step does not say which member tag to match."
      )
    }
    filters.push(
      exists(
        database
          .select({ userId: customShellMemberTags.userId })
          .from(customShellMemberTags)
          .where(
            and(
              eq(customShellMemberTags.userId, customShellContacts.userId),
              eq(customShellMemberTags.tag, audience.tag)
            )
          )
      )
    )
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
 * One audience as a finished database condition — the plan and the segment
 * looked up, and every rule folded in.
 *
 * The one place a choice becomes a query. The count below, the sample the
 * inspector shows and — later — the step that actually sends all read it, so
 * the number somebody was shown while building the flow is the number the flow
 * works on.
 *
 * `segment` can be passed in by a caller that already looked it up (the
 * executor wants its name for the run history); left out, it is fetched here.
 */
async function audienceFilter(
  audience: AutomationAudience,
  workspaceId: string,
  database: CustomShellDb,
  timestamp: Date,
  segment?: AudienceSegment | null
): Promise<SQL> {
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

  return audienceCondition(
    audience,
    workspaceId,
    planId,
    segmentFilter,
    timestamp,
    database
  )
}

/**
 * How many contacts a finished condition matches.
 *
 * Counts distinct contacts, not rows: the query joins accounts and
 * subscriptions to read the conditions, and a join is free to hand the same
 * contact back more than once. This is a count of people.
 */
async function countMatching(
  database: CustomShellDb,
  filter: SQL
): Promise<number> {
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
    .where(filter)

  return row?.total ?? 0
}

/**
 * How many contacts match right now.
 *
 * A count rather than the rows, because that is what a run records. The step
 * that finally sends something asks for the people themselves, through the same
 * condition, at the moment it sends.
 */
export async function countAutomationAudience(
  audience: AutomationAudience,
  workspaceId: string,
  database: CustomShellDb = db,
  timestamp: Date = now(),
  segment?: AudienceSegment | null
): Promise<number> {
  return countMatching(
    database,
    await audienceFilter(audience, workspaceId, database, timestamp, segment)
  )
}

/** Whether one real member belongs to this audience right now. */
export async function memberMatchesAutomationAudience(
  audience: AutomationAudience,
  workspaceId: string,
  userId: string,
  database: CustomShellDb = db,
  timestamp: Date = now(),
  segment?: AudienceSegment | null
): Promise<boolean> {
  return (
    (await countMatching(
      database,
      and(
        await audienceFilter(
          audience,
          workspaceId,
          database,
          timestamp,
          segment
        ),
        eq(customShellContacts.userId, userId)
      ) as SQL
    )) > 0
  )
}

/** One contact a send-style automation step can act on. */
export type AutomationAudienceContact = {
  id: string
  userId: string | null
  email: string
  firstName: string | null
  lastName: string | null
  emailVerifiedAt: Date | null
  createdAt: Date
}

/**
 * One bounded page of an audience, in a stable order.
 *
 * Send-style steps ask for the next page after finishing the current one, so a
 * large audience never becomes one large array in server memory. Verification
 * is returned as a fact rather than folded into the audience condition: the
 * caller must count an unconfirmed member as skipped, not make them disappear.
 */
export async function listAutomationAudienceContacts(
  audience: AutomationAudience,
  workspaceId: string,
  options: {
    limit: number
    after?: { createdAt: Date; id: string }
    timestamp?: Date
  },
  database: CustomShellDb = db
): Promise<AutomationAudienceContact[]> {
  const limit = Math.min(Math.max(options.limit, 1), 100)
  const filter = await audienceFilter(
    audience,
    workspaceId,
    database,
    options.timestamp ?? now()
  )
  const after = options.after
    ? or(
        gt(customShellContacts.createdAt, options.after.createdAt),
        and(
          eq(customShellContacts.createdAt, options.after.createdAt),
          gt(customShellContacts.id, options.after.id)
        )
      )
    : undefined

  return database
    .selectDistinct({
      id: customShellContacts.id,
      userId: customShellContacts.userId,
      email: customShellContacts.email,
      firstName: customShellContacts.firstName,
      lastName: customShellContacts.lastName,
      emailVerifiedAt: customShellUsers.emailVerifiedAt,
      createdAt: customShellContacts.createdAt,
    })
    .from(customShellContacts)
    .leftJoin(
      customShellUsers,
      eq(customShellUsers.id, customShellContacts.userId)
    )
    .leftJoin(
      customShellSubscriptions,
      eq(customShellSubscriptions.userId, customShellContacts.userId)
    )
    .where(and(filter, after))
    .orderBy(asc(customShellContacts.createdAt), asc(customShellContacts.id))
    .limit(limit)
}

/** One of the handful of people the inspector shows by name. */
export type AudienceSampleContact = {
  id: string
  email: string
  /** Their name when the contact has one, and "" when it does not. */
  name: string
}

/**
 * What the node's settings panel says about a choice while it is being built.
 *
 * `total` is what a run would match if it went now, `everyone` is how many the
 * widest choice would reach, and `sample` is the first few of them by email —
 * enough to recognise the group without turning the panel into a member list.
 */
export type AudiencePreview = {
  total: number
  everyone: number
  sample: AudienceSampleContact[]
}

/** How many people the panel names before it says "and n more". */
export const AUDIENCE_SAMPLE_SIZE = 5

/**
 * The count, the whole list's size and a few names — everything the inspector
 * needs to show the blast radius of a choice before anything runs.
 *
 * The sample is bounded to a handful of rows, so an audience of fifty thousand
 * costs the same as one of five: a count and five rows, never the people
 * themselves. `everyone` is the same query with the widest choice, and it is
 * only what the "this is most of your list" nudge compares against — for the
 * widest choice itself there is nothing to compare, so it is not asked for.
 */
export async function previewAutomationAudience(
  audience: AutomationAudience,
  workspaceId: string,
  database: CustomShellDb = db,
  timestamp: Date = now()
): Promise<AudiencePreview> {
  const filter = await audienceFilter(
    audience,
    workspaceId,
    database,
    timestamp
  )

  const [total, sample, everyone] = await Promise.all([
    countMatching(database, filter),
    // The same joins as the count, because the condition reads accounts and
    // subscriptions — and distinct for the same reason, so a person cannot be
    // named twice.
    database
      .selectDistinct({
        id: customShellContacts.id,
        email: customShellContacts.email,
        firstName: customShellContacts.firstName,
        lastName: customShellContacts.lastName,
      })
      .from(customShellContacts)
      .leftJoin(
        customShellUsers,
        eq(customShellUsers.id, customShellContacts.userId)
      )
      .leftJoin(
        customShellSubscriptions,
        eq(customShellSubscriptions.userId, customShellContacts.userId)
      )
      .where(filter)
      .orderBy(asc(customShellContacts.email))
      .limit(AUDIENCE_SAMPLE_SIZE),
    audience.kind === "everyone"
      ? null
      : countAutomationAudience(
          { kind: "everyone", planSlug: "", segmentId: "", tag: "" },
          workspaceId,
          database,
          timestamp
        ),
  ])

  return {
    total,
    everyone: everyone ?? total,
    sample: sample.map((row) => ({
      id: row.id,
      email: row.email,
      name: [row.firstName, row.lastName]
        .filter((part) => part && part.trim())
        .join(" ")
        .trim(),
    })),
  }
}
