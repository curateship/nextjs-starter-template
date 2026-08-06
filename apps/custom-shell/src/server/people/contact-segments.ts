import {
  and,
  arrayOverlaps,
  asc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  ne,
  not,
  notInArray,
  or,
  sql,
  type SQL,
} from "drizzle-orm"

import {
  parseSegmentRules,
  segmentConditionIsComplete,
  segmentReferences,
  type SegmentCondition,
  type SegmentKind,
  type SegmentRules,
} from "@/lib/contacts/contact-segments"
import { db, type CustomShellDb } from "@/server/db"
import { activeSubscriptionCondition } from "@/server/billing/entitlements"
import {
  customShellContactSegmentMembers,
  customShellContactSegments,
  customShellContacts,
  customShellPlans,
  customShellSubscriptions,
  type CustomShellContactSegment,
} from "@/server/schema"
import { now, uuid } from "@/server/auth/security"

/**
 * Everything about a saved segment that is not the UI.
 *
 * `segmentConditions` below is the one place that turns a segment into a
 * database condition. The count, the segment's own contact list and — later —
 * the send path all call it, so the number somebody was shown is the number
 * that gets emailed. A second copy of "what this segment means" is exactly how
 * a preview and a send end up disagreeing.
 */

/** A segment as the rest of this file wants it: rules already parsed. */
export type SegmentDefinition = {
  id: string
  kind: SegmentKind
  rules: SegmentRules
}

/** Turns a stored row into one, dropping any rule that no longer validates. */
export function readSegment(
  segment: Pick<CustomShellContactSegment, "id" | "kind" | "rules">
): SegmentDefinition {
  return {
    id: segment.id,
    kind: segment.kind === "static" ? "static" : "rules",
    rules: parseSegmentRules(segment.rules),
  }
}

/** Matches nobody. Used where a rule cannot be worked out and guessing would widen it. */
const MATCHES_NOBODY = sql`false`

/**
 * Everything a set of rules needs to look up, fetched once.
 *
 * Two trips, not two per rule. Every segment in the workspace is here so a
 * `notIn` can follow through to another segment's rules, and every plan's id is
 * here so a plan rule does not go back to the database for it. The production
 * database is not on the same machine as the app, so a round trip per rule per
 * segment is what turns a page into a wait.
 */
type SegmentContext = {
  segments: Map<string, SegmentDefinition>
  /** Plan id by slug. A slug that is missing is a plan that has been deleted. */
  planIds: Map<string, string>
}

