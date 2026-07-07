import { and, count, desc, eq, inArray, sql } from "drizzle-orm"

import {
  BACKLINK_PROSPECT_STATUSES,
  type BacklinkProspectStatus,
} from "@/lib/backlinks"
import { db, type CustomShellDb } from "@/server/db"
import { insertAndRunJob } from "@/server/keyword-jobs"
import { getOwnedProject, parseProjectDomain } from "@/server/seo-projects"
import {
  backlinkProspects,
  backlinkSnapshots,
  projectCompetitors,
  type BacklinkProspectRecord,
} from "@/server/schema"

export type BacklinkProspect = {
  id: string
  referringDomain: string
  normalizedDomain: string
  domainRank: number | null
  backlinksCount: number | null
  referringTo: string[]
  status: BacklinkProspectStatus
  contactUrl: string | null
  contactEmail: string | null
  notes: string | null
  discoveredVia: string
  createdAt: string
  updatedAt: string
}

export type BacklinkSummary = {
  target: string
  domainRank: number | null
  backlinks: number | null
  referringDomains: number | null
  referringPages: number | null
  brokenBacklinks: number | null
  fetchedAt: string
}

export type ProspectSortField = "domain" | "domainRank" | "status" | "updatedAt"

function toProspect(row: BacklinkProspectRecord): BacklinkProspect {
  return {
    id: row.id,
    referringDomain: row.referringDomain,
    normalizedDomain: row.normalizedDomain,
    domainRank: row.domainRank,
    backlinksCount: row.backlinksCount,
    referringTo: Array.isArray(row.referringTo)
      ? (row.referringTo as string[])
      : [],
    status: row.status as BacklinkProspectStatus,
    contactUrl: row.contactUrl,
    contactEmail: row.contactEmail,
    notes: row.notes,
    discoveredVia: row.discoveredVia,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function listProspectsForProject(
  userId: string,
  input: {
    projectId: string
    q?: string
    status?: BacklinkProspectStatus[]
    sort?: { field: ProspectSortField; direction: "asc" | "desc" }
    pagination: { page: number; pageSize: number }
  },
  database: CustomShellDb = db
): Promise<{ rows: BacklinkProspect[]; total: number }> {
  await getOwnedProject(userId, input.projectId, database)

  const conditions = [eq(backlinkProspects.projectId, input.projectId)]
  if (input.q?.trim()) {
    conditions.push(
      sql`${backlinkProspects.referringDomain} ilike ${`%${input.q.trim()}%`}`
    )
  }
  if (input.status?.length) {
    conditions.push(inArray(backlinkProspects.status, input.status))
  }

  const sort = input.sort ?? { field: "domainRank", direction: "desc" }
  const sortColumn = {
    domain: sql`${backlinkProspects.normalizedDomain}`,
    domainRank: sql`${backlinkProspects.domainRank}`,
    status: sql`${backlinkProspects.status}`,
    updatedAt: sql`${backlinkProspects.updatedAt}`,
  }[sort.field]
  const orderBy =
    sort.direction === "asc"
      ? sql`${sortColumn} asc nulls last`
      : sql`${sortColumn} desc nulls last`

  const page = Math.max(1, input.pagination.page)
  const pageSize = Math.max(1, Math.min(input.pagination.pageSize, 100))

  const [totalRow] = await database
    .select({ value: count() })
    .from(backlinkProspects)
    .where(and(...conditions))

  const rows = await database
    .select()
    .from(backlinkProspects)
    .where(and(...conditions))
    .orderBy(orderBy, desc(backlinkProspects.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize)

  return { rows: rows.map(toProspect), total: totalRow?.value ?? 0 }
}

export async function getProspectStatusCounts(
  userId: string,
  projectId: string,
  database: CustomShellDb = db
): Promise<Record<BacklinkProspectStatus, number>> {
  await getOwnedProject(userId, projectId, database)

  const rows = await database
    .select({ status: backlinkProspects.status, value: count() })
    .from(backlinkProspects)
    .where(eq(backlinkProspects.projectId, projectId))
    .groupBy(backlinkProspects.status)

  const counts = Object.fromEntries(
    BACKLINK_PROSPECT_STATUSES.map((status) => [status, 0])
  ) as Record<BacklinkProspectStatus, number>
  for (const row of rows) {
    if (row.status in counts) {
      counts[row.status as BacklinkProspectStatus] = row.value
    }
  }
  return counts
}

export async function updateProspect(
  userId: string,
  projectId: string,
  prospectId: string,
  input: {
    status?: BacklinkProspectStatus
    contactUrl?: string
    contactEmail?: string
    notes?: string
  },
  database: CustomShellDb = db
) {
  await getOwnedProject(userId, projectId, database)

  const [updated] = await database
    .update(backlinkProspects)
    .set({
      ...(input.status !== undefined ? { status: input.status } : {}),
      ...(input.contactUrl !== undefined
        ? { contactUrl: input.contactUrl.trim() || null }
        : {}),
      ...(input.contactEmail !== undefined
        ? { contactEmail: input.contactEmail.trim() || null }
        : {}),
      ...(input.notes !== undefined ? { notes: input.notes || null } : {}),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(backlinkProspects.id, prospectId),
        eq(backlinkProspects.projectId, projectId)
      )
    )
    .returning()

  if (!updated) {
    throw new Error("Prospect not found")
  }
  return toProspect(updated)
}

export async function addManualProspect(
  userId: string,
  projectId: string,
  input: {
    domain: string
    contactUrl?: string
    contactEmail?: string
    notes?: string
  },
  database: CustomShellDb = db
) {
  await getOwnedProject(userId, projectId, database)
  const normalizedDomain = parseProjectDomain(input.domain)

  const [created] = await database
    .insert(backlinkProspects)
    .values({
      projectId,
      referringDomain: input.domain.trim(),
      normalizedDomain,
      contactUrl: input.contactUrl?.trim() || null,
      contactEmail: input.contactEmail?.trim() || null,
      notes: input.notes || null,
      discoveredVia: "manual",
    })
    .onConflictDoNothing()
    .returning()

  if (!created) {
    throw new Error("This domain is already in the prospect list.")
  }
  return toProspect(created)
}

export async function deleteProspect(
  userId: string,
  projectId: string,
  prospectId: string,
  database: CustomShellDb = db
) {
  await getOwnedProject(userId, projectId, database)
  const [deleted] = await database
    .delete(backlinkProspects)
    .where(
      and(
        eq(backlinkProspects.id, prospectId),
        eq(backlinkProspects.projectId, projectId)
      )
    )
    .returning({ id: backlinkProspects.id })

  if (!deleted) {
    throw new Error("Prospect not found")
  }
  return deleted
}

export async function getBacklinkSummary(
  userId: string,
  projectId: string,
  database: CustomShellDb = db
): Promise<BacklinkSummary | null> {
  await getOwnedProject(userId, projectId, database)
  const [row] = await database
    .select()
    .from(backlinkSnapshots)
    .where(eq(backlinkSnapshots.projectId, projectId))
    .limit(1)

  if (!row) return null
  return {
    target: row.target,
    domainRank: row.domainRank,
    backlinks: row.backlinks,
    referringDomains: row.referringDomains,
    referringPages: row.referringPages,
    brokenBacklinks: row.brokenBacklinks,
    fetchedAt: row.fetchedAt.toISOString(),
  }
}

const CSV_COLUMNS = [
  "referring_domain",
  "domain_rank",
  "backlinks_count",
  "referring_to",
  "status",
  "contact_url",
  "contact_email",
  "notes",
  "discovered_via",
  "created_at",
] as const

function csvEscape(value: string) {
  // Neutralize spreadsheet formula injection: a leading =, +, -, @, tab, or CR
  // makes Excel/Sheets evaluate the cell as a formula on open.
  const guarded = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value
  return /[",\n\r]/.test(guarded) ? `"${guarded.replaceAll('"', '""')}"` : guarded
}

export async function exportProspectsCsv(
  userId: string,
  projectId: string,
  database: CustomShellDb = db
): Promise<{ filename: string; csv: string }> {
  await getOwnedProject(userId, projectId, database)

  const rows = await database
    .select()
    .from(backlinkProspects)
    .where(eq(backlinkProspects.projectId, projectId))
    .orderBy(sql`${backlinkProspects.domainRank} desc nulls last`)
    .limit(10000)

  const lines = [CSV_COLUMNS.join(",")]
  for (const raw of rows) {
    const row = toProspect(raw)
    lines.push(
      [
        row.referringDomain,
        row.domainRank ?? "",
        row.backlinksCount ?? "",
        row.referringTo.join(" "),
        row.status,
        row.contactUrl ?? "",
        row.contactEmail ?? "",
        row.notes ?? "",
        row.discoveredVia,
        row.createdAt,
      ]
        .map((value) => csvEscape(String(value)))
        .join(",")
    )
  }

  const date = new Date().toISOString().slice(0, 10)
  return {
    filename: `backlink-prospects-${date}.csv`,
    csv: lines.join("\r\n"),
  }
}

export async function createBacklinkDiscoveryJobForUser(
  userId: string,
  projectId: string,
  input: { limit?: number } = {},
  database: CustomShellDb = db
) {
  const project = await getOwnedProject(userId, projectId, database)
  if (!project.normalizedDomain) {
    throw new Error(
      "Set a domain in Settings → Project before finding prospects."
    )
  }

  const [competitor] = await database
    .select({ id: projectCompetitors.id })
    .from(projectCompetitors)
    .where(eq(projectCompetitors.projectId, projectId))
    .limit(1)
  if (!competitor) {
    throw new Error("Add at least one competitor before finding prospects.")
  }

  const limit = Math.max(10, Math.min(input.limit ?? 300, 1000))
  return insertAndRunJob(
    userId,
    projectId,
    "backlink_discovery",
    { limit },
    database
  )
}
