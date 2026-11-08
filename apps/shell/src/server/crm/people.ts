import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm"

import type { ContactSortColumn } from "@/lib/contacts/contact-sort"
import type { CrmStage } from "@/lib/crm/crm"
import { listLeadTags } from "@/server/crm/lead-tags"
import { db, type CustomShellDb } from "@/server/db"
import {
  customShellContacts,
  customShellCrmLeads,
  customShellCrmThreads,
} from "@/server/schema"

/**
 * The CRM People tab's two kinds of person (Tyler, 7 Nov 2026: "People: one
 * tab holding two kinds ... each row says which kind it is").
 *
 * A **contact** is somebody on the mailing list (`contacts`). A **lead** is an
 * address that wrote in, or was added by hand (`crm_leads`). The two stay two
 * tables: a lead never gets a newsletter unless somebody adds them, and
 * inbound mail never writes `contacts`. This file only reads them side by
 * side. Somebody who is both, matched by lowered address, shows once, as the
 * contact, marked as a lead too.
 */

/** A lead as the People list draws them. */
export type LeadPersonRow = {
  id: string
  email: string
  name: string | null
  company: string | null
  source: string | null
  stage: CrmStage
  valueCents: number
  followUpAt: Date | null
  createdAt: Date
  tags: string[]
  /** Their newest conversation, or null for a lead added by hand and never written to. */
  newestThreadId: string | null
  /** The contact with the same address, or null. Only the Leads pill has these. */
  contactId: string | null
}

/** One row of the People list, in order: which kind, and its id in that kind's table. */
export type PeopleOrderRow = { kind: "contact" | "lead"; id: string }

/**
 * The All pill: every contact, then every lead who is not one, as one list
 * in one order, a page at a time.
 *
 * One `union all` in the database, because paging two lists separately puts
 * page 2's contacts before page 1's leads. Only the order and the ids come
 * back; the caller fills in each row from its own table.
 *
 * A lead has no status and has never been sent a newsletter, so sorting by
 * either puts the leads together at the empty end, the way a contact never
 * emailed already sorts.
 */
export async function listPeopleOrder(
  workspaceId: string,
  options: {
    search?: string
    sort?: ContactSortColumn
    direction?: "asc" | "desc"
    limit: number
    offset: number
  },
  database: CustomShellDb = db
): Promise<{ rows: PeopleOrderRow[]; total: number }> {
  const text = options.search?.trim()
  const pattern = text ? `%${text}%` : null
  const contactSearch = pattern
    ? sql`and (c.email ilike ${pattern} or c.first_name ilike ${pattern} or c.last_name ilike ${pattern})`
    : sql``
  const leadSearchSql = pattern
    ? sql`and (l.email ilike ${pattern} or l.name ilike ${pattern} or l.company ilike ${pattern})`
    : sql``

  // Raw SQL against the table names, because Drizzle's `unionAll` cannot
  // order the two halves together by a column only one of them has.
  const people = sql`
    select 'contact' as kind, c.id, c.created_at, lower(c.email) as email_key,
      lower(coalesce(nullif(trim(concat_ws(' ', c.first_name, c.last_name)), ''), c.email)) as name_key,
      c.status as status_key, sent.at as emailed_at
    from contacts c
    left join (
      select contact_id, max(created_at) as at from deliveries
      where workspace_id = ${workspaceId} group by contact_id
    ) sent on sent.contact_id = c.id
    where c.workspace_id = ${workspaceId} ${contactSearch}
    union all
    select 'lead' as kind, l.id, l.created_at, lower(l.email) as email_key,
      lower(coalesce(nullif(trim(l.name), ''), l.email)) as name_key,
      null as status_key, null::timestamptz as emailed_at
    from crm_leads l
    where l.workspace_id = ${workspaceId}
      and not exists (
        select 1 from contacts c2
        where c2.workspace_id = l.workspace_id and lower(c2.email) = lower(l.email)
      )
      ${leadSearchSql}
  `

  const column = {
    created: sql`created_at`,
    email: sql`email_key`,
    name: sql`name_key`,
    status: sql`status_key`,
    emailed: sql`emailed_at`,
  }[options.sort ?? "created"]
  // The empty end is the same both ways round, as the contacts list does it.
  const order =
    options.direction === "asc"
      ? sql`${column} asc nulls first`
      : sql`${column} desc nulls last`

  const [rows, totals] = await Promise.all([
    database.execute(sql`
      select kind, id from (${people}) p
      order by ${order}, id asc
      limit ${options.limit} offset ${options.offset}
    `),
    database.execute(sql`select count(*)::int as total from (${people}) p`),
  ])

  return {
    rows: resultRows(rows).map((row) => ({
      kind: row.kind === "lead" ? "lead" : "contact",
      id: String(row.id),
    })),
    total: Number(resultRows(totals)[0]?.total ?? 0),
  }
}

/**
 * The Leads pill: every lead, a contact or not, newest first unless sorted.
 * A lead who is also a contact carries that contact's id.
 */