async function loadSegmentContext(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<SegmentContext> {
  const [rows, plans] = await Promise.all([
    database
      .select({
        id: customShellContactSegments.id,
        kind: customShellContactSegments.kind,
        rules: customShellContactSegments.rules,
      })
      .from(customShellContactSegments)
      .where(eq(customShellContactSegments.workspaceId, workspaceId)),
    database
      .select({ id: customShellPlans.id, slug: customShellPlans.slug })
      .from(customShellPlans),
  ])

  return {
    segments: new Map(rows.map((row) => [row.id, readSegment(row)])),
    planIds: new Map(plans.map((plan) => [plan.slug, plan.id])),
  }
}

/**
 * One segment as a database condition over `contacts`.
 *
 * Always scoped to the workspace, and otherwise exactly what the segment says —
 * no more. In particular it does **not** quietly add "and still subscribed":
 * a segment counts what its rules say, so the number on the page is one anybody
 * can check by hand on the contacts list. New segments start with the "on the
 * list" rule as a visible row instead, and the send path keeps its own
 * subscribed-only rule regardless, so nobody who opted out is ever mailed.
 *
 * `index` is every segment in the workspace, which is how a `notIn` follows
 * through to another segment's rules. Callers that do not have one get it
 * built for them.
 */
export async function segmentConditions(
  workspaceId: string,
  segment: SegmentDefinition,
  database: CustomShellDb = db,
  timestamp: Date = now(),
  context?: SegmentContext
): Promise<SQL> {
  const loaded = context ?? (await loadSegmentContext(workspaceId, database))
  return buildConditions(workspaceId, segment, database, timestamp, loaded, [
    segment.id,
  ])
}

function buildConditions(
  workspaceId: string,
  segment: SegmentDefinition,
  database: CustomShellDb,
  timestamp: Date,
  context: SegmentContext,
  /** The chain of segments followed to get here, so a loop cannot spin. */
  trail: string[]
): SQL {
  const filters: SQL[] = [eq(customShellContacts.workspaceId, workspaceId)]

  if (segment.kind === "static") {
    // Hand-picked: the people themselves, and nothing else to work out.
    filters.push(
      inArray(
        customShellContacts.id,
        database
          .select({ id: customShellContactSegmentMembers.contactId })
          .from(customShellContactSegmentMembers)
          .where(eq(customShellContactSegmentMembers.segmentId, segment.id))
      )
    )
    return and(...filters) as SQL
  }

  for (const condition of segment.rules.conditions) {
    filters.push(
      conditionSql(workspaceId, condition, database, timestamp, context, trail)
    )
  }

  return and(...filters) as SQL
}

function conditionSql(
  workspaceId: string,
  condition: SegmentCondition,
  database: CustomShellDb,
  timestamp: Date,
  context: SegmentContext,
  trail: string[]
): SQL {
  // A half-finished rule — an empty tag list, a blank plan — is refused when it
  // is saved. One that reached the database anyway must not silently drop out,
  // because dropping out widens the segment.
  if (!segmentConditionIsComplete(condition)) return MATCHES_NOBODY

  switch (condition.type) {
    case "tag": {
      const overlaps = arrayOverlaps(customShellContacts.tags, condition.tags)
      return condition.operator === "includes" ? overlaps : not(overlaps)
    }

    case "status":
      return condition.operator === "is"
        ? eq(customShellContacts.status, condition.status)
        : ne(customShellContacts.status, condition.status)

    case "source":
      return condition.operator === "is"
        ? eq(customShellContacts.source, condition.source)
        : // Somebody with no source recorded did not come from anywhere in
          // particular, so they belong in "did not come from X". Without the
          // null arm they would fall out of both answers.
          (or(
            isNull(customShellContacts.source),
            ne(customShellContacts.source, condition.source)
          ) as SQL)

    case "joined": {
      const cutoff = new Date(
        timestamp.getTime() - condition.days * 24 * 60 * 60 * 1000
      )
      return condition.operator === "within"
        ? gte(customShellContacts.createdAt, cutoff)
        : lt(customShellContacts.createdAt, cutoff)
    }

    case "account":
      return condition.operator === "has"
        ? isNotNull(customShellContacts.userId)
        : isNull(customShellContacts.userId)

    case "plan": {
      const planId = context.planIds.get(condition.planSlug)

      // The plan named here has been deleted, so this rule cannot be worked
      // out. It matches nobody either way round — including for "isn't", where
      // the honest-looking answer ("well, nobody is on it, so everybody") would
      // hand a newsletter the whole contact list.
      if (!planId) return MATCHES_NOBODY

      const onThePlan = database
        .select({ userId: customShellSubscriptions.userId })
        .from(customShellSubscriptions)
        .where(
          and(
            eq(customShellSubscriptions.planId, planId),
            activeSubscriptionCondition(timestamp)
          )
        )

      return condition.operator === "is"
        ? (and(
            isNotNull(customShellContacts.userId),
            inArray(customShellContacts.userId, onThePlan)
          ) as SQL)
        : // Somebody with no account is certainly not on the plan, and `not in`
          // alone would leave them out — comparing null to anything is null.
          (or(
            isNull(customShellContacts.userId),
            notInArray(customShellContacts.userId, onThePlan)
          ) as SQL)
    }

    case "notIn": {
      const excluded: SQL[] = []
      for (const otherId of condition.segmentIds) {
        // A loop is refused when a segment is saved, so this cannot normally
        // happen. It is here so a row edited straight in the database makes the
        // segment match nobody rather than making the server spin forever.
        if (trail.includes(otherId)) return MATCHES_NOBODY

        const other = context.segments.get(otherId)
        // Deleting a segment something points at is refused, so this cannot
        // normally happen either. Same rule: refuse to guess.
        if (!other) return MATCHES_NOBODY

        excluded.push(
          notInArray(
            customShellContacts.id,
            database
              .select({ id: customShellContacts.id })
              .from(customShellContacts)
              .where(
                buildConditions(
                  workspaceId,
                  other,
                  database,
                  timestamp,
                  context,
                  [...trail, otherId]
                )
              )
          )
        )
      }
      return and(...excluded) as SQL
    }
  }
}

/** How many contacts are in one segment right now. */
export async function countSegmentContacts(
  workspaceId: string,
  segment: SegmentDefinition,
  database: CustomShellDb = db,
  timestamp: Date = now(),
  context?: SegmentContext
): Promise<number> {
  const [row] = await database
    .select({ total: sql<number>`count(*)::int` })
    .from(customShellContacts)
    .where(
      await segmentConditions(workspaceId, segment, database, timestamp, context)
    )
  return row?.total ?? 0
}

/** The people in one segment, worked out the same way the count was. */
export async function listSegmentContacts(
  workspaceId: string,
  segment: SegmentDefinition,
  options: { limit?: number; offset?: number } = {},
  database: CustomShellDb = db,
  timestamp: Date = now()
) {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200)
  const offset = Math.max(options.offset ?? 0, 0)

  return database
    .select({
      id: customShellContacts.id,
      email: customShellContacts.email,
      firstName: customShellContacts.firstName,
      lastName: customShellContacts.lastName,
      status: customShellContacts.status,
    })
    .from(customShellContacts)
    .where(await segmentConditions(workspaceId, segment, database, timestamp))
    .orderBy(asc(customShellContacts.email), asc(customShellContacts.id))
    .limit(limit)
    .offset(offset)
}

