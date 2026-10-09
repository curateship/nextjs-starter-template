import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "../error-message"
import { adminGet, adminPost } from "@/server/guards"
import {
  ADMIN_PAGE_SIZE_MAX,
  FOCUS_SORT_COLUMNS,
  REPORT_SORT_COLUMNS,
  REPORT_STATUS_FILTERS,
  REPORT_STATUSES,
  ROOM_PHASE_FILTERS,
  ROOM_REPEAT_SORT_COLUMNS,
  ROOM_REPEAT_STATUS_FILTERS,
  ROOM_SORT_COLUMNS,
  ROOM_VISIBILITY_FILTERS,
  SESSION_MODE_FILTERS,
  SESSION_SORT_COLUMNS,
  SESSION_STATUS_FILTERS,
  TASK_REPEAT_SORT_COLUMNS,
  TASK_SORT_COLUMNS,
  TASK_STATUS_FILTERS,
  type ReportStatus,
} from "@/lib/pomodoro/admin-lists"
import {
  listAdminFocusUsers,
  listAdminReports,
  listAdminRoomRepeats,
  listAdminRooms,
  listAdminSessions,
  listAdminTaskRepeats,
  listAdminTasks,
  reviewRoomReports,
  type AdminFocusRow,
  type AdminReportRow,
  type AdminRoomRepeatRow,
  type AdminRoomRow,
  type AdminSessionRow,
  type AdminTaskRepeatRow,
  type AdminTaskRow,
} from "@/server/pomodoro/admin"
import {
  clearAdminFocusData,
  deleteAdminReports,
  deleteAdminRoomRepeats,
  deleteAdminRooms,
  deleteAdminSessions,
  deleteAdminTaskRepeats,
  deleteAdminTasks,
  previewRoomDeletion,
  type AdminDeleteResult,
} from "@/server/pomodoro/admin-deletes"
import { notifyRoom } from "@/server/pomodoro/rooms"
import {
  forgetHiddenProfiles,
  setProfilesHidden,
} from "@/server/pomodoro/profile-reports"
import { readDashboardRowsPerPage } from "@/server/shell-settings"

/**
 * The operator pages' doors. Every one is behind `adminGet` or `adminPost`, so
 * a member calling these by hand is refused whatever the sidebar shows them.
 *
 * Types only are re-exported: a runtime value out of `@/server/*` would drag
 * the database driver into the browser bundle.
 */
export type {
  AdminDeleteResult,
  AdminFocusRow,
  AdminReportRow,
  AdminRoomRepeatRow,
  AdminRoomRow,
  AdminSessionRow,
  AdminTaskRepeatRow,
  AdminTaskRow,
}

export const getPomodoroAdminErrorMessage = createErrorMessage(
  {
    REPORT_UNCHANGED:
      "That report had already been decided, or is no longer there. The list has been refreshed.",
  },
  "That did not work. Please try again."
)

/** Shared by every list: where in the results, and which way round. */
const pageSchema = {
  search: z.string().trim().max(120).default(""),
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(5).max(ADMIN_PAGE_SIZE_MAX).default(25),
  direction: z.enum(["asc", "desc"]).default("desc"),
}

/** An account id, or nothing. Shaped only — the list is admin-only anyway. */
const userIdSchema = z.string().trim().min(1).max(36).nullable().default(null)

const focusQuerySchema = z.object({
  ...pageSchema,
  sort: z.enum(FOCUS_SORT_COLUMNS).default("focus"),
})

const taskQuerySchema = z.object({
  ...pageSchema,
  status: z.enum(TASK_STATUS_FILTERS).default("all"),
  userId: userIdSchema,
  sort: z.enum(TASK_SORT_COLUMNS).default("created"),
})

const sessionQuerySchema = z.object({
  ...pageSchema,
  mode: z.enum(SESSION_MODE_FILTERS).default("all"),
  status: z.enum(SESSION_STATUS_FILTERS).default("all"),
  userId: userIdSchema,
  sort: z.enum(SESSION_SORT_COLUMNS).default("started"),
})

