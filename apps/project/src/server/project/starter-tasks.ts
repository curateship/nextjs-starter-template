import { and, eq } from "drizzle-orm"

import { PERSONAL_PROJECT_ID } from "@/lib/project/rules"
import { now, uuid } from "@/server/auth/security"
import type { ProjectDb } from "@/server/project/access"
import { writeTaskNotices } from "@/server/project/notices"
import { resolveProjectId } from "@/server/project/personal"
import { projectTasks, projectTeamMembers, projectTeams } from "@/server/project/schema"
import { nextTaskPosition } from "@/server/project/sections"
import { recordTaskEvent } from "@/server/project/task-history"
import { customShellUsers } from "@/server/schema"

/**
 * Starter tasks: up to 10 titles the owner and admins keep in Team settings.
 * Each person who joins, by invite or by the join link, gets them as "Just
 * me" tasks handed out by the owner, so their first check-in has something
 * real to pick. People already on the team get nothing. "Just me" tasks are
 * private (Tyler's choice, 11 Oct 2026), so the owner can't see whether they
 * are done; Team settings says so.
 *
 * They arrive accepted rather than Waiting: the owner can't open a "Just me"
 * task, so handing one back would leave it with nobody.
 */
export async function giveStarterTasks(teamId: string, userId: string, tx: ProjectDb) {
  const [team] = await tx
    .select({ starterTasks: projectTeams.starterTasks })
    .from(projectTeams)
    .where(eq(projectTeams.id, teamId))
  const titles = team?.starterTasks ?? []
  if (titles.length === 0) return
  const [owner] = await tx
    .select({ id: projectTeamMembers.userId, name: customShellUsers.name })
    .from(projectTeamMembers)
    .innerJoin(customShellUsers, eq(customShellUsers.id, projectTeamMembers.userId))
    .where(and(eq(projectTeamMembers.teamId, teamId), eq(projectTeamMembers.role, "owner")))
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