export type SegmentListItem = {
  segment: CustomShellContactSegment
  rules: SegmentRules
  total: number
}

/**
 * Every segment in the workspace with how many people are in each.
 *
 * The whole list rather than a page of it, because the page sorts by that count
 * and rows cannot be ordered by a number the server has not worked out yet.
 *
 * All the counts come back in **one** query — one `count(… ) filter (where …)`
 * per segment over a single pass of the contacts table. A query each would be a
 * round trip each, and the database is not on the same machine as the app.
 */
export async function listWorkspaceSegments(
  workspaceId: string,
  database: CustomShellDb = db,
  timestamp: Date = now()
): Promise<SegmentListItem[]> {
  const [rows, context] = await Promise.all([
    database
      .select()
      .from(customShellContactSegments)
      .where(eq(customShellContactSegments.workspaceId, workspaceId))
      .orderBy(asc(customShellContactSegments.name)),
    loadSegmentContext(workspaceId, database),
  ])

  if (rows.length === 0) return []

  const definitions = rows.map(
    (row) => context.segments.get(row.id) ?? readSegment(row)
  )

  const columns: Record<string, SQL<number>> = {}
  for (const [index, definition] of definitions.entries()) {
    const conditions = buildConditions(
      workspaceId,
      definition,
      database,
      timestamp,
      context,
      [definition.id]
    )
    columns[`total${index}`] = sql<number>`count(*) filter (where ${conditions})::int`
  }

  // Scoped out here as well as inside every `filter`, so the index does the
  // work instead of the pass reading every workspace's contacts and then
  // throwing the other workspaces away one count at a time.
  const [totals] = await database
    .select(columns)
    .from(customShellContacts)
    .where(eq(customShellContacts.workspaceId, workspaceId))

  return rows.map((row, index) => ({
    segment: row,
    rules: definitions[index].rules,
    total: totals?.[`total${index}`] ?? 0,
  }))
}

async function getWorkspaceSegment(
  workspaceId: string,
  segmentId: string,
  database: CustomShellDb = db
): Promise<CustomShellContactSegment | null> {
  const [row] = await database
    .select()
    .from(customShellContactSegments)
    .where(
      and(
        eq(customShellContactSegments.workspaceId, workspaceId),
        eq(customShellContactSegments.id, segmentId)
      )
    )
    .limit(1)
  return row ?? null
}

