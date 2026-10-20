import { and, eq, inArray, max } from "drizzle-orm"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import { placesAfterReorder } from "@/lib/project/task-order"
import { db } from "@/server/db"
import { requireOpenProject, type ProjectDb } from "@/server/project/access"
import { projectTasks } from "@/server/project/schema"

/**
 * The project's own order of tasks. Sections lived here too until Tyler
 * replaced them with tags on 19 Oct 2026; their table stays as history.
 */

/**
 * Puts these tasks in this order, for everyone on the project (Tyler's choice:
 * one order, not each person's own). Only these tasks move, among the places
 * they already held (`placesAfterReorder`), so a Board column or a List
 * group is reordered on its own and is still part of one order.
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
