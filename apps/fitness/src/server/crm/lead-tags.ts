import { and, asc, count, eq, inArray } from "drizzle-orm"

import { CRM_LEAD_TAG_LIMIT, normalizeLeadTag } from "@/lib/crm/lead-tags"
import { now } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { customShellCrmLeadTags, customShellCrmLeads } from "@/server/schema"

/**
 * Tags on a lead (CRM task 27, built in task 36 on 7 Nov 2026), following
 * `src/server/people/member-tags.ts`: one row per tag, so a tag is found by
 * an index. Every write checks the lead is this workspace's first.
 */

export const CRM_LEAD_TAG_INVALID = "CRM_LEAD_TAG_INVALID"
export const CRM_LEAD_TAG_LIMIT_REACHED = "CRM_LEAD_TAG_LIMIT"
export const CRM_LEAD_NOT_FOUND = "CRM_LEAD_NOT_FOUND"

/** Each lead's tags, A to Z, keyed by lead id. Every id asked for is in the answer. */
export async function listLeadTags(
  leadIds: string[],
  database: CustomShellDb = db
): Promise<Map<string, string[]>> {
  const result = new Map(leadIds.map((leadId) => [leadId, [] as string[]]))
  if (leadIds.length === 0) return result
  const rows = await database
    .select({ leadId: customShellCrmLeadTags.leadId, tag: customShellCrmLeadTags.tag })
    .from(customShellCrmLeadTags)
    .where(inArray(customShellCrmLeadTags.leadId, leadIds))
    .orderBy(asc(customShellCrmLeadTags.tag))
  for (const row of rows) result.get(row.leadId)?.push(row.tag)
  return result
}

/** Every tag this workspace uses, A to Z, for the filter and the suggestions. */
export async function listWorkspaceLeadTags(
  workspaceId: string,
  database: CustomShellDb = db
): Promise<string[]> {
  const rows = await database
    .selectDistinct({ tag: customShellCrmLeadTags.tag })
    .from(customShellCrmLeadTags)
    .innerJoin(customShellCrmLeads, eq(customShellCrmLeads.id, customShellCrmLeadTags.leadId))
    .where(eq(customShellCrmLeads.workspaceId, workspaceId))
    .orderBy(asc(customShellCrmLeadTags.tag))
  return rows.map((row) => row.tag)
}

export type LeadTagChange = "added" | "removed" | "unchanged"

/** Adds or takes away one tag, and says whether anything changed. */
export async function changeLeadTag(
  workspaceId: string,
  leadId: string,
  mode: "add" | "remove",
  value: string,
  database: CustomShellDb = db
): Promise<LeadTagChange> {
  const tag = normalizeLeadTag(value)
  if (!tag) throw new Error(CRM_LEAD_TAG_INVALID)

  const [lead] = await database
    .select({ id: customShellCrmLeads.id })
    .from(customShellCrmLeads)
    .where(and(eq(customShellCrmLeads.workspaceId, workspaceId), eq(customShellCrmLeads.id, leadId)))
    .limit(1)
  if (!lead) throw new Error(CRM_LEAD_NOT_FOUND)

  if (mode === "remove") {
    const removed = await database
      .delete(customShellCrmLeadTags)
      .where(and(eq(customShellCrmLeadTags.leadId, leadId), eq(customShellCrmLeadTags.tag, tag)))
      .returning({ tag: customShellCrmLeadTags.tag })
    return removed.length ? "removed" : "unchanged"
  }

  const [held] = await database
    .select({ total: count() })
    .from(customShellCrmLeadTags)
    .where(eq(customShellCrmLeadTags.leadId, leadId))
  if (Number(held?.total ?? 0) >= CRM_LEAD_TAG_LIMIT) throw new Error(CRM_LEAD_TAG_LIMIT_REACHED)

  const added = await database
    .insert(customShellCrmLeadTags)
    .values({ leadId, tag, createdAt: now() })
    .onConflictDoNothing()
    .returning({ tag: customShellCrmLeadTags.tag })
  return added.length ? "added" : "unchanged"
}
