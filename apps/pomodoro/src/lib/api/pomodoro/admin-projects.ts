import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "../error-message"
import { adminGet, adminPost } from "@/server/guards"
import {
  deleteAdminProjects,
  listAdminProjects,
  loadAdminProject,
  setAdminProjectArchived,
  updateAdminProject,
  type AdminProject,
  type AdminProjectRow,
} from "@/server/pomodoro/admin-projects"
import { readDashboardRowsPerPage } from "@/server/shell-settings"
import {
  ADMIN_PAGE_SIZE_MAX,
  PROJECT_SORT_COLUMNS,
  PROJECT_STATE_FILTERS,
  PROJECT_TARGET_FILTERS,
  PROJECT_VISIBILITY_FILTERS,
  readUserFilter,
} from "@/lib/pomodoro/admin-lists"
import {
  PROJECT_NAME_MAX_LENGTH,
  TARGET_HOURS_MAX,
  targetPeriods,
  type ProjectTarget,
} from "@/lib/pomodoro/project-targets"

/**
 * Projects in the admin (admin task 07), every door behind `adminGet` or
 * `adminPost`. See `workspace/docs/admin-sections.md`.
 */
export type { AdminProject, AdminProjectRow }

export const getAdminProjectErrorMessage = createErrorMessage(
  {
    PROJECT_NOT_FOUND: "That project is no longer there. The list has been refreshed.",
    PROJECT_NAME_TAKEN: "The owner already has a live project with that name.",
  },
  "That did not work. Please try again."
)

const querySchema = z.object({
  search: z.string().trim().max(120).default(""),
  user: z
    .string()
    .optional()
    .transform((value) => readUserFilter(value)),
  state: z.enum(PROJECT_STATE_FILTERS).default("all"),
  visibility: z.enum(PROJECT_VISIBILITY_FILTERS).default("all"),
  target: z.enum(PROJECT_TARGET_FILTERS).default("all"),
  sort: z.enum(PROJECT_SORT_COLUMNS).default("created"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(5).max(ADMIN_PAGE_SIZE_MAX).default(25),
})
export type ProjectsQuery = z.input<typeof querySchema>

const projectIdSchema = z.string().uuid()

const listFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(querySchema)
  .handler(({ data }) => listAdminProjects(data))

const loadPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(querySchema.omit({ pageSize: true }))
  .handler(async ({ data }) => {
    const pageSize = await readDashboardRowsPerPage()
    return { list: await listAdminProjects({ ...data, pageSize }), pageSize }
  })

const loadOneFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ projectId: projectIdSchema }))
  .handler(({ data }) => loadAdminProject(data.projectId))

// The same rules as the owner's own settings window. Hours and period travel
// together, so the server never sees one without the other; null clears it.
const updateFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      projectId: projectIdSchema,
      name: z.string().trim().min(1).max(PROJECT_NAME_MAX_LENGTH),
      target: z
        .object({
          hours: z.number().int().min(1).max(TARGET_HOURS_MAX),
          period: z.enum(targetPeriods),
        })
        .nullable(),
    })
  )
  .handler(({ data, context }) => updateAdminProject({ ...data, actorUserId: context.user.id }))

const archiveFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ projectId: projectIdSchema, archived: z.boolean() }))
  .handler(({ data, context }) => setAdminProjectArchived({ ...data, actorUserId: context.user.id }))

const deleteFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ ids: z.array(projectIdSchema).min(1).max(ADMIN_PAGE_SIZE_MAX) }))
  .handler(({ data, context }) => deleteAdminProjects({ ids: data.ids, actorUserId: context.user.id }))

export const listPomodoroProjects = (data: ProjectsQuery) => listFn({ data })
export const loadPomodoroProjectsPage = (data: Omit<ProjectsQuery, "pageSize">) => loadPageFn({ data })
export const loadPomodoroAdminProject = (projectId: string) => loadOneFn({ data: { projectId } })
export const updatePomodoroAdminProject = (projectId: string, name: string, target: ProjectTarget | null) =>
  updateFn({ data: { projectId, name, target } })
export const setPomodoroAdminProjectArchived = (projectId: string, archived: boolean) =>
  archiveFn({ data: { projectId, archived } })
export const deletePomodoroProjects = (ids: string[]) => deleteFn({ data: { ids } })
