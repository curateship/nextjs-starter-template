import { and, asc, count, eq, inArray, max } from "drizzle-orm"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { LIMITS } from "@/lib/project/rules"
import { placesAfterReorder } from "@/lib/project/task-order"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { requireOpenProject, requireProjectSettings, type ProjectDb } from "@/server/project/access"
import { projectSections, projectTasks } from "@/server/project/schema"

/**
 * Sections are one project's own headings, such as "Design" and "Build". The
 * List tab groups rows under them. Labels (`labels.ts`) are the team's and cut
 * across projects. Anyone who can change the project can add, rename and
 * delete its sections.
 */

export type Section = { id: string; name: string }

export async function listSections(projectId: string, database: ProjectDb = db): Promise<Section[]> {
  return database
    .select({ id: projectSections.id, name: projectSections.name })
    .from(projectSections)
    .where(eq(projectSections.projectId, projectId))
    .orderBy(asc(projectSections.position), asc(projectSections.createdAt))
}

export async function createSection(
  userId: string,
  input: { projectId: string; name: string },
  database = db
): Promise<Section> {
  return database.transaction(async (tx) => {
    await requireProjectSettings(userId, input.projectId, tx)
    const [{ total, last }] = await tx
      .select({ total: count(), last: max(projectSections.position) })
      .from(projectSections)
      .where(eq(projectSections.projectId, input.projectId))
    if (total >= LIMITS.sectionsPerProject) throw new Error(PROJECT_ERRORS.tooManySections)
    const section = { id: uuid(), name: input.name }
    await tx.insert(projectSections).values({
      ...section,
      projectId: input.projectId,
      position: (last ?? -1) + 1,
      createdAt: now(),
    })
    return section
  })
}

async function requireSection(userId: string, sectionId: string, database: ProjectDb) {
  const [section] = await database
    .select({ id: projectSections.id, projectId: projectSections.projectId })
    .from(projectSections)
    .where(eq(projectSections.id, sectionId))
    .limit(1)
  if (!section) throw new Error(PROJECT_ERRORS.sectionNotFound)
  await requireProjectSettings(userId, section.projectId, database)
  return section
}

/** One name, so renaming shows everywhere the section is drawn. */
export async function renameSection(
  userId: string,
  input: { sectionId: string; name: string },
  database = db
) {
  const section = await requireSection(userId, input.sectionId, database)
  await database
    .update(projectSections)
    .set({ name: input.name })
    .where(eq(projectSections.id, section.id))
}

/** Its tasks move to "No section", through the column's ON DELETE SET NULL. */
export async function deleteSection(userId: string, sectionId: string, database = db) {
  const section = await requireSection(userId, sectionId, database)
  await database.delete(projectSections).where(eq(projectSections.id, section.id))
}

/** Refuses a section from another project, for a task being placed in it. */
export async function requireSectionOf(
  projectId: string,
  sectionId: string,
  database: ProjectDb
) {
  const [section] = await database
    .select({ id: projectSections.id })
    .from(projectSections)
    .where(and(eq(projectSections.id, sectionId), eq(projectSections.projectId, projectId)))
    .limit(1)
  if (!section) throw new Error(PROJECT_ERRORS.sectionNotFound)
}

/**
 * Puts these tasks in this order, for everyone on the project (Tyler's choice:
 * one order, not each person's own). Only these tasks move, among the places
 * they already held (`placesAfterReorder`), so a Board column or a List
 * section is reordered on its own and is still part of one order.
 */
export async function reorderTasks(
  userId: string,
  input: { projectId: string; taskIds: string[] },
  database = db
) {
  await database.transaction(async (tx) => {
    await requireOpenProject(userId, input.projectId, tx)
    const ids = [...new Set(input.taskIds)]
    const rows = await tx
      .select({ id: projectTasks.id, position: projectTasks.position })
      .from(projectTasks)
      .where(and(inArray(projectTasks.id, ids), eq(projectTasks.projectId, input.projectId)))
    if (rows.length !== ids.length) throw new Error(PROJECT_ERRORS.notInThisProject)
    const places = placesAfterReorder(rows, ids)
    for (const row of rows) {
      const place = places.get(row.id)!
      if (place === row.position) continue
      await tx.update(projectTasks).set({ position: place }).where(eq(projectTasks.id, row.id))
    }
  })
}

/** The place after the project's last task, for a new one. */
export async function nextTaskPosition(projectId: string, database: ProjectDb) {
  const [{ last }] = await database
    .select({ last: max(projectTasks.position) })
    .from(projectTasks)
    .where(eq(projectTasks.projectId, projectId))
  return (last ?? 0) + 1
}
