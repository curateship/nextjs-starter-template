import { and, asc, eq, inArray, notInArray, sql } from "drizzle-orm"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import type { MyHeading, MyPlace } from "@/lib/project/my-task-order"
import { db } from "@/server/db"
import { projectMyTaskOrder, projectTasks } from "@/server/project/schema"

/** My places on My dashboard's List, for both the employee's and the site admin's. */
export async function loadMyTaskOrder(userId: string, database = db): Promise<MyPlace[]> {
  return database
    .select({ taskId: projectMyTaskOrder.taskId, heading: projectMyTaskOrder.heading, position: projectMyTaskOrder.position })
    .from(projectMyTaskOrder)
    .where(eq(projectMyTaskOrder.userId, userId))
    .orderBy(asc(projectMyTaskOrder.position))
}

/**
 * One heading's rows in my new order, every one of them assigned to me, as My
 * dashboard lists only those. Places left under this heading by tasks not in
 * the list are dropped, so a task coming back later lands at the bottom.
 */
export async function orderMyTasks(userId: string, heading: MyHeading, taskIds: string[], database = db) {
  const unique = [...new Set(taskIds)]
  if (unique.length !== taskIds.length) throw new Error(PROJECT_ERRORS.notMyTasks)
  await database.transaction(async (tx) => {
    const mine = await tx
      .select({ id: projectTasks.id })
      .from(projectTasks)
      .where(and(inArray(projectTasks.id, unique), eq(projectTasks.assigneeUserId, userId)))
    if (mine.length !== unique.length) throw new Error(PROJECT_ERRORS.notMyTasks)
    await tx
      .delete(projectMyTaskOrder)
      .where(
        and(
          eq(projectMyTaskOrder.userId, userId),
          eq(projectMyTaskOrder.heading, heading),
          notInArray(projectMyTaskOrder.taskId, unique)
        )
      )
    await tx
      .insert(projectMyTaskOrder)
      .values(unique.map((taskId, position) => ({ userId, taskId, heading, position })))
      .onConflictDoUpdate({
        target: [projectMyTaskOrder.userId, projectMyTaskOrder.taskId],
        set: { heading: sql`excluded.heading`, position: sql`excluded.position` },
      })
  })
}
