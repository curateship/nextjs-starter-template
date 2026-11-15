import {
  and,
  asc,
  countDistinct,
  eq,
  exists,
  gt,
  inArray,
  isNotNull,
  isNull,
  notInArray,
  or,
  type SQL,
} from "drizzle-orm"

import {
  AUDIENCE_LIST,
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
import { userBelongsToWorkspaceCondition } from "@/server/people/workspace-users"

/**
 * Who a flow is about, worked out fresh every single time.
 *
 * The flow stores the *choice* — everyone, confirmed members, paying members,
 * one plan, one segment — and never the people. That is the whole point of the
 * node: a member who cancelled yesterday is not in today's run, and nobody had
 * to remember to take them off a list.
 *
 * The answer comes from one of two lists that never mix (Tyler, 9 Nov 2026:
 * "users and subscribers are also seperate"). **Subscribers** ("everyone",
 * a segment) are the mailing list, read from `contacts`, where
 * "unsubscribed" lives. **Accounts** (every account, confirmed, paying, a
 * plan, a member tag) are read from `users` and emailed at their own
 * address; an account that turned automated mail off is never in one.
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

/** Which list a choice reads. */
function isAccountAudience(audience: AutomationAudience) {
  return AUDIENCE_LIST[audience.kind] === "accounts"
}

/** A subscriber audience's condition, over `contacts` alone. */
function subscriberCondition(audience: AutomationAudience, workspaceId: string, segmentFilter: SQL | null): SQL {
  const filters: SQL[] = [
    eq(customShellContacts.workspaceId, workspaceId),
    // Nobody who unsubscribed is ever in an audience, whatever the choice
    // says: that is the promise the unsubscribe link makes. Bounced and
    // complained addresses are out for the same reason. Somebody cold stays
    // in: they never asked to stop, and a message is how they stop being cold.
    inArray(customShellContacts.status, ["subscribed", "cold"]),
  ]
  if (audience.kind === "segment") {
    // A missing segment must never quietly widen into "everyone".
    if (!segmentFilter) throw new MissingAudienceSegmentError()
    filters.push(segmentFilter)
  }
  return and(...filters) as SQL
}

/**
 * An account audience's condition, over `users` joined to subscriptions by
 * the caller below.
 */
async function accountCondition(
  audience: AutomationAudience,
  workspaceId: string,
  planId: string | null,
  timestamp: Date,
  database: CustomShellDb
): Promise<SQL> {
  const filters: SQL[] = [
    await userBelongsToWorkspaceCondition(workspaceId, database),
    notInArray(customShellUsers.status, EXCLUDED_STATUSES),
    // Their own way out of automated mail (the account email's unsubscribe link).
    isNull(customShellUsers.automatedMailOffAt),
  ]

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
    // Without the plan this would silently become "every paying account", a far
    // bigger group than the flow asked for.
    if (!planId) throw new MissingAudiencePlanError(audience.planSlug)
    filters.push(eq(customShellSubscriptions.planId, planId))
  }

  if (audience.kind === "tag") {
    if (!audience.tag) {
      throw new Error("This audience step does not say which member tag to match.")
    }
    filters.push(
      exists(
        database
          .select({ userId: customShellMemberTags.userId })
          .from(customShellMemberTags)
          .where(
            and(
              eq(customShellMemberTags.userId, customShellUsers.id),
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
 * The segment a "segment" audience points at, refusing an id nothing answers:
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
 * One audience as a finished database condition, over the list it reads:
 * the plan and the segment looked up, and every rule folded in. The count, the
 * sample the inspector shows and the step that sends all read it, so the
 * number somebody was shown while building the flow is the number it works on.
 */
async function audienceFilter(
  audience: AutomationAudience,
  workspaceId: string,
  database: CustomShellDb,
  timestamp: Date,
  segment?: AudienceSegment | null
): Promise<SQL> {
  if (isAccountAudience(audience)) {
    const planId = await requireAudiencePlan(audience, database)
    return accountCondition(audience, workspaceId, planId, timestamp, database)
  }
  const audienceSegment = segment ?? (await requireAudienceSegment(audience, workspaceId, database))
  const segmentFilter = audienceSegment
    ? await segmentConditions(workspaceId, audienceSegment.definition, database, timestamp)
    : null
  return subscriberCondition(audience, workspaceId, segmentFilter)
}

/**
 * How many people a finished condition matches, on its list. Accounts are
 * joined to subscriptions to read the paying rules, and a join is free to
 * hand the same account back more than once, so it counts distinct people.
 */
async function countMatching(database: CustomShellDb, accounts: boolean, filter: SQL): Promise<number> {
  if (accounts) {
    const [row] = await database
      .select({ total: countDistinct(customShellUsers.id) })
      .from(customShellUsers)
      .leftJoin(customShellSubscriptions, eq(customShellSubscriptions.userId, customShellUsers.id))
      .where(filter)
    return row?.total ?? 0
  }
  const [row] = await database
    .select({ total: countDistinct(customShellContacts.id) })
    .from(customShellContacts)
    .where(filter)
  return row?.total ?? 0
}

/**
 * How many people match right now. A count rather than the rows, because that
 * is what a run records; the step that sends asks for the people themselves,
 * through the same condition, at the moment it sends.
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
    isAccountAudience(audience),
    await audienceFilter(audience, workspaceId, database, timestamp, segment)
  )
}

/**
 * Whether a test run's one person belongs to this audience right now: a
 * subscriber for a subscriber audience, an account for an account one.
 */
export async function personMatchesAutomationAudience(
  audience: AutomationAudience,
  workspaceId: string,
  person: { contactId: string | null; userId: string | null },
  database: CustomShellDb = db,
  timestamp: Date = now(),
  segment?: AudienceSegment | null
): Promise<boolean> {
  const accounts = isAccountAudience(audience)
  const filter = await audienceFilter(audience, workspaceId, database, timestamp, segment)
  if (accounts) {
    if (!person.userId) return false
    return (await countMatching(database, true, and(filter, eq(customShellUsers.id, person.userId)) as SQL)) > 0
  }
  if (!person.contactId) return false
  return (await countMatching(database, false, and(filter, eq(customShellContacts.id, person.contactId)) as SQL)) > 0
}

/**
 * One person a send-style automation step can act on: a subscriber
 * (`contactId`) or an account (`userId`), never both.
 */
export type AutomationRecipient = {
  contactId: string | null
  userId: string | null
  email: string
  firstName: string | null
  lastName: string | null
  /** An account's confirmation; null for a subscriber, who has none. */
  emailVerifiedAt: Date | null
  /** Where the next page starts: the row's own creation time and id. */
  createdAt: Date
  cursorId: string
}

/** An account's name split the way an email greeting wants it. */
export function splitAccountName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: null, lastName: null }
  return {
    firstName: parts[0],
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : null,
  }
}

/**
 * One bounded page of an audience, in a stable order. Send-style steps ask for
 * the next page after finishing the current one, so a large audience never
 * becomes one large array in server memory. An account's confirmation is
 * returned as a fact rather than folded into the condition: the caller counts
 * an unconfirmed account as skipped, not gone.
 */
export async function listAutomationAudience(
  audience: AutomationAudience,
  workspaceId: string,
  options: {
    limit: number
    after?: { createdAt: Date; id: string }
    timestamp?: Date
  },
  database: CustomShellDb = db
): Promise<AutomationRecipient[]> {
  const limit = Math.min(Math.max(options.limit, 1), 100)
  const filter = await audienceFilter(audience, workspaceId, database, options.timestamp ?? now())

  if (isAccountAudience(audience)) {
    const after = options.after
      ? or(
          gt(customShellUsers.createdAt, options.after.createdAt),
          and(eq(customShellUsers.createdAt, options.after.createdAt), gt(customShellUsers.id, options.after.id))
        )
      : undefined
    const rows = await database
      .selectDistinct({
        id: customShellUsers.id,
        email: customShellUsers.email,
        name: customShellUsers.name,
        emailVerifiedAt: customShellUsers.emailVerifiedAt,
        createdAt: customShellUsers.createdAt,
      })
      .from(customShellUsers)
      .leftJoin(customShellSubscriptions, eq(customShellSubscriptions.userId, customShellUsers.id))
      .where(and(filter, after))
      .orderBy(asc(customShellUsers.createdAt), asc(customShellUsers.id))
      .limit(limit)
    return rows.map((row) => ({
      contactId: null,
      userId: row.id,
      email: row.email,
      ...splitAccountName(row.name),
      emailVerifiedAt: row.emailVerifiedAt,
      createdAt: row.createdAt,
      cursorId: row.id,
    }))
  }

  const after = options.after
    ? or(
        gt(customShellContacts.createdAt, options.after.createdAt),
        and(eq(customShellContacts.createdAt, options.after.createdAt), gt(customShellContacts.id, options.after.id))
      )
    : undefined
  const rows = await database
    .select({
      id: customShellContacts.id,
      email: customShellContacts.email,
      firstName: customShellContacts.firstName,
      lastName: customShellContacts.lastName,
      createdAt: customShellContacts.createdAt,
    })
    .from(customShellContacts)
    .where(and(filter, after))
    .orderBy(asc(customShellContacts.createdAt), asc(customShellContacts.id))
    .limit(limit)
  return rows.map((row) => ({
    contactId: row.id,
    userId: null,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    emailVerifiedAt: null,
    createdAt: row.createdAt,
    cursorId: row.id,
  }))
}

/** One of the handful of people the inspector shows by name. */
export type AudienceSampleContact = {
  id: string
  email: string
  /** Their name when there is one, and "" when there is not. */
  name: string
}

/**
 * What the node's settings panel says about a choice while it is being built.
 * `total` is what a run would match if it went now, `everyone` is how many the
 * widest choice of the same list would reach, and `sample` is the first few by
 * email.
 */
export type AudiencePreview = {
  total: number
  everyone: number
  sample: AudienceSampleContact[]
}

/** How many people the panel names before it says "and n more". */
export const AUDIENCE_SAMPLE_SIZE = 5

/**
 * The count, the list's size and a few names: everything the inspector needs
 * to show the blast radius of a choice before anything runs. Bounded to a
 * handful of rows, so an audience of fifty thousand costs a count and five rows.
 */
export async function previewAutomationAudience(
  audience: AutomationAudience,
  workspaceId: string,
  database: CustomShellDb = db,
  timestamp: Date = now()
): Promise<AudiencePreview> {
  const accounts = isAccountAudience(audience)
  const widest: AutomationAudience = {
    kind: accounts ? "accounts" : "everyone",
    planSlug: "",
    segmentId: "",
    tag: "",
  }
  const filter = await audienceFilter(audience, workspaceId, database, timestamp)

  const sampleRows = accounts
    ? database
        .selectDistinct({ id: customShellUsers.id, email: customShellUsers.email, name: customShellUsers.name })
        .from(customShellUsers)
        .leftJoin(customShellSubscriptions, eq(customShellSubscriptions.userId, customShellUsers.id))
        .where(filter)
        .orderBy(asc(customShellUsers.email))
        .limit(AUDIENCE_SAMPLE_SIZE)
        .then((rows) => rows.map((row) => ({ id: row.id, email: row.email, name: row.name.trim() })))
    : database
        .select({
          id: customShellContacts.id,
          email: customShellContacts.email,
          firstName: customShellContacts.firstName,
          lastName: customShellContacts.lastName,
        })
        .from(customShellContacts)
        .where(filter)
        .orderBy(asc(customShellContacts.email))
        .limit(AUDIENCE_SAMPLE_SIZE)
        .then((rows) =>
          rows.map((row) => ({
            id: row.id,
            email: row.email,
            name: [row.firstName, row.lastName].filter((part) => part && part.trim()).join(" ").trim(),
          }))
        )

  const [total, sample, everyone] = await Promise.all([
    countMatching(database, accounts, filter),
    sampleRows,
    audience.kind === widest.kind ? null : countAutomationAudience(widest, workspaceId, database, timestamp),
  ])

  return { total, everyone: everyone ?? total, sample }
}
