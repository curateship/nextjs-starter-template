import { and, asc, count, desc, eq, ilike, inArray, isNotNull, isNull, ne, or, sql, type SQL } from "drizzle-orm"

import { db } from "@/server/db"
import { writeNotices } from "@/server/pomodoro/notices"
import { localDateFor } from "@/server/pomodoro/productivity"
import {
  isDuplicateName,
  projectFocusSeconds,
  projectTaskCount,
  sumProjectFocus,
  targetPeriodBounds,
} from "@/server/pomodoro/projects"
import { forgetPublicProfile } from "@/server/pomodoro/public-profile"
import { pomodoroAuditLogs, pomodoroProfiles, pomodoroProjects, tasks } from "@/server/pomodoro/schema"
import { customShellUsers as users } from "@/server/schema"
import type {
  PROJECT_STATE_FILTERS,
  PROJECT_TARGET_FILTERS,
  PROJECT_VISIBILITY_FILTERS,
  ProjectSortColumn,
} from "@/lib/pomodoro/admin-lists"
import { projectChangedMessage, projectDeletedMessage } from "@/lib/pomodoro/notices"
import type { ProjectTarget, TargetPeriod } from "@/lib/pomodoro/project-targets"

/**
 * Projects in the admin (admin task 07): every member's projects with their
 * owner, tasks, hours and target, the window that renames, retargets,
 * archives and brings one back, and delete. The task count and the hours are
 * the same SQL the owner's own Projects card reads (`projects.ts`), so the
 * two always agree. See `workspace/docs/admin-sections.md`.
 */

/** The page a project notice leads to: the Projects panel is on Tasks. */
const PROJECTS_PAGE = "/tasks"

/**
 * The owner's notice about one project, or none when the admin changed their
 * own project: nobody is notified about their own action.
 */
function ownerNotice(ownerId: string, actorUserId: string, kind: "project_changed" | "project_deleted", message: string) {
  return ownerId === actorUserId ? [] : [{ recipientUserId: ownerId, kind, message, href: PROJECTS_PAGE }]
}

/**
 * This period's focus for every row with a target, in each owner's own
 * timezone and week, in one read for the rows asked about only.
 */
async function withPeriodProgress<
  Row extends {
    id: string
    ownerId: string
    timezone: string | null
    targetHours: number | null
    targetPeriod: TargetPeriod | null
  },
>(rows: Row[]) {
  const windows = rows.flatMap((row) =>
    row.targetPeriod
      ? [
          {
            projectId: row.id,
            userId: row.ownerId,
            ...targetPeriodBounds(row.targetPeriod, localDateFor(row.timezone ?? "UTC"), row.timezone ?? "UTC"),
          },
        ]
      : []
  )
  const seconds = await sumProjectFocus(windows)
  return rows.map(({ timezone: _timezone, ...row }) => ({
    ...row,
    periodSeconds: row.targetPeriod ? (seconds.get(row.id) ?? 0) : null,
  }))
}

const projectColumns = {
  id: pomodoroProjects.id,
  name: pomodoroProjects.name,
  ownerId: pomodoroProjects.userId,
  ownerName: users.name,
  ownerEmail: users.email,
  isPublic: pomodoroProjects.isPublic,
  targetHours: pomodoroProjects.targetHours,
  targetPeriod: pomodoroProjects.targetPeriod,
  archivedAt: pomodoroProjects.archivedAt,
  createdAt: pomodoroProjects.createdAt,
  taskCount: projectTaskCount,
  focusSeconds: projectFocusSeconds,
  timezone: pomodoroProfiles.timezone,
}