export async function listLeadPeople(
  workspaceId: string,
  options: {
    search?: string
    sort?: ContactSortColumn
    direction?: "asc" | "desc"
    limit: number
    offset: number
  },
  database: CustomShellDb = db
): Promise<{ leads: LeadPersonRow[]; total: number }> {
  const text = options.search?.trim()
  const where = and(
    eq(customShellCrmLeads.workspaceId, workspaceId),
    text
      ? or(
          ilike(customShellCrmLeads.email, `%${text}%`),
          ilike(customShellCrmLeads.name, `%${text}%`),
          ilike(customShellCrmLeads.company, `%${text}%`)
        )
      : undefined
  )
  const by = (options.direction === "asc" ? asc : desc)(
    options.sort === "email"
      ? customShellCrmLeads.email
      : options.sort === "name"
        ? customShellCrmLeads.name
        : customShellCrmLeads.createdAt
  )

  const [rows, [countRow]] = await Promise.all([
    database
      .select({ lead: customShellCrmLeads, contactId: customShellContacts.id })
      .from(customShellCrmLeads)
      .leftJoin(
        customShellContacts,
        and(
          eq(customShellContacts.workspaceId, customShellCrmLeads.workspaceId),
          sql`lower(${customShellContacts.email}) = lower(${customShellCrmLeads.email})`
        )
      )
      .where(where)
      .orderBy(by, asc(customShellCrmLeads.id))
      .limit(options.limit)
      .offset(options.offset),
    database.select({ total: count() }).from(customShellCrmLeads).where(where),
  ])

  const filled = await fillLeads(rows.map((row) => row.lead), database)
  const contactFor = new Map(rows.map((row) => [row.lead.id, row.contactId]))
  return {
    leads: filled.map((lead) => ({ ...lead, contactId: contactFor.get(lead.id) ?? null })),
    total: Number(countRow?.total ?? 0),
  }
}

/** Leads by id, filled in for the People list. Order is the caller's to keep. */
export async function getLeadPeople(
  workspaceId: string,
  leadIds: string[],
  database: CustomShellDb = db
): Promise<LeadPersonRow[]> {
  if (leadIds.length === 0) return []
  const rows = await database
    .select()
    .from(customShellCrmLeads)
    .where(
      and(
        eq(customShellCrmLeads.workspaceId, workspaceId),
        inArray(customShellCrmLeads.id, leadIds)
      )
    )
  return (await fillLeads(rows, database)).map((lead) => ({ ...lead, contactId: null }))
}

/** Each lead's tags and newest conversation, two reads for the whole page. */
async function fillLeads(
  rows: (typeof customShellCrmLeads.$inferSelect)[],
  database: CustomShellDb
): Promise<Omit<LeadPersonRow, "contactId">[]> {
  const ids = rows.map((row) => row.id)
  const [tags, threads] = await Promise.all([
    listLeadTags(ids, database),
    ids.length
      ? database
          .selectDistinctOn([customShellCrmThreads.leadId], {
            leadId: customShellCrmThreads.leadId,
            threadId: customShellCrmThreads.id,
          })
          .from(customShellCrmThreads)
          .where(inArray(customShellCrmThreads.leadId, ids))
          .orderBy(customShellCrmThreads.leadId, desc(customShellCrmThreads.lastMessageAt))
      : Promise.resolve([]),
  ])
  const newest = new Map(threads.map((row) => [row.leadId, row.threadId]))
  return rows.map((row) => ({
    id: row.id,
    email: row.email,
    name: row.name,
    company: row.company,
    source: row.source,
    stage: row.stage as CrmStage,
    valueCents: row.valueCents,
    followUpAt: row.followUpAt,
    createdAt: row.createdAt,
    tags: tags.get(row.id) ?? [],
    newestThreadId: newest.get(row.id) ?? null,
  }))
}

/**
 * Which of these contacts are leads too, by lowered address: the "Lead +
 * Subscriber" mark on a contact's row. Keyed by contact id, holding the lead's id.
 */
export async function leadsForContacts(
  workspaceId: string,
  contacts: { id: string; email: string }[],
  database: CustomShellDb = db
): Promise<Map<string, string>> {
  const found = new Map<string, string>()
  if (contacts.length === 0) return found
  const rows = await database
    .select({ id: customShellCrmLeads.id, email: customShellCrmLeads.email })
    .from(customShellCrmLeads)
    .where(
      and(
        eq(customShellCrmLeads.workspaceId, workspaceId),
        inArray(
          sql`lower(${customShellCrmLeads.email})`,
          contacts.map((contact) => contact.email.toLowerCase())
        )
      )
    )
  const byEmail = new Map(rows.map((row) => [row.email.toLowerCase(), row.id]))
  for (const contact of contacts) {
    const leadId = byEmail.get(contact.email.toLowerCase())
    if (leadId) found.set(contact.id, leadId)
  }
  return found
}

/** The All and Leads pills' counts: everybody once, and every lead. */
export async function countPeople(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<{ all: number; leads: number }> {
  const [[contacts], [leads], [leadOnly]] = await Promise.all([
    database
      .select({ total: count() })
      .from(customShellContacts)
      .where(eq(customShellContacts.workspaceId, workspaceId)),
    database
      .select({ total: count() })
      .from(customShellCrmLeads)
      .where(eq(customShellCrmLeads.workspaceId, workspaceId)),
    database
      .select({ total: count() })
      .from(customShellCrmLeads)
      .where(
        and(
          eq(customShellCrmLeads.workspaceId, workspaceId),
          sql`not exists (
            select 1 from ${customShellContacts}
            where ${customShellContacts.workspaceId} = ${customShellCrmLeads.workspaceId}
              and lower(${customShellContacts.email}) = lower(${customShellCrmLeads.email})
          )`
        )
      ),
  ])
  return {
    all: Number(contacts?.total ?? 0) + Number(leadOnly?.total ?? 0),
    leads: Number(leads?.total ?? 0),
  }
}

/**
 * The rows of a raw query. node-postgres answers `{ rows }`; a test database
 * standing in for it can answer the array itself (as `quiet-contacts.ts` reads).
 */
function resultRows(result: unknown): Record<string, unknown>[] {
  if (Array.isArray(result)) return result as Record<string, unknown>[]
  const rows = (result as { rows?: unknown } | null)?.rows
  return Array.isArray(rows) ? (rows as Record<string, unknown>[]) : []
}
