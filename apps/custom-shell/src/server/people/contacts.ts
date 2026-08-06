import { and, asc, desc, eq, ilike, inArray, ne, or, sql } from "drizzle-orm"

import type { SegmentRules } from "@/lib/contacts/contact-segments"
import type { ContactSortColumn } from "@/lib/contacts/contact-sort"
import { segmentConditions } from "@/server/people/contact-segments"
import { db, type CustomShellDb } from "@/server/db"
import {
  customShellContacts,
  customShellUsers,
  type CustomShellContact,
} from "@/server/schema"
import { now, uuid } from "@/server/auth/security"

/** The tags the sync owns. Anything else on a contact was added by hand. */
const ROLE_TAGS = ["admin", "member"] as const

/** An account's name split the way an email greeting wants it. */
function splitName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return { firstName: null, lastName: null }
  return {
    firstName: parts[0],
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : null,
  }
}

/**
 * Makes the contacts list match the accounts on the app.
 *
 * Every account that is not on its way out gets a contact, and one that is
 * already there has its address, name and role tag brought back into line —
 * the account is the truth about all three, so somebody changing their email
 * does not leave the newsletter mailing the old one.
 *
 * Two things it deliberately will not touch:
 *
 * - **Tags somebody added by hand.** Only the role tag is the sync's to own, so
 *   a contact tagged "beta" keeps it forever.
 * - **Whether they are subscribed.** Somebody who unsubscribed stays
 *   unsubscribed. Putting them back because they still have an account is
 *   exactly the thing an unsubscribe link is promising will not happen.
 */
