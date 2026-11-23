import { and, asc, isNull, ne } from "drizzle-orm"

import type { ProjectColor } from "@/lib/project/rules"
import { db } from "@/server/db"
import { findMembership, visibleProjectsWhere, type ProjectDb } from "@/server/project/access"
import { teamTasksViewScreen, type SavedView } from "@/server/project/saved-views"
import { projectProjects, projectTasks } from "@/server/project/schema"
import { listTaskCards, withUnread, type TaskCard } from "@/server/project/tasks"
import { listSavedViews } from "@/server/saved-views"

/** One of the team's open projects, for the Tasks tab's Project column, Filter and Move to project. */
export type TeamTaskProject = { id: string; name: string; color: ProjectColor }

/**
 * The Team dashboard's Tasks tab (task "Team dashboard/admin-3-panel-design",
 * Tyler, 7 Nov 2026: "Middle panel should now show all the tasks from the
 * team"): every task in the team's shared, open projects that this person
 * can see. The site admin sees every one; an employee the projects they are
 * on, as everywhere else ("As today", his pick). "Just me" lists stay out,
 * being one person's own, and so do archived tasks.
 */
export type TeamTasks = {
  tasks: TaskCard[]
  projects: TeamTaskProject[]
  views: SavedView[]
  viewScreen: string
}

export async function loadTeamTasks(userId: string, database: ProjectDb = db): Promise<TeamTasks | null> {
  const membership = await findMembership(userId, database)
  if (!membership) return null
  const shared = and(
    visibleProjectsWhere(membership),
    isNull(projectProjects.personalUserId),
    isNull(projectProjects.archivedAt)
  )
  const [projects, tasks] = await Promise.all([
    database
      .select({ id: projectProjects.id, name: projectProjects.name, color: projectProjects.color })
      .from(projectProjects)
      .where(shared)
      .orderBy(asc(projectProjects.name)),
    listTaskCards(and(shared, ne(projectTasks.status, "archived")), database),
  ])
  const viewScreen = teamTasksViewScreen(membership.teamId)
  return {
    // Each with its unread count, so a row shows new comments as on a project page.
    tasks: await withUnread(membership, tasks, database),
    projects,
    // Every row was kept by the team-tasks screen's own rule, so its values are task filters.
    views: (await listSavedViews(userId, viewScreen, database)) as SavedView[],
    viewScreen,
  }
}
