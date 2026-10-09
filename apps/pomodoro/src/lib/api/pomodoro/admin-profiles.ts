import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "../error-message"
import { adminGet, adminPost } from "@/server/guards"
import {
  listAdminProfiles,
  loadAdminProfile,
  saveAdminProfile,
  type AdminProfile,
  type AdminProfileRow,
} from "@/server/pomodoro/admin-profiles"
import { readDashboardRowsPerPage } from "@/server/shell-settings"
import {
  ADMIN_PAGE_SIZE_MAX,
  PROFILE_SORT_COLUMNS,
  PROFILE_VISIBILITY_FILTERS,
} from "@/lib/pomodoro/admin-lists"
import {
  BIO_MAX_LENGTH,
  HANDLE_MAX_LENGTH,
  HANDLE_RESERVED_MESSAGE,
  HANDLE_SHAPE_MESSAGE,
  HANDLE_TAKEN_MESSAGE,
} from "@/lib/pomodoro/public-profile"

/**
 * Public profiles in the admin (admin task 06, part 2), every door behind
 * `adminGet` or `adminPost`. See `workspace/docs/admin-members.md`.
 */
export type { AdminProfile, AdminProfileRow }

export const getAdminProfileErrorMessage = createErrorMessage(
  {
    PROFILE_NOT_FOUND: "That profile is no longer there. The list has been refreshed.",
    INVALID_HANDLE: HANDLE_SHAPE_MESSAGE,
    RESERVED_HANDLE: HANDLE_RESERVED_MESSAGE,
    HANDLE_TAKEN: HANDLE_TAKEN_MESSAGE,
  },
  "That did not work. Please try again."
)

const querySchema = z.object({
  search: z.string().trim().max(120).default(""),
  visibility: z.enum(PROFILE_VISIBILITY_FILTERS).default("all"),
  sort: z.enum(PROFILE_SORT_COLUMNS).default("updated"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(5).max(ADMIN_PAGE_SIZE_MAX).default(25),
})
export type ProfilesQuery = z.input<typeof querySchema>

const listFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(querySchema)
  .handler(({ data }) => listAdminProfiles(data))

const loadPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(querySchema.omit({ pageSize: true }))
  .handler(async ({ data }) => {
    const pageSize = await readDashboardRowsPerPage()
    return { list: await listAdminProfiles({ ...data, pageSize }), pageSize }
  })

const userIdSchema = z.string().trim().min(1).max(36)

const loadOneFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ userId: userIdSchema }))
  .handler(({ data }) => loadAdminProfile(data.userId))

const saveFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      userId: userIdSchema,
      handle: z.string().trim().toLowerCase().min(1).max(HANDLE_MAX_LENGTH),
      publicDisplayName: z.string().trim().max(50).nullable(),
      bio: z.string().trim().max(BIO_MAX_LENGTH).nullable(),
    })
  )
  .handler(({ data, context }) => saveAdminProfile({ ...data, actorUserId: context.user.id }))

export const listPomodoroProfiles = (data: ProfilesQuery) => listFn({ data })
export const loadPomodoroProfilesPage = (data: Omit<ProfilesQuery, "pageSize">) => loadPageFn({ data })
export const loadPomodoroAdminProfile = (userId: string) => loadOneFn({ data: { userId } })
export const savePomodoroAdminProfile = (data: {
  userId: string
  handle: string
  publicDisplayName: string | null
  bio: string | null
}) => saveFn({ data })
