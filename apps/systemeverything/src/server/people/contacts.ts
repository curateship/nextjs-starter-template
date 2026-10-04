import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm"

import type { ContactSortColumn } from "@/lib/contacts/contact-sort"
import {
  contactFilterConditions,
  type ContactListFilter,
} from "@/server/people/contact-segments"
import { userBelongsToWorkspaceCondition } from "@/server/people/workspace-users"
import { db, type CustomShellDb } from "@/server/db"
import {
  customShellContacts,
  customShellDeliveries,
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
 * Makes a site's contacts list match **that site's** people.
 *
 * Every account belonging to this site that is not on its way out gets a
 * contact, and one that is already there has its address, name and role tag
 * brought back into line — the account is the truth about all three, so
 * somebody changing their email does not leave the newsletter mailing the old
 * one.
 *
 * **It used to take every account on the deployment.** With one site that was
 * merely surprising; with several it copied the whole user table into each
 * one's list, so Alpha's newsletter went to Beta's customers. That is a leak
 * between customers, and it is the reason this function's shape changed.
 *
 * Belonging is the same rule the rest of the shell uses: the site somebody is
 * pointed at, which sign-in sets from the domain they arrived on. Somebody
 * pointed nowhere belongs to the deployment's only site — on an app with one
 * site that is everybody, which is exactly how this behaved before.
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
    .where(
      and(
        // Somebody on their way out is not somebody to email.
        ne(customShellUsers.status, "pending_deletion"),
        await userBelongsToWorkspaceCondition(workspaceId, database)
      )
    )

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
  /**
   * The search box and the filter rules, plus how to order and page them. The
   * filters are written in exactly the same rules a segment is, so the list you
   * filtered down to and a segment you save from it cannot mean two different
   * things — see `contactFilterConditions`.
   */
  options: ContactListFilter & {
    sort?: ContactSortColumn
    direction?: "asc" | "desc"
    limit?: number
    offset?: number
  } = {},
  database: CustomShellDb = db
) {
  const limit = Math.min(Math.max(options.limit ?? 50, 1), 200)
  const offset = Math.max(options.offset ?? 0, 0)
  const where = await contactFilterConditions(workspaceId, options, database)

  // When each person was last sent anything, worked out once for the whole
  // workspace and joined on. One grouped pass over `deliveries`, not a little
  // subquery per row — a row-at-a-time version costs one lookup per contact on
  // screen, on a database that is not on this machine.
  //
  // The count beside it deliberately does not join: how many people match the
  // filters has nothing to do with what was sent to them.
  const lastEmailed = database
    .select({
      contactId: customShellDeliveries.contactId,
      // `mapWith` is what turns the driver's raw timestamp back into a Date.
      // A hand-written expression gets none of the column's own conversion, so
      // without it this arrives as a string and every caller that treats it as
      // a date throws — which is exactly what happens next, in the API layer.
      at: sql<Date | null>`max(${customShellDeliveries.createdAt})`
        .mapWith(customShellDeliveries.createdAt)
        .as("last_emailed_at"),
    })
    .from(customShellDeliveries)
    .where(eq(customShellDeliveries.workspaceId, workspaceId))
    .groupBy(customShellDeliveries.contactId)
    .as("last_emailed")

  /**
   * Ordered here rather than in the browser, because the page only ever holds
   * one page of contacts — sorting what has already arrived would only shuffle
   * those rows and leave the rest of the list where it was.
   *
   * "Last emailed" is the one column that is not a column, so it is its own
   * branch rather than an entry in the map below.
   *
   * Never emailed sorts with the oldest, both ways round: somebody who has
   * never been sent anything is the most stale person on the list, so they
   * belong at the same end as the longest-ago date — first when the oldest are
   * first, last when the newest are. Postgres does the opposite by default
   * (nulls last ascending, first descending), so both directions say where the
   * nulls go rather than leaving it to a default that reads as a bug.
   */
  const ascending = options.direction === "asc"
  const orderBy =
    options.sort === "emailed"
      ? ascending
        ? sql`${lastEmailed.at} asc nulls first`
        : sql`${lastEmailed.at} desc nulls last`
      : (ascending ? asc : desc)(
          {
            email: customShellContacts.email,
            name: customShellContacts.firstName,
            status: customShellContacts.status,
            created: customShellContacts.createdAt,
          }[options.sort ?? "created"]
        )

  const [rows, [countRow]] = await Promise.all([
    database
      .select({ contact: customShellContacts, lastEmailedAt: lastEmailed.at })
      .from(customShellContacts)
      // Left, not inner: somebody who has never been emailed is still on the
      // list, with nothing in this column.
      .leftJoin(lastEmailed, eq(lastEmailed.contactId, customShellContacts.id))
      .where(where)
      // The id breaks ties, so a page boundary cannot land mid-tie and show
      // the same person twice or skip one entirely.
      .orderBy(orderBy, asc(customShellContacts.id))
      .limit(limit)
      .offset(offset),
    database
      .select({ total: sql<number>`count(*)::int` })
      .from(customShellContacts)
      .where(where),
  ])

  return {
    contacts: rows.map((row) => ({
      ...row.contact,
      lastEmailedAt: row.lastEmailedAt,
    })),
    total: countRow?.total ?? 0,
  }
}

/** One contact, or null when it is not this workspace's to look at. */
export async function getWorkspaceContact(
  workspaceId: string,
  contactId: string,
  database: CustomShellDb = db
): Promise<CustomShellContact | null> {
  const [row] = await database
    .select()
    .from(customShellContacts)
    .where(
      and(
        eq(customShellContacts.workspaceId, workspaceId),
        eq(customShellContacts.id, contactId)
      )
    )
    .limit(1)
  return row ?? null
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

/**
 * Deletes everybody the list's filters match, without naming them one by one.
 *
 * The same condition the list itself is drawn from, so the people deleted are
 * the people the admin was shown — see `contactFilterConditions`. Sending the
 * filters rather than a frozen list of ids is also the honest thing at this
 * scale: accounts sync into the list on every page load, so a list of ids
 * gathered a minute ago is already a different set of people.
 *
 * It gives back how many rows really went, which is what the toast says. That
 * can differ from the number on the confirm button if somebody signed up in
 * between, and saying the number that happened beats repeating the number that
 * was promised.
 */
export async function deleteWorkspaceContactsMatching(
  workspaceId: string,
  filter: ContactListFilter,
  database: CustomShellDb = db
) {
  const deleted = await database
    .delete(customShellContacts)
    .where(await contactFilterConditions(workspaceId, filter, database))
    .returning({ id: customShellContacts.id })
  return deleted.length
}
