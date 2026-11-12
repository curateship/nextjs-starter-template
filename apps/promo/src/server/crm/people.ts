import { and, asc, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm"

import type { CrmLeadSort } from "@/lib/crm/crm-search"
import { CRM_STAGES, type CrmStage } from "@/lib/crm/crm"
import { listLeadTags } from "@/server/crm/lead-tags"
import { db, type CustomShellDb } from "@/server/db"
import {
  customShellContacts,
  customShellCrmLeads,
  customShellCrmThreads,
} from "@/server/schema"

/**
 * The CRM's Leads section (Tyler, 9 Nov 2026: "leads are completely seperate
 * from people"). A **lead** is an address that wrote in, or was written to
 * from the CRM (`crm_leads`). Subscribers (`contacts`) are a list of their
 * own; one address may be on both, and each list shows only its own kind.
 */

/** A lead as the Leads list draws them. */
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
  /** The subscriber with the same address, or null: the two lists may share one. */
  contactId: string | null
}

/**
 * The Leads section's list: every lead, newest first unless sorted. A lead
 * whose address is also a subscriber's carries that subscriber's id.
 */
export async function listLeadPeople(
  workspaceId: string,
  options: {
    search?: string
    /** One stage only, from the Leads card or Filter. */
    stage?: CrmStage
    sort?: CrmLeadSort
    direction?: "asc" | "desc"
    limit: number
    offset: number
  },
  database: CustomShellDb = db
): Promise<{ leads: LeadPersonRow[]; total: number }> {
  const text = options.search?.trim()
  const where = and(
    eq(customShellCrmLeads.workspaceId, workspaceId),
    options.stage ? eq(customShellCrmLeads.stage, options.stage) : undefined,
    text
      ? or(
          ilike(customShellCrmLeads.email, `%${text}%`),
          ilike(customShellCrmLeads.name, `%${text}%`),
          ilike(customShellCrmLeads.company, `%${text}%`)
        )
      : undefined
  )
  const way = options.direction === "asc" ? sql`asc` : sql`desc`
  // A blank name or company sorts last either way, never first.
  const stageOrder = sql`case ${customShellCrmLeads.stage} ${sql.join(
    CRM_STAGES.map((stage, index) => sql`when ${stage} then ${index}`),
    sql` `
  )} end`
  const column =
    options.sort === "email"
      ? customShellCrmLeads.email
      : options.sort === "name"
        ? sql`lower(${customShellCrmLeads.name})`
        : options.sort === "company"
          ? sql`lower(${customShellCrmLeads.company})`
          : options.sort === "stage"
            ? stageOrder
            : options.sort === "value"
              ? customShellCrmLeads.valueCents
              : customShellCrmLeads.createdAt
  const by = sql`${column} ${way} nulls last`

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

/** The Dashboards block's counts: every subscriber, and every lead. */
export async function countSubscribersAndLeads(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<{ subscribers: number; leads: number }> {
  const [[subscribers], [leads]] = await Promise.all([
    database
      .select({ total: count() })
      .from(customShellContacts)
      .where(eq(customShellContacts.workspaceId, workspaceId)),
    database
      .select({ total: count() })
      .from(customShellCrmLeads)
      .where(eq(customShellCrmLeads.workspaceId, workspaceId)),
  ])
  return { subscribers: Number(subscribers?.total ?? 0), leads: Number(leads?.total ?? 0) }
}