const roomQuerySchema = z.object({
  ...pageSchema,
  phase: z.enum(ROOM_PHASE_FILTERS).default("all"),
  visibility: z.enum(ROOM_VISIBILITY_FILTERS).default("all"),
  sort: z.enum(ROOM_SORT_COLUMNS).default("created"),
})

const reportQuerySchema = z.object({
  ...pageSchema,
  status: z.enum(REPORT_STATUS_FILTERS).default("all"),
  sort: z.enum(REPORT_SORT_COLUMNS).default("created"),
  person: z.string().min(1).max(36).optional(),
})

const roomRepeatQuerySchema = z.object({
  ...pageSchema,
  status: z.enum(ROOM_REPEAT_STATUS_FILTERS).default("all"),
  sort: z.enum(ROOM_REPEAT_SORT_COLUMNS).default("created"),
})

const taskRepeatQuerySchema = z.object({
  ...pageSchema,
  userId: userIdSchema,
  sort: z.enum(TASK_REPEAT_SORT_COLUMNS).default("created"),
})

export type PomodoroFocusQuery = z.input<typeof focusQuerySchema>
export type PomodoroTaskQuery = z.input<typeof taskQuerySchema>
export type PomodoroSessionQuery = z.input<typeof sessionQuerySchema>
export type PomodoroRoomQuery = z.input<typeof roomQuerySchema>
export type PomodoroReportQuery = z.input<typeof reportQuerySchema>
export type PomodoroRoomRepeatQuery = z.input<typeof roomRepeatQuerySchema>
export type PomodoroTaskRepeatQuery = z.input<typeof taskRepeatQuerySchema>

const listFocusUsersFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(focusQuerySchema)
  .handler(({ data }) => listAdminFocusUsers(data))

const listTasksFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(taskQuerySchema)
  .handler(({ data }) => listAdminTasks(data))

const listSessionsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(sessionQuerySchema)
  .handler(({ data }) => listAdminSessions(data))

const listRoomsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(roomQuerySchema)
  .handler(({ data }) => listAdminRooms(data))

const listReportsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(reportQuerySchema)
  .handler(({ data }) => listAdminReports(data))

const listRoomRepeatsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(roomRepeatQuerySchema)
  .handler(({ data }) => listAdminRoomRepeats(data))

const listTaskRepeatsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(taskRepeatQuerySchema)
  .handler(({ data }) => listAdminTaskRepeats(data))

/**
 * The first page of each list, for the route loader.
 *
 * The loader cannot know the configured rows-per-page without a second round
 * trip, so each of these reads it and sends it back with the rows. That is
 * what keeps the table and the footer's "1-25 of N" agreeing on first paint,
 * the same way the shell's own admin pages do it.
 */
const loadFocusPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(focusQuerySchema.omit({ pageSize: true }))
  .handler(async ({ data }) => {
    const pageSize = await readDashboardRowsPerPage()
    return { list: await listAdminFocusUsers({ ...data, pageSize }), pageSize }
  })

const loadTasksPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(taskQuerySchema.omit({ pageSize: true }))
  .handler(async ({ data }) => {
    const pageSize = await readDashboardRowsPerPage()
    return { list: await listAdminTasks({ ...data, pageSize }), pageSize }
  })

const loadSessionsPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(sessionQuerySchema.omit({ pageSize: true }))
  .handler(async ({ data }) => {
    const pageSize = await readDashboardRowsPerPage()
    return { list: await listAdminSessions({ ...data, pageSize }), pageSize }
  })

const loadRoomsPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(roomQuerySchema.omit({ pageSize: true }))
  .handler(async ({ data }) => {
    const pageSize = await readDashboardRowsPerPage()
    return { list: await listAdminRooms({ ...data, pageSize }), pageSize }
  })

const loadReportsPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(reportQuerySchema.omit({ pageSize: true }))
  .handler(async ({ data }) => {
    const pageSize = await readDashboardRowsPerPage()
    return { list: await listAdminReports({ ...data, pageSize }), pageSize }
  })

const loadRoomRepeatsPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(roomRepeatQuerySchema.omit({ pageSize: true }))
  .handler(async ({ data }) => {
    const pageSize = await readDashboardRowsPerPage()
    return { list: await listAdminRoomRepeats({ ...data, pageSize }), pageSize }
  })

const loadTaskRepeatsPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(taskRepeatQuerySchema.omit({ pageSize: true }))
  .handler(async ({ data }) => {
    const pageSize = await readDashboardRowsPerPage()
    return { list: await listAdminTaskRepeats({ ...data, pageSize }), pageSize }
  })

/**
 * One press, whether it came from a row's own button or from the toolbar over a
 * ticked selection. The ceiling matches the largest page an operator can ask
 * for, so a hand-written call cannot rewrite the whole queue in one request.
 */
const reviewReportsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      reportIds: z.array(z.string().uuid()).min(1).max(ADMIN_PAGE_SIZE_MAX),
      decision: z.enum(REPORT_STATUSES),
    })
  )
  .handler(({ data, context }) =>
    reviewRoomReports({ ...data, actorUserId: context.user.id })
  )

/**
 * Hide or restore the profiles behind a selection of reports.
 *
 * Hide is the only power an operator has over a profile. Tyler's call,
 * 2 Oct 2026: clearing a field, warning somebody and suspending an account
 * are three different powers that each need their own decision.
 */
const hideProfilesFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      reportIds: z.array(z.string().uuid()).min(1).max(ADMIN_PAGE_SIZE_MAX),
      hidden: z.boolean(),
    })
  )
  .handler(async ({ data, context }) => {
    const result = await setProfilesHidden({
      ...data,
      actorUserId: context.user.id,
    })
    // A hide has to take effect on the very next request, not when the held
    // page expires.
    forgetHiddenProfiles(result.handles ?? [])
    return { changed: result.changed, skipped: result.skipped }
  })

/**
 * The ids one delete press covers: the rows ticked on the page on screen, so
 * never more than the largest page. Rooms, sessions, tasks, reports and rules
 * are uuids; Focus data is keyed by account id, which is not.
 */
const deleteIdsSchema = z.array(z.string().uuid()).min(1).max(ADMIN_PAGE_SIZE_MAX)
const accountIdsSchema = z
  .array(z.string().trim().min(1).max(36))
  .min(1)
  .max(ADMIN_PAGE_SIZE_MAX)

const previewRoomDeletionFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ ids: deleteIdsSchema }))
  .handler(({ data }) => previewRoomDeletion(data.ids))

const deleteRoomsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ ids: deleteIdsSchema }))
  .handler(async ({ data, context }) => {
    const result = await deleteAdminRooms({
      roomIds: data.ids,
      actorUserId: context.user.id,
    })
    // After the commit, so an open room's stream reads the room as gone and
    // tells the people in it, rather than reading it a moment too early. The
    // rooms are already gone by now, so a nudge that fails is logged rather
    // than reported as a failed delete: those screens find out on their next
    // reconnect instead.
    const nudges = await Promise.allSettled(
      result.deleted.map((id) => notifyRoom(id, "phase"))
    )
    for (const nudge of nudges) {
      if (nudge.status === "rejected")
        console.error("deleted room could not tell its open screens", nudge.reason)
    }
    return result
  })

const deleteSessionsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ ids: deleteIdsSchema }))
  .handler(({ data, context }) =>
    deleteAdminSessions({ sessionIds: data.ids, actorUserId: context.user.id })
  )

const deleteTasksFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ ids: deleteIdsSchema }))
  .handler(({ data, context }) =>
    deleteAdminTasks({ taskIds: data.ids, actorUserId: context.user.id })
  )

const deleteReportsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ ids: deleteIdsSchema }))
  .handler(({ data, context }) =>
    deleteAdminReports({ reportIds: data.ids, actorUserId: context.user.id })
  )

const clearFocusDataFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ ids: accountIdsSchema }))
  .handler(({ data, context }) =>
    clearAdminFocusData({ userIds: data.ids, actorUserId: context.user.id })
  )

const deleteRoomRepeatsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ ids: deleteIdsSchema }))
  .handler(({ data, context }) =>
    deleteAdminRoomRepeats({ repeatIds: data.ids, actorUserId: context.user.id })
  )

const deleteTaskRepeatsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ ids: deleteIdsSchema }))
  .handler(({ data, context }) =>
    deleteAdminTaskRepeats({ repeatIds: data.ids, actorUserId: context.user.id })
  )

export const listPomodoroFocusUsers = (data: PomodoroFocusQuery) =>
  listFocusUsersFn({ data })
export const loadPomodoroFocusPage = (
  data: Omit<PomodoroFocusQuery, "pageSize">
) => loadFocusPageFn({ data })

export const listPomodoroTasks = (data: PomodoroTaskQuery) =>
  listTasksFn({ data })
export const loadPomodoroTasksPage = (
  data: Omit<PomodoroTaskQuery, "pageSize">
) => loadTasksPageFn({ data })

export const listPomodoroSessions = (data: PomodoroSessionQuery) =>
  listSessionsFn({ data })
export const loadPomodoroSessionsPage = (
  data: Omit<PomodoroSessionQuery, "pageSize">
) => loadSessionsPageFn({ data })

export const listPomodoroRooms = (data: PomodoroRoomQuery) =>
  listRoomsFn({ data })
export const loadPomodoroRoomsPage = (
  data: Omit<PomodoroRoomQuery, "pageSize">
) => loadRoomsPageFn({ data })

export const listPomodoroReports = (data: PomodoroReportQuery) =>
  listReportsFn({ data })
export const loadPomodoroReportsPage = (
  data: Omit<PomodoroReportQuery, "pageSize">
) => loadReportsPageFn({ data })


export const reviewPomodoroReports = (
  reportIds: string[],
  decision: ReportStatus
) => reviewReportsFn({ data: { reportIds, decision } })

export const hidePomodoroProfiles = (reportIds: string[], hidden: boolean) =>
  hideProfilesFn({ data: { reportIds, hidden } })

export const listPomodoroRoomRepeats = (data: PomodoroRoomRepeatQuery) =>
  listRoomRepeatsFn({ data })
export const loadPomodoroRoomRepeatsPage = (
  data: Omit<PomodoroRoomRepeatQuery, "pageSize">
) => loadRoomRepeatsPageFn({ data })

export const listPomodoroTaskRepeats = (data: PomodoroTaskRepeatQuery) =>
  listTaskRepeatsFn({ data })
export const loadPomodoroTaskRepeatsPage = (
  data: Omit<PomodoroTaskRepeatQuery, "pageSize">
) => loadTaskRepeatsPageFn({ data })


export const previewPomodoroRoomDeletion = (ids: string[]) =>
  previewRoomDeletionFn({ data: { ids } })
export const deletePomodoroRooms = (ids: string[]) =>
  deleteRoomsFn({ data: { ids } })
export const deletePomodoroSessions = (ids: string[]) =>
  deleteSessionsFn({ data: { ids } })
export const deletePomodoroTasks = (ids: string[]) =>
  deleteTasksFn({ data: { ids } })
export const deletePomodoroReports = (ids: string[]) =>
  deleteReportsFn({ data: { ids } })
export const clearPomodoroFocusData = (ids: string[]) =>
  clearFocusDataFn({ data: { ids } })
export const deletePomodoroRoomRepeats = (ids: string[]) =>
  deleteRoomRepeatsFn({ data: { ids } })
export const deletePomodoroTaskRepeats = (ids: string[]) =>
  deleteTaskRepeatsFn({ data: { ids } })