export async function listAdminProjects(query: {
  search: string
  user?: string
  state: (typeof PROJECT_STATE_FILTERS)[number]
  visibility: (typeof PROJECT_VISIBILITY_FILTERS)[number]
  target: (typeof PROJECT_TARGET_FILTERS)[number]
  sort: ProjectSortColumn
  direction: "asc" | "desc"
  page: number
  pageSize: number
}) {
  const filters: SQL[] = []
  const search = query.search.trim()
  if (search) {
    const pattern = `%${search}%`
    const match = or(
      ilike(pomodoroProjects.name, pattern),
      ilike(users.name, pattern),
      ilike(users.email, pattern)
    )
    if (match) filters.push(match)
  }
  if (query.user) filters.push(eq(pomodoroProjects.userId, query.user))
  if (query.state === "live") filters.push(isNull(pomodoroProjects.archivedAt))
  if (query.state === "archived") filters.push(isNotNull(pomodoroProjects.archivedAt))
  if (query.visibility !== "all") filters.push(eq(pomodoroProjects.isPublic, query.visibility === "public"))
  if (query.target === "target") filters.push(isNotNull(pomodoroProjects.targetHours))
  if (query.target === "none") filters.push(isNull(pomodoroProjects.targetHours))
  const where = and(...filters)

  const direction = query.direction === "asc" ? asc : desc
  // Sorting by tasks or hours works the count out for every project the
  // filters let through; every other sort works it out for the page only.
  const sortColumn = {
    name: sql`lower(${pomodoroProjects.name})`,
    owner: users.name,
    tasks: projectTaskCount,
    hours: projectFocusSeconds,
    created: pomodoroProjects.createdAt,
  }[query.sort]

  const [rows, [totalRow]] = await Promise.all([
    db
      .select(projectColumns)
      .from(pomodoroProjects)
      .innerJoin(users, eq(users.id, pomodoroProjects.userId))
      .leftJoin(pomodoroProfiles, eq(pomodoroProfiles.userId, pomodoroProjects.userId))
      .where(where)
      .orderBy(direction(sortColumn), asc(pomodoroProjects.id))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db
      .select({ total: count() })
      .from(pomodoroProjects)
      .innerJoin(users, eq(users.id, pomodoroProjects.userId))
      .where(where),
  ])
  return { rows: await withPeriodProgress(rows), total: totalRow?.total ?? 0 }
}

export type AdminProjectRow = Awaited<ReturnType<typeof listAdminProjects>>["rows"][number]

/** How many of a project's newest tasks its window lists. */
const WINDOW_TASKS = 10

/** One project with its figures and its newest tasks, for the window. */
export async function loadAdminProject(projectId: string) {
  const [row] = await db
    .select(projectColumns)
    .from(pomodoroProjects)
    .innerJoin(users, eq(users.id, pomodoroProjects.userId))
    .leftJoin(pomodoroProfiles, eq(pomodoroProfiles.userId, pomodoroProjects.userId))
    .where(eq(pomodoroProjects.id, projectId))
    .limit(1)
  if (!row) throw new Error("PROJECT_NOT_FOUND")
  const [[project], recentTasks] = await Promise.all([
    withPeriodProgress([row]),
    // A carried copy is yesterday's task again, so it is left out here the
    // way the task count leaves it out.
    db
      .select({
        id: tasks.id,
        title: tasks.title,
        status: tasks.status,
        plannedDate: tasks.plannedDate,
        pomodoroCount: tasks.pomodoroCount,
      })
      .from(tasks)
      .where(and(eq(tasks.projectId, projectId), ne(tasks.status, "carried")))
      .orderBy(desc(tasks.plannedDate), desc(tasks.createdAt))
      .limit(WINDOW_TASKS),
  ])
  return { project, tasks: recentTasks }
}

export type AdminProject = Awaited<ReturnType<typeof loadAdminProject>>

/** The row a change starts from, locked, with the owner's handle. */
async function lockProject(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], projectId: string) {
  const [row] = await tx
    .select({
      id: pomodoroProjects.id,
      userId: pomodoroProjects.userId,
      name: pomodoroProjects.name,
      isPublic: pomodoroProjects.isPublic,
      targetHours: pomodoroProjects.targetHours,
      targetPeriod: pomodoroProjects.targetPeriod,
      archivedAt: pomodoroProjects.archivedAt,
      handle: pomodoroProfiles.handle,
    })
    .from(pomodoroProjects)
    .leftJoin(pomodoroProfiles, eq(pomodoroProfiles.userId, pomodoroProjects.userId))
    .where(eq(pomodoroProjects.id, projectId))
    .for("update", { of: pomodoroProjects })
  if (!row) throw new Error("PROJECT_NOT_FOUND")
  return row
}

/**
 * Saves an admin's new name or target for a project, with the same rules as
 * the owner's own settings window: up to 60 characters, unique among the
 * owner's live projects ignoring case (the database's own index), and whole
 * hours from 1 to 744 or no target. Null clears the target.
 *
 * Only a real change is written, logged and told to the owner, in one
 * transaction. A save that changes nothing writes nothing.
 */
