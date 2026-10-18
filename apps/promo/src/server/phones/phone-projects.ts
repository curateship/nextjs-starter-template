import { and, eq, isNotNull } from "drizzle-orm"

import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { promoAccounts, promoProjects } from "@/server/social/schema"

/**
 * The projects that have an account on a phone, with which phones, for the
 * Phones dashboard's Project filter (part 59 of the phone farm). Read with
 * the page, so the filter lists only projects that would show a phone.
 */
export type PhoneProject = { id: string; name: string; phoneIds: string[] }

export async function phoneProjects(userId: string, db: CustomShellDb = defaultDb): Promise<PhoneProject[]> {
  const rows = await db
    .select({ id: promoProjects.id, name: promoProjects.name, phoneId: promoAccounts.phoneId })
    .from(promoAccounts)
    .innerJoin(promoProjects, eq(promoProjects.id, promoAccounts.projectId))
    .where(and(eq(promoAccounts.userId, userId), isNotNull(promoAccounts.phoneId)))
  const byProject = new Map<string, PhoneProject>()
  for (const row of rows) {
    if (!row.phoneId) continue
    const project = byProject.get(row.id) ?? { id: row.id, name: row.name, phoneIds: [] }
    if (!project.phoneIds.includes(row.phoneId)) project.phoneIds.push(row.phoneId)
    byProject.set(row.id, project)
  }
  return [...byProject.values()].sort((a, b) => a.name.localeCompare(b.name))
}
