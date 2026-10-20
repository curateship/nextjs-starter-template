import { and, asc, eq } from "drizzle-orm"

import { PERSONAL_PROJECT_ID } from "@/lib/project/rules"
import { now, uuid } from "@/server/auth/security"
import type { ProjectDb } from "@/server/project/access"
import { writeTaskNotices } from "@/server/project/notices"
import { resolveProjectId } from "@/server/project/personal"
import { projectTasks, projectTeams } from "@/server/project/schema"
import { nextTaskPosition } from "@/server/project/task-order"
import { recordTaskEvent } from "@/server/project/task-history"
import { customShellUsers } from "@/server/schema"

/**
 * Starter tasks: up to 10 titles the site admin keeps in Team settings. Each
 * person who joins, by invite or by the join link, gets them as "Just me"
 * tasks handed out by the site admin, so their first check-in has something
 * real to pick. People already on the team get nothing. "Just me" tasks are
 * private to their person and the site admin.
 *
 * They arrive accepted rather than Waiting, so a new person's first morning
 * starts with work rather than a pile of tasks to accept.
 */
export async function giveStarterTasks(teamId: string, userId: string, tx: ProjectDb) {
  const [team] = await tx
    .select({ starterTasks: projectTeams.starterTasks })
    .from(projectTeams)
    .where(eq(projectTeams.id, teamId))
  const titles = team?.starterTasks ?? []
  if (titles.length === 0) return
  // Handed out by the longest-standing site admin, who runs every team.
  const [owner] = await tx
    .select({ id: customShellUsers.id, name: customShellUsers.name })
    .from(customShellUsers)
    .where(and(eq(customShellUsers.role, "admin"), eq(customShellUsers.status, "active")))
    .orderBy(asc(customShellUsers.createdAt), asc(customShellUsers.id))
    .limit(1)
  if (!owner || owner.id === userId) return

  const projectId = await resolveProjectId(userId, PERSONAL_PROJECT_ID, tx)
  const at = now()
  const made: { id: string; title: string }[] = []
  for (const title of titles) {
    const id = uuid()
    await tx.insert(projectTasks).values({
      id,
      projectId,
      title,
      notes: "",
      status: "todo",
      assigneeUserId: userId,
      assignedByUserId: owner.id,
      firstHandedOutByUserId: owner.id,
      acceptedAt: at,
      createdByUserId: owner.id,
      createdAt: at,
      updatedAt: at,
      position: await nextTaskPosition(projectId, tx),
    })
    await recordTaskEvent(tx, { taskId: id, kind: "created", actorUserId: owner.id })
    made.push({ id, title })
  }
  const first = made[0]
  await writeTaskNotices(tx, [
    {
      kind: made.length === 1 ? "task_assigned" : "tasks_handed",
      recipientUserId: userId,
      actor: owner,
      task: { id: first.id, projectId, title: first.title },
      count: made.length,
      detail: made.length === 1 ? first.title : `Starter tasks: ${made.map((task) => task.title).join(", ")}`,
    },
  ])
}
