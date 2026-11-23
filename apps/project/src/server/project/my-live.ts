import { eq } from "drizzle-orm"

import { db } from "@/server/db"
import { findMembership, isSiteAdmin, visibleProjectIds } from "@/server/project/access"
import { subscribeToProject, subscribeToTeam } from "@/server/project/live"
import { projectProjectMembers, projectProjects, projectTeams } from "@/server/project/schema"

/**
 * One person's live updates for My dashboard and the Team dashboard
 * (Features 16 Oct, part 5): one stream per person, not one per project, so
 * someone on 15 projects holds one connection.
 *
 * - "mine": a project the person is on changed, so a task of theirs may have.
 * - "team": something of the team's own changed (check-ins, meetings, time
 *   off, projects, milestones), or a project they can see but aren't on.
 *
 * Only these words travel. The page loads itself again the normal way, which
 * checks what it may see.
 */
export type MyLiveChange = "mine" | "team"

export type MyLiveWatch = {
  /** Looks again at which projects the person can see; false once they're off the team. */
  refresh: () => Promise<boolean>
  stop: () => void
}

export async function watchForPerson(
  userId: string,
  send: (change: MyLiveChange) => void,
  database = db,
  /** The team the page shows, for the site admin, who is on none. */
  teamId?: string
): Promise<MyLiveWatch | null> {
  const membership = await findMembership(userId, database, teamId)
  if (!membership) return null
  const stopTeam = subscribeToTeam(membership.teamId, () => send("team"))
  const watching = new Map<string, () => void>()
  let mine = new Set<string>()

  async function refresh() {
    const now = await findMembership(userId, database, teamId)
    if (!now || now.teamId !== membership!.teamId) return false
    const visible = await visibleProjectIds(now, database)
    const memberOf = await database
      .select({ projectId: projectProjectMembers.projectId })
      .from(projectProjectMembers)
      .where(eq(projectProjectMembers.userId, userId))
    mine = new Set(memberOf.map((row) => row.projectId))
    for (const [projectId, stop] of watching) {
      if (!visible.has(projectId)) {
        stop()
        watching.delete(projectId)
      }
    }
    for (const projectId of visible) {
      if (watching.has(projectId)) continue
      watching.set(
        projectId,
        subscribeToProject(projectId, () => send(mine.has(projectId) ? "mine" : "team"))
      )
    }
    return true
  }

  await refresh()
  return {
    refresh,
    stop: () => {
      stopTeam()
      for (const stop of watching.values()) stop()
      watching.clear()
    },
  }
}

/**
 * The site admin's My dashboard, which counts across every team: every team's
 * own changes and every project's, each told as "mine" so the page loads
 * again (task "My dashboard/01 Project cards", Tyler, 29 Oct 2026: live
 * across every team). Null for anyone else.
 */
export async function watchEveryTeam(
  userId: string,
  send: (change: MyLiveChange) => void,
  database = db
): Promise<MyLiveWatch | null> {
  if (!(await isSiteAdmin(userId, database))) return null
  const teams = new Map<string, () => void>()
  const projects = new Map<string, () => void>()

  async function refresh() {
    if (!(await isSiteAdmin(userId, database))) return false
    const [teamRows, projectRows] = await Promise.all([
      database.select({ id: projectTeams.id }).from(projectTeams),
      database.select({ id: projectProjects.id }).from(projectProjects),
    ])
    follow(teams, teamRows, (id) => subscribeToTeam(id, () => send("mine")))
    follow(projects, projectRows, (id) => subscribeToProject(id, () => send("mine")))
    return true
  }

  await refresh()
  return {
    refresh,
    stop: () => {
      for (const stop of [...teams.values(), ...projects.values()]) stop()
      teams.clear()
      projects.clear()
    },
  }
}

/** Listens to every id in `rows` and stops listening to any no longer there. */
function follow(watching: Map<string, () => void>, rows: { id: string }[], start: (id: string) => () => void) {
  const now = new Set(rows.map((row) => row.id))
  for (const [id, stop] of watching) {
    if (now.has(id)) continue
    stop()
    watching.delete(id)
  }
  for (const id of now) if (!watching.has(id)) watching.set(id, start(id))
}