export async function updateAdminProject({
  projectId,
  name,
  target,
  actorUserId,
}: {
  projectId: string
  name: string
  target: ProjectTarget | null
  actorUserId: string
}) {
  try {
    const result = await db.transaction(async (tx) => {
      const before = await lockProject(tx, projectId)
      const renamed = before.name !== name
      const retargeted =
        (before.targetHours ?? null) !== (target?.hours ?? null) ||
        (before.targetPeriod ?? null) !== (target?.period ?? null)
      if (!renamed && !retargeted) return { changed: false, before }
      await tx
        .update(pomodoroProjects)
        .set({
          name,
          targetHours: target?.hours ?? null,
          targetPeriod: target?.period ?? null,
          updatedAt: new Date(),
        })
        .where(eq(pomodoroProjects.id, projectId))
      await tx.insert(pomodoroAuditLogs).values({
        actorUserId,
        action: "edit",
        resource: "projects",
        recordIds: [projectId],
      })
      await writeNotices(
        tx,
        ownerNotice(
          before.userId,
          actorUserId,
          "project_changed",
          projectChangedMessage(before.name, { name: renamed ? name : undefined, target: retargeted })
        )
      )
      return { changed: true, before }
    })
    if (result.changed && result.before.isPublic) forgetPublicProfile(result.before.handle)
    return { changed: result.changed }
  } catch (error) {
    if (isDuplicateName(error)) throw new Error("PROJECT_NAME_TAKEN")
    throw error
  }
}

/**
 * Archives a project or brings it back, as the owner's own Archive button
 * does, and tells the owner. Bringing one back is refused when the owner has
 * since made a live project with the same name, the same as for the owner.
 */
export async function setAdminProjectArchived({
  projectId,
  archived,
  actorUserId,
}: {
  projectId: string
  archived: boolean
  actorUserId: string
}) {
  try {
    const result = await db.transaction(async (tx) => {
      const before = await lockProject(tx, projectId)
      if (Boolean(before.archivedAt) === archived) return { changed: false, before }
      await tx
        .update(pomodoroProjects)
        .set({ archivedAt: archived ? new Date() : null, updatedAt: new Date() })
        .where(eq(pomodoroProjects.id, projectId))
      await tx.insert(pomodoroAuditLogs).values({
        actorUserId,
        action: archived ? "archive" : "unarchive",
        resource: "projects",
        recordIds: [projectId],
      })
      await writeNotices(
        tx,
        ownerNotice(before.userId, actorUserId, "project_changed", projectChangedMessage(before.name, { archived }))
      )
      return { changed: true, before }
    })
    if (result.changed && result.before.isPublic) forgetPublicProfile(result.before.handle)
    return { changed: result.changed }
  } catch (error) {
    if (isDuplicateName(error)) throw new Error("PROJECT_NAME_TAKEN")
    throw error
  }
}

/**
 * Deletes projects outright. Their tasks and repeating-task rules stay, with
 * no project, through the `on delete set null` on both columns, so every
 * hour stays in the owner's History under "No project". Each owner is told
 * once per project, without naming the admin, unless the admin is the owner.
 */
export async function deleteAdminProjects({ ids, actorUserId }: { ids: string[]; actorUserId: string }) {
  const result = await db.transaction(async (tx) => {
    const projects = await tx
      .select({
        id: pomodoroProjects.id,
        userId: pomodoroProjects.userId,
        name: pomodoroProjects.name,
        isPublic: pomodoroProjects.isPublic,
        handle: pomodoroProfiles.handle,
      })
      .from(pomodoroProjects)
      .leftJoin(pomodoroProfiles, eq(pomodoroProfiles.userId, pomodoroProjects.userId))
      .where(inArray(pomodoroProjects.id, ids))
      .for("update", { of: pomodoroProjects })
    const found = projects.map((project) => project.id)
    if (!found.length) return { deleted: [] as string[], skipped: ids, projects }
    await writeNotices(
      tx,
      projects.flatMap((project) =>
        ownerNotice(project.userId, actorUserId, "project_deleted", projectDeletedMessage(project.name))
      )
    )
    await tx.delete(pomodoroProjects).where(inArray(pomodoroProjects.id, found))
    await tx.insert(pomodoroAuditLogs).values({ actorUserId, action: "delete", resource: "projects", recordIds: found })
    return { deleted: found, skipped: ids.filter((id) => !found.includes(id)), projects }
  })
  for (const project of result.projects) if (project.isPublic) forgetPublicProfile(project.handle)
  return { deleted: result.deleted, skipped: result.skipped }
}