/** The contacts hand-picked into one segment, for the window that edits it. */
export async function listSegmentMembers(
  workspaceId: string,
  segmentId: string,
  database: CustomShellDb = db
) {
  return database
    .select({
      id: customShellContacts.id,
      email: customShellContacts.email,
    })
    .from(customShellContactSegmentMembers)
    .innerJoin(
      customShellContacts,
      eq(customShellContacts.id, customShellContactSegmentMembers.contactId)
    )
    .where(
      and(
        eq(customShellContactSegmentMembers.segmentId, segmentId),
        // The join is what scopes this to the workspace: a member row can only
        // point at a contact, and a contact belongs to exactly one workspace.
        eq(customShellContacts.workspaceId, workspaceId)
      )
    )
    .orderBy(asc(customShellContacts.email))
}

/** Every "where they came from" in use, so the builder can offer real ones. */
export async function listWorkspaceContactSources(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<string[]> {
  const rows = await database
    .selectDistinct({ source: customShellContacts.source })
    .from(customShellContacts)
    .where(
      and(
        eq(customShellContacts.workspaceId, workspaceId),
        isNotNull(customShellContacts.source)
      )
    )
  return rows
    .map((row) => row.source)
    .filter((source): source is string => Boolean(source))
    .sort((a, b) => a.localeCompare(b))
}

export type SegmentInput = {
  name: string
  description: string
  kind: SegmentKind
  rules: SegmentRules
  /** Only read for a hand-picked segment; ignored for a rules one. */
  contactIds: string[]
}

/**
 * Everything that has to be true before a segment is saved.
 *
 * All of it refuses out loud rather than fixing the input quietly. A segment
 * decides who gets an email, and the failure nobody can take back is one that
 * sends to more people than the writer meant.
 */
async function validateSegment(
  workspaceId: string,
  input: SegmentInput,
  segmentId: string | null,
  database: CustomShellDb
) {
  const name = input.name.trim()
  if (!name) throw new Error("SEGMENT_NAME_REQUIRED")

  const [clash] = await database
    .select({ id: customShellContactSegments.id })
    .from(customShellContactSegments)
    .where(
      and(
        eq(customShellContactSegments.workspaceId, workspaceId),
        sql`lower(${customShellContactSegments.name}) = ${name.toLowerCase()}`
      )
    )
    .limit(1)
  if (clash && clash.id !== segmentId) throw new Error("SEGMENT_NAME_TAKEN")

  if (input.kind === "static") {
    // Deliberately allowed to be empty. A hand-picked segment is often made
    // first and filled from the contacts list afterwards, by ticking people and
    // choosing it in the toolbar — refusing an empty one would make that the
    // long way round.
    if (input.contactIds.length === 0) return { name, contactIds: [] }

    const known = await database
      .select({ id: customShellContacts.id })
      .from(customShellContacts)
      .where(
        and(
          eq(customShellContacts.workspaceId, workspaceId),
          inArray(customShellContacts.id, input.contactIds)
        )
      )
    if (known.length !== new Set(input.contactIds).size) {
      throw new Error("SEGMENT_CONTACT_MISSING")
    }
    return { name, contactIds: [...new Set(input.contactIds)] }
  }

  for (const condition of input.rules.conditions) {
    if (!segmentConditionIsComplete(condition)) {
      throw new Error("SEGMENT_RULE_INCOMPLETE")
    }
    if (condition.type === "plan") {
      const [plan] = await database
        .select({ id: customShellPlans.id })
        .from(customShellPlans)
        .where(eq(customShellPlans.slug, condition.planSlug))
        .limit(1)
      if (!plan) throw new Error("SEGMENT_PLAN_MISSING")
    }
  }

  await checkForLoop(workspaceId, input.rules, segmentId, database)
  return { name, contactIds: [] as string[] }
}

/**
 * Refuses a "not in" that points at this segment, directly or round a loop.
 *
 * Two segments that exclude each other have no answer — working out who is in
 * one needs the answer to the other first, forever. It is caught here, at the
 * save, because that is the only moment somebody is looking at the rule they
 * just wrote.
 */
async function checkForLoop(
  workspaceId: string,
  rules: SegmentRules,
  segmentId: string | null,
  database: CustomShellDb
) {
  const references = segmentReferences(rules)
  if (references.length === 0) return

  const rows = await database
    .select({
      id: customShellContactSegments.id,
      rules: customShellContactSegments.rules,
    })
    .from(customShellContactSegments)
    .where(eq(customShellContactSegments.workspaceId, workspaceId))

  const known = new Set(rows.map((row) => row.id))
  for (const reference of references) {
    if (!known.has(reference)) throw new Error("SEGMENT_REFERENCE_MISSING")
    // The plainest loop of all, and the one somebody actually clicks by
    // accident.
    if (reference === segmentId) throw new Error("SEGMENT_LOOP")
  }

  // The graph as it would be once this save lands, so the walk below sees the
  // rules being written rather than the ones already stored.
  const edges = new Map<string, string[]>(
    rows.map((row) => [row.id, segmentReferences(parseSegmentRules(row.rules))])
  )
  if (segmentId) edges.set(segmentId, references)

  const visited = new Set<string>()
  const queue = [...references]
  while (queue.length) {
    const next = queue.shift() as string
    if (segmentId && next === segmentId) throw new Error("SEGMENT_LOOP")
    if (visited.has(next)) continue
    visited.add(next)
    queue.push(...(edges.get(next) ?? []))
  }
}

export async function createWorkspaceSegment(
  workspaceId: string,
  input: SegmentInput,
  database: CustomShellDb = db
): Promise<CustomShellContactSegment> {
  const { name, contactIds } = await validateSegment(
    workspaceId,
    input,
    null,
    database
  )

  const timestamp = now()
  const [created] = await database
    .insert(customShellContactSegments)
    .values({
      id: uuid(),
      workspaceId,
      name,
      description: input.description.trim(),
      kind: input.kind,
      rules: input.kind === "static" ? { conditions: [] } : input.rules,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning()

  if (!created) throw new Error("SEGMENT_SAVE_FAILED")
  await replaceMembers(created.id, contactIds, database)
  return created
}

export async function updateWorkspaceSegment(
  workspaceId: string,
  segmentId: string,
  input: SegmentInput,
  database: CustomShellDb = db
): Promise<CustomShellContactSegment> {
  const existing = await getWorkspaceSegment(workspaceId, segmentId, database)
  if (!existing) throw new Error("SEGMENT_NOT_FOUND")

  const { name, contactIds } = await validateSegment(
    workspaceId,
    input,
    segmentId,
    database
  )

  const [updated] = await database
    .update(customShellContactSegments)
    .set({
      name,
      description: input.description.trim(),
      kind: input.kind,
      rules: input.kind === "static" ? { conditions: [] } : input.rules,
      updatedAt: now(),
    })
    .where(eq(customShellContactSegments.id, segmentId))
    .returning()

  if (!updated) throw new Error("SEGMENT_SAVE_FAILED")
  // A segment switched from hand-picked to rules drops its people; the other
  // way round it gains the ones just picked. Either way the table matches the
  // kind, so a leftover row can never quietly rejoin the segment later.
  await replaceMembers(segmentId, contactIds, database)
  return updated
}

async function replaceMembers(
  segmentId: string,
  contactIds: string[],
  database: CustomShellDb
) {
  await database
    .delete(customShellContactSegmentMembers)
    .where(eq(customShellContactSegmentMembers.segmentId, segmentId))

  if (contactIds.length === 0) return

  const timestamp = now()
  await database.insert(customShellContactSegmentMembers).values(
    contactIds.map((contactId) => ({
      segmentId,
      contactId,
      createdAt: timestamp,
    }))
  )
}

/**
 * Every segment's name and kind — enough for the contacts list to offer them in
 * a "not in…" rule and to say which ones people can be added to by hand.
 *
 * The kind comes along because the two uses want different halves of the list
 * and one query beats two: any segment can be left out of a rule, but only a
 * hand-picked one can have people put into it.
 */
export async function listSegmentNames(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<{ id: string; name: string; kind: SegmentKind }[]> {
  const rows = await database
    .select({
      id: customShellContactSegments.id,
      name: customShellContactSegments.name,
      kind: customShellContactSegments.kind,
    })
    .from(customShellContactSegments)
    .where(eq(customShellContactSegments.workspaceId, workspaceId))
    .orderBy(asc(customShellContactSegments.name))

  return rows.map((row) => ({
    ...row,
    kind: row.kind === "static" ? "static" : "rules",
  }))
}

/**
 * Puts people into a hand-picked segment from wherever they were selected.
 *
 * Says what it actually did rather than "done": somebody already in the segment
 * is counted separately instead of being reported as added, because "5 people
 * added" when three of them were already there is the kind of small lie that
 * makes a number nobody trusts. Adding the same person twice is impossible —
 * the pair is the table's primary key, and a repeat is simply not inserted.
 */
export async function addContactsToSegment(
  workspaceId: string,
  segmentId: string,
  contactIds: string[],
  database: CustomShellDb = db
): Promise<{ added: number; alreadyThere: number }> {
  const segment = await getWorkspaceSegment(workspaceId, segmentId, database)
  if (!segment) throw new Error("SEGMENT_NOT_FOUND")
  if (segment.kind !== "static") throw new Error("SEGMENT_IS_RULES")
  if (contactIds.length === 0) return { added: 0, alreadyThere: 0 }

  // Scoped to the workspace here, so an id from somewhere else is simply not
  // among the people found rather than being trusted and inserted.
  const theirs = await database
    .select({ id: customShellContacts.id })
    .from(customShellContacts)
    .where(
      and(
        eq(customShellContacts.workspaceId, workspaceId),
        inArray(customShellContacts.id, contactIds)
      )
    )
  if (theirs.length === 0) throw new Error("SEGMENT_CONTACT_MISSING")

  const timestamp = now()
  const inserted = await database
    .insert(customShellContactSegmentMembers)
    .values(
      theirs.map((contact) => ({
        segmentId,
        contactId: contact.id,
        createdAt: timestamp,
      }))
    )
    .onConflictDoNothing()
    .returning({ contactId: customShellContactSegmentMembers.contactId })

  return {
    added: inserted.length,
    alreadyThere: theirs.length - inserted.length,
  }
}

export type SegmentDeleteResult = {
  deleted: string[]
  /** The ones that stayed, and the segments that are still pointing at them. */
  blocked: { id: string; name: string; usedBy: string[] }[]
}

/**
 * Deletes segments, refusing any that something else is still pointing at.
 *
 * Never quietly, and never leaving a rule pointing at nothing: "the segment
 * vanished" reads as "send to everyone", and that is the one mistake that
 * cannot be taken back.
 *
 * Deleting A and B together where A excludes B is fine — nothing is left
 * pointing at anything — so only the segments that survive this call count as
 * users.
 */
export async function deleteWorkspaceSegments(
  workspaceId: string,
  segmentIds: string[],
  database: CustomShellDb = db
): Promise<SegmentDeleteResult> {
  if (segmentIds.length === 0) return { deleted: [], blocked: [] }

  const rows = await database
    .select({
      id: customShellContactSegments.id,
      name: customShellContactSegments.name,
      rules: customShellContactSegments.rules,
    })
    .from(customShellContactSegments)
    .where(eq(customShellContactSegments.workspaceId, workspaceId))

  const asked = new Set(segmentIds)
  const targets = rows.filter((row) => asked.has(row.id))
  const survivors = rows.filter((row) => !asked.has(row.id))

  const usedBy = new Map<string, string[]>()
  for (const survivor of survivors) {
    for (const reference of segmentReferences(parseSegmentRules(survivor.rules))) {
      if (!asked.has(reference)) continue
      usedBy.set(reference, [...(usedBy.get(reference) ?? []), survivor.name])
    }
  }

  const blocked = targets
    .filter((row) => usedBy.has(row.id))
    .map((row) => ({
      id: row.id,
      name: row.name,
      usedBy: usedBy.get(row.id) ?? [],
    }))

  const removable = targets
    .filter((row) => !usedBy.has(row.id))
    .map((row) => row.id)

  if (removable.length === 0) return { deleted: [], blocked }

  const deleted = await database
    .delete(customShellContactSegments)
    .where(
      and(
        eq(customShellContactSegments.workspaceId, workspaceId),
        inArray(customShellContactSegments.id, removable)
      )
    )
    .returning({ id: customShellContactSegments.id })

  return { deleted: deleted.map((row) => row.id), blocked }
}