export async function syncContactsFromUsers(
  workspaceId: string,
  database: CustomShellDb = db
) {
  const users = await database
    .select({
      id: customShellUsers.id,
      email: customShellUsers.email,
      name: customShellUsers.name,
      role: customShellUsers.role,
    })
    .from(customShellUsers)
    // Somebody on their way out is not somebody to email.
    .where(ne(customShellUsers.status, "pending_deletion"))

  if (users.length === 0) return { added: 0, updated: 0 }

  const existing = await database
    .select()
    .from(customShellContacts)
    .where(eq(customShellContacts.workspaceId, workspaceId))

  const byUser = new Map(
    existing.filter((row) => row.userId).map((row) => [row.userId, row])
  )
  const byEmail = new Map(
    existing.map((row) => [row.email.trim().toLowerCase(), row])
  )

  const timestamp = now()
  // Gathered first, written in one statement. This runs on every contacts page
  // load and before every send batch, so a query per account would be hundreds
  // of round trips to say "nothing changed".
  const missing: (typeof customShellContacts.$inferInsert)[] = []
  const drifted: {
    id: string
    userId: string
    email: string
    firstName: string | null
    lastName: string | null
    tags: string[]
  }[] = []

  for (const user of users) {
    const email = user.email.trim().toLowerCase()
    const { firstName, lastName } = splitName(user.name)
    const roleTag = ROLE_TAGS.includes(user.role as (typeof ROLE_TAGS)[number])
      ? user.role
      : "member"

    // An address added by hand before its owner had an account, or before this
    // ran, is adopted rather than duplicated.
    const row = byUser.get(user.id) ?? byEmail.get(email)

    if (!row) {
      missing.push({
        id: uuid(),
        workspaceId,
        userId: user.id,
        email,
        firstName,
        lastName,
        tags: [roleTag],
        source: "Account",
        status: "subscribed",
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      continue
    }

    // Its own role tag, plus every tag somebody put there themselves.
    const tags = [
      roleTag,
      ...row.tags.filter(
        (tag) => !ROLE_TAGS.includes(tag as (typeof ROLE_TAGS)[number])
      ),
    ]
    const same =
      row.userId === user.id &&
      row.email === email &&
      row.firstName === firstName &&
      row.lastName === lastName &&
      row.tags.length === tags.length &&
      row.tags.every((tag, index) => tag === tags[index])
    if (same) continue

    drifted.push({
      id: row.id,
      userId: user.id,
      email,
      firstName,
      lastName,
      tags,
    })
  }

  if (missing.length) {
    await database
      .insert(customShellContacts)
      .values(missing)
      // Two requests can run this at once; whichever loses simply does nothing
      // rather than failing the page that asked.
      .onConflictDoNothing()
  }

  // Usually empty — an account only drifts when somebody changes their name,
  // address or role — so this costs nothing on the common pass.
  for (const row of drifted) {
    await database
      .update(customShellContacts)
      .set({
        userId: row.userId,
        email: row.email,
        firstName: row.firstName,
        lastName: row.lastName,
        tags: row.tags,
        updatedAt: timestamp,
      })
      .where(eq(customShellContacts.id, row.id))
  }

  return { added: missing.length, updated: drifted.length }
}

/** Tidies a tag list: trimmed, no blanks, no repeats, and capped. */
function cleanTags(tags: string[]): string[] {
  const seen = new Set<string>()
  for (const tag of tags) {
    const trimmed = tag.trim().slice(0, 100)
    if (trimmed) seen.add(trimmed)
    if (seen.size >= 25) break
  }
  return [...seen]
}

export async function listWorkspaceContacts(
  workspaceId: string,
  options: {
    search?: string
    /**
     * The list's filters, written in exactly the same rules a segment is.
     * One description of "who these people are" for the whole app, so the list
     * you filtered down to and a segment you save from it cannot mean two
     * different things — see `segmentConditions`.
     */
    rules?: SegmentRules
    sort?: ContactSortColumn
    direction?: "asc" | "desc"
    limit?: number
    offset?: number
  } = {},
  database: CustomShellDb = db
) {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200)
  const offset = Math.max(options.offset ?? 0, 0)
  const search = options.search?.trim()

  const filters = [eq(customShellContacts.workspaceId, workspaceId)]
  if (search) {
    const pattern = `%${search}%`
    const searchFilter = or(
      ilike(customShellContacts.email, pattern),
      ilike(customShellContacts.firstName, pattern),
      ilike(customShellContacts.lastName, pattern)
    )
    if (searchFilter) filters.push(searchFilter)
  }
  if (options.rules?.conditions.length) {
    filters.push(
      await segmentConditions(
        workspaceId,
        // Not a saved segment — a draft one, standing in for the filters on
        // screen. The id is only there for the loop guard to hold on to.
        { id: "contacts-filter", kind: "rules", rules: options.rules },
        database
      )
    )
  }
  const where = and(...filters)

  // Ordered here rather than in the browser, because the page only ever holds
  // one page of contacts — sorting what has already arrived would only shuffle
  // those rows and leave the rest of the list where it was.
  const order = options.direction === "asc" ? asc : desc
  const column = {
    email: customShellContacts.email,
    name: customShellContacts.firstName,
    status: customShellContacts.status,
    created: customShellContacts.createdAt,
  }[options.sort ?? "created"]

  const [rows, [countRow]] = await Promise.all([
    database
      .select()
      .from(customShellContacts)
      .where(where)
      // The id breaks ties, so a page boundary cannot land mid-tie and show
      // the same person twice or skip one entirely.
      .orderBy(order(column), asc(customShellContacts.id))
      .limit(limit)
      .offset(offset),
    database
      .select({ total: sql<number>`count(*)::int` })
      .from(customShellContacts)
      .where(where),
  ])

  return { contacts: rows, total: countRow?.total ?? 0 }
}

/** Every tag in use in this workspace, so the picker can offer real ones. */
export async function listWorkspaceTags(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<string[]> {
  const rows = await database
    .select({ tag: sql<string>`distinct unnest(${customShellContacts.tags})` })
    .from(customShellContacts)
    .where(eq(customShellContacts.workspaceId, workspaceId))
  return rows.map((row) => row.tag).sort((a, b) => a.localeCompare(b))
}

/**
 * Adds somebody, or updates them if that address is already on the list.
 *
 * Matching is case-insensitive and handled by the unique index, so two people
 * signing up as Ada@x.dev and ada@x.dev end up as one contact rather than two
 * who each get their own copy of every newsletter.
 */
export async function upsertWorkspaceContact(
  workspaceId: string,
  input: {
    email: string
    firstName?: string | null
    lastName?: string | null
    tags?: string[]
    source?: string | null
  },
  database: CustomShellDb = db
): Promise<CustomShellContact> {
  const email = input.email.trim().toLowerCase()
  if (!email) throw new Error("EMAIL_REQUIRED")

  const [existing] = await database
    .select()
    .from(customShellContacts)
    .where(
      and(
        eq(customShellContacts.workspaceId, workspaceId),
        sql`lower(${customShellContacts.email}) = ${email}`
      )
    )
    .limit(1)

  const timestamp = now()
  if (existing) {
    const [updated] = await database
      .update(customShellContacts)
      .set({
        firstName: input.firstName ?? existing.firstName,
        lastName: input.lastName ?? existing.lastName,
        tags: input.tags ? cleanTags(input.tags) : existing.tags,
        updatedAt: timestamp,
      })
      .where(eq(customShellContacts.id, existing.id))
      .returning()
    if (!updated) throw new Error("SAVE_FAILED")
    return updated
  }

  const [created] = await database
    .insert(customShellContacts)
    .values({
      id: uuid(),
      workspaceId,
      email,
      firstName: input.firstName ?? null,
      lastName: input.lastName ?? null,
      tags: cleanTags(input.tags ?? []),
      source: input.source ?? null,
      status: "subscribed",
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning()

  if (!created) throw new Error("SAVE_FAILED")
  return created
}

export async function setContactStatus(
  workspaceId: string,
  contactIds: string[],
  status: "subscribed" | "unsubscribed",
  database: CustomShellDb = db
) {
  if (contactIds.length === 0) return 0
  const timestamp = now()
  const updated = await database
    .update(customShellContacts)
    .set({
      status,
      unsubscribedAt: status === "unsubscribed" ? timestamp : null,
      updatedAt: timestamp,
    })
    .where(
      and(
        eq(customShellContacts.workspaceId, workspaceId),
        inArray(customShellContacts.id, contactIds)
      )
    )
    .returning({ id: customShellContacts.id })
  return updated.length
}

export async function deleteWorkspaceContacts(
  workspaceId: string,
  contactIds: string[],
  database: CustomShellDb = db
) {
  if (contactIds.length === 0) return 0
  const deleted = await database
    .delete(customShellContacts)
    .where(
      and(
        eq(customShellContacts.workspaceId, workspaceId),
        inArray(customShellContacts.id, contactIds)
      )
    )
    .returning({ id: customShellContacts.id })
  return deleted.length
}
