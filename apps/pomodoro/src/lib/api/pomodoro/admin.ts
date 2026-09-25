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
  ROOM_SORT_COLUMNS,
  ROOM_VISIBILITY_FILTERS,
  SESSION_MODE_FILTERS,
  SESSION_SORT_COLUMNS,
  SESSION_STATUS_FILTERS,
  TASK_SORT_COLUMNS,
  TASK_STATUS_FILTERS,
  type ReportStatus,
} from "@/lib/pomodoro/admin-lists"
import {
  listAdminFocusUsers,
  listAdminReports,
  listAdminRooms,
  listAdminSessions,
  listAdminTasks,
  loadAdminMediaUsage,
  reviewRoomReport,
  type AdminFocusRow,
  type AdminMediaUsage,
  type AdminReportRow,
  type AdminRoomRow,
  type AdminSessionRow,
  type AdminTaskRow,
} from "@/server/pomodoro/admin"
import { readDashboardRowsPerPage } from "@/server/shell-settings"

/**
 * The operator pages' doors. Every one is behind `adminGet` or `adminPost`, so
 * a member calling these by hand is refused whatever the sidebar shows them.
 *
 * Types only are re-exported: a runtime value out of `@/server/*` would drag
 * the database driver into the browser bundle.
 */
export type {
  AdminFocusRow,
  AdminMediaUsage,
  AdminReportRow,
  AdminRoomRow,
  AdminSessionRow,
  AdminTaskRow,
}

export const getPomodoroAdminErrorMessage = createErrorMessage(
  {
    REPORT_NOT_FOUND: "That report no longer exists.",
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
})

export type PomodoroFocusQuery = z.input<typeof focusQuerySchema>
export type PomodoroTaskQuery = z.input<typeof taskQuerySchema>
export type PomodoroSessionQuery = z.input<typeof sessionQuerySchema>
export type PomodoroRoomQuery = z.input<typeof roomQuerySchema>
export type PomodoroReportQuery = z.input<typeof reportQuerySchema>

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

const loadMediaUsageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(() => loadAdminMediaUsage())

const reviewReportFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      reportId: z.string().uuid(),
      decision: z.enum(REPORT_STATUSES),
    })
  )
  .handler(({ data, context }) =>
    reviewRoomReport({ ...data, actorUserId: context.user.id })
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

export const loadPomodoroMediaUsage = () => loadMediaUsageFn()

export const reviewPomodoroReport = (
  reportId: string,
  decision: ReportStatus
) => reviewReportFn({ data: { reportId, decision } })
