import { and, eq } from "drizzle-orm"

import { PROJECT_ERRORS } from "@/lib/project/errors"
import type { MyPlace } from "@/lib/project/my-task-order"
import type { NoticeSwitchId } from "@/lib/project/notice-switches"
import { boardStatusOrder, type TaskStatus } from "@/lib/project/rules"
import { db } from "@/server/db"
import { requireMembership } from "@/server/project/access"
import { loadCheckinPage, type CheckinPage } from "@/server/project/checkins"
import { listTeamLabels, type Label } from "@/server/project/labels"
import { listSavedViews, projectViewScreen, type SavedView } from "@/server/project/saved-views"
import { listTeamTypes } from "@/server/project/task-types"
import type { TaskType } from "@/lib/project/task-types"
import { listTimeOffFor, loadCheckinRecord, type CheckinRecord } from "@/server/project/time-off"
import { projectTeamMembers, projectTeams } from "@/server/project/schema"
import { loadMyWork, type TaskCard } from "@/server/project/tasks"
import { loadMyTaskOrder } from "@/server/project/my-task-order"
import { loadNoticesOff } from "@/server/project/notice-switches"
import { customShellUsers } from "@/server/schema"

/**
 * My dashboard: who I am on the team, my tasks, and today's check-in. The
 * check-in is a window opened from here, so its page of data comes along.
 */

export type MyDashboard = {
  me: {
    id: string
    name: string
    email: string
    avatarUrl: string
    joinedAt: string
    teamName: string
    /** My job title, which I set here. */
    title: string | null
  }
  tasks: TaskCard[]
  /** My own order on the List, per heading. */
  myOrder: MyPlace[]
  checkin: CheckinPage
  /** The team's labels, for the Label filter. */
  labels: Label[]
  /** The team's task types, for the Type filter. */
  taskTypes: TaskType[]
  /** "On time 18 of the last 20 work days": mine alone, never shown to anyone else. */
  record: CheckinRecord
  /** My own saved views on My tasks. */
  views: SavedView[]
  /** The shell's key those views are kept under, `my-tasks:<team id>`. */
  viewScreen: string
  /** The bell notices I've switched off. Only I see these. */
  noticesOff: NoticeSwitchId[]
  /** My Board's columns, in my own order. */
  statusOrder: TaskStatus[]
  /** My days off coming up, loaded with the page so the Time off card never shows a load when opened. */
  timeOff: Awaited<ReturnType<typeof listTimeOffFor>>
}

export async function loadMyDashboard(userId: string, database = db): Promise<MyDashboard> {
  const membership = await requireMembership(userId, database)
  const [row] = await database
    .select({
      name: customShellUsers.name,
      email: customShellUsers.email,
      avatarUrl: customShellUsers.avatarUrl,
      joinedAt: projectTeamMembers.joinedAt,
      teamName: projectTeams.name,
      title: projectTeamMembers.title,
      statusOrder: projectTeamMembers.myStatusOrder,
    })
    .from(projectTeamMembers)
    .innerJoin(projectTeams, eq(projectTeams.id, projectTeamMembers.teamId))
    .innerJoin(customShellUsers, eq(customShellUsers.id, projectTeamMembers.userId))
    .where(eq(projectTeamMembers.userId, userId))
    .limit(1)
  if (!row) throw new Error(PROJECT_ERRORS.noTeam)
  return {
    me: {
      id: userId,
      name: row.name,
      email: row.email,
      avatarUrl: row.avatarUrl ?? "",
      joinedAt: row.joinedAt.toISOString(),
      teamName: row.teamName,
      title: row.title,
    },
    tasks: await loadMyWork(userId, database),
    myOrder: await loadMyTaskOrder(userId, database),
    checkin: await loadCheckinPage(userId, database),
    labels: await listTeamLabels(membership.teamId, database),
    taskTypes: await listTeamTypes(membership.teamId, database),
    record: await loadCheckinRecord(userId, database),
    views: await listSavedViews(userId, membership.teamId, null, database),
    viewScreen: projectViewScreen(membership.teamId, null),
    noticesOff: await loadNoticesOff(userId, database),
    statusOrder: boardStatusOrder(row.statusOrder),
    timeOff: await listTimeOffFor(userId, undefined, database),
  }
}

/** My dashboard's Board columns dragged into a new order: mine alone. */
export async function setMyStatusOrder(userId: string, statusOrder: TaskStatus[], database = db) {
  const membership = await requireMembership(userId, database)
  await database
    .update(projectTeamMembers)
    .set({ myStatusOrder: statusOrder })
    .where(and(eq(projectTeamMembers.teamId, membership.teamId), eq(projectTeamMembers.userId, userId)))
}
