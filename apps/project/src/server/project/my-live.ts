import { eq } from "drizzle-orm"

import { db } from "@/server/db"
import { findMembership, visibleProjectIds } from "@/server/project/access"
import { subscribeToProject, subscribeToTeam } from "@/server/project/live"
import { projectProjectMembers } from "@/server/project/schema"

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
  database = db
): Promise<MyLiveWatch | null> {
  const membership = await findMembership(userId, database)
  if (!membership) return null
  const stopTeam = subscribeToTeam(membership.teamId, () => send("team"))
  const watching = new Map<string, () => void>()
  let mine = new Set<string>()

  async function refresh() {
    const now = await findMembership(userId, database)
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
