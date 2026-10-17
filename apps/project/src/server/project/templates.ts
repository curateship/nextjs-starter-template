import { and, asc, count, eq, ne, sql } from "drizzle-orm"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { LIMITS } from "@/lib/project/rules"
import type { TemplateContent, TemplateRow } from "@/lib/project/templates"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import {
  requireMembership,
  requireProjectSettings,
  requireTeamRunner,
  type ProjectDb,
} from "@/server/project/access"
import { requireSharedProject } from "@/server/project/personal"
import { readProjectPlan } from "@/server/project/project-plans"
import { projectTemplates } from "@/server/project/schema"

/**
 * Saved project templates, such as "Client website". A template is a copy of
 * a project's plan taken when it was saved (`project-plans.ts`), so changing
 * the project later never changes the template, and a template is never a
 * project: it shows on no list but New project's and Team settings'. Anyone
 * on the team saves or uses one; the owner and admins rename and delete them
 * in Team settings, the same as step lists. Templates stay inside one team.
 */

export async function listTemplates(teamId: string, database: ProjectDb = db): Promise<TemplateRow[]> {
  return database
    .select({
      id: projectTemplates.id,
      name: projectTemplates.name,
      taskCount: sql<number>`jsonb_array_length(${projectTemplates.content} -> 'tasks')`.mapWith(Number),
      color: sql<TemplateRow["color"]>`${projectTemplates.content} ->> 'color'`,
    })
    .from(projectTemplates)
    .where(eq(projectTemplates.teamId, teamId))
    .orderBy(asc(sql`lower(${projectTemplates.name})`))
}

/** New project's list, for anyone on a team. */
export async function listMyTeamTemplates(userId: string, database = db): Promise<TemplateRow[]> {
  const membership = await requireMembership(userId, database)
  return listTemplates(membership.teamId, database)
}

/** "Save as template", from a project's settings. Archived projects can be saved too. */
export async function saveTemplate(
  userId: string,
  input: { projectId: string; name: string },
  database = db
): Promise<{ id: string }> {
  return database.transaction(async (tx) => {
    const { membership, project } = await requireProjectSettings(userId, input.projectId, tx, { allowArchived: true })
    requireSharedProject(project)
    const [{ total }] = await tx
      .select({ total: count() })
      .from(projectTemplates)
      .where(eq(projectTemplates.teamId, membership.teamId))
    if (total >= LIMITS.templatesPerTeam) throw new Error(PROJECT_ERRORS.tooManyTemplates)
    await requireNameFree(membership.teamId, input.name, tx)
    const id = uuid()
    await tx.insert(projectTemplates).values({
      id,
      teamId: membership.teamId,
      name: input.name,
      content: await readProjectPlan(tx, project),
      createdByUserId: userId,
      createdAt: now(),
    })
    return { id }
  })
}

export async function renameTemplate(
  userId: string,
  input: { templateId: string; name: string },
  database = db
) {
  await database.transaction(async (tx) => {
    const membership = await requireTeamRunner(userId, tx)
    await loadTemplatePlan(membership.teamId, input.templateId, tx)
    await requireNameFree(membership.teamId, input.name, tx, input.templateId)
    await tx.update(projectTemplates).set({ name: input.name }).where(eq(projectTemplates.id, input.templateId))
  })
}

/** Projects already started from it keep everything; they never pointed at it. */
export async function deleteTemplate(userId: string, templateId: string, database = db) {
  const membership = await requireTeamRunner(userId, database)
  await loadTemplatePlan(membership.teamId, templateId, database)
  await database.delete(projectTemplates).where(eq(projectTemplates.id, templateId))
}

/** The template's plan, when it belongs to this team. Another team's answers as gone. */
export async function loadTemplatePlan(
  teamId: string,
  templateId: string,
  database: ProjectDb
): Promise<TemplateContent> {
  const [template] = await database
    .select({ content: projectTemplates.content })
    .from(projectTemplates)
    .where(and(eq(projectTemplates.id, templateId), eq(projectTemplates.teamId, teamId)))
    .limit(1)
  if (!template) throw new Error(PROJECT_ERRORS.templateNotFound)
  return template.content
}

async function requireNameFree(teamId: string, name: string, database: ProjectDb, exceptId?: string) {
  const [taken] = await database
    .select({ id: projectTemplates.id })
    .from(projectTemplates)
    .where(
      and(
        eq(projectTemplates.teamId, teamId),
        sql`lower(${projectTemplates.name}) = lower(${name})`,
        exceptId ? ne(projectTemplates.id, exceptId) : undefined
      )
    )
    .limit(1)
  if (taken) throw new Error(PROJECT_ERRORS.templateNameTaken)
}
