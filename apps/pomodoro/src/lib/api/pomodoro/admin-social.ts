import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "../error-message"
import { adminGet, adminPost } from "@/server/guards"
import {
  listAdminBlocks,
  listMostBlocked,
  type AdminBlockRow,
  type AdminMostBlockedRow,
} from "@/server/pomodoro/admin-blocks"
import {
  deleteAdminCheers,
  deleteAdminFollows,
  listAdminCheers,
  listAdminFollows,
  type AdminCheerRow,
  type AdminFollowRow,
} from "@/server/pomodoro/admin-follows"
import {
  deleteAdminGroups,
  listAdminGroups,
  loadAdminGroup,
  type AdminGroup,
  type AdminGroupRow,
} from "@/server/pomodoro/admin-groups"
import { readDashboardRowsPerPage } from "@/server/shell-settings"
import {
  ADMIN_PAGE_SIZE_MAX,
  BLOCK_TABS,
  FOLLOW_SORT_COLUMNS,
  FOLLOW_TABS,
  GROUP_SORT_COLUMNS,
  readUserFilter,
} from "@/lib/pomodoro/admin-lists"

/**
 * Follows and cheers, blocks, and focus groups in the admin (admin task 06,
 * parts 8, 9 and 11), every one behind `adminGet` or `adminPost`. Blocks are
 * read-only. See `workspace/docs/admin-members.md`.
 */
export type {
  AdminBlockRow,
  AdminCheerRow,
  AdminFollowRow,
  AdminGroup,
  AdminGroupRow,
  AdminMostBlockedRow,
}

export const getAdminSocialErrorMessage = createErrorMessage(
  { GROUP_NOT_FOUND: "That group is no longer there. The list has been refreshed." },
  "That did not work. Please try again."
)

const idsSchema = z.array(z.string().uuid()).min(1).max(ADMIN_PAGE_SIZE_MAX)
const userSchema = z
  .string()
  .optional()
  .transform((value) => readUserFilter(value))
const pageFields = {
  search: z.string().trim().max(120).default(""),
  user: userSchema,
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(5).max(ADMIN_PAGE_SIZE_MAX).default(25),
}

// ---------------------------------------------------------------------------
// Follows and cheers
// ---------------------------------------------------------------------------

const followsQuerySchema = z.object({
  tab: z.enum(FOLLOW_TABS).default("follows"),
  sort: z.enum(FOLLOW_SORT_COLUMNS).default("created"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  ...pageFields,
})
export type FollowsQuery = z.input<typeof followsQuerySchema>

async function readFollowsList(data: z.output<typeof followsQuerySchema>) {
  if (data.tab === "cheers") return { tab: "cheers" as const, ...(await listAdminCheers(data)) }
  return { tab: "follows" as const, ...(await listAdminFollows(data)) }
}

const listFollowsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(followsQuerySchema)
  .handler(({ data }) => readFollowsList(data))

const loadFollowsPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(followsQuerySchema.omit({ pageSize: true }))
  .handler(async ({ data }) => {
    const pageSize = await readDashboardRowsPerPage()
    return { list: await readFollowsList({ ...data, pageSize }), pageSize }
  })

const deleteFollowsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ tab: z.enum(FOLLOW_TABS), ids: idsSchema }))
  .handler(({ data, context }) =>
    data.tab === "cheers"
      ? deleteAdminCheers({ ids: data.ids, actorUserId: context.user.id })
      : deleteAdminFollows({ ids: data.ids, actorUserId: context.user.id })
  )

// ---------------------------------------------------------------------------
// Blocks, read-only
// ---------------------------------------------------------------------------

const blocksQuerySchema = z.object({ tab: z.enum(BLOCK_TABS).default("blocks"), ...pageFields })
export type BlocksQuery = z.input<typeof blocksQuerySchema>

async function readBlocksList(data: z.output<typeof blocksQuerySchema>) {
  if (data.tab === "most") return { tab: "most" as const, ...(await listMostBlocked(data)) }
  return { tab: "blocks" as const, ...(await listAdminBlocks(data)) }
}

const listBlocksFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(blocksQuerySchema)
  .handler(({ data }) => readBlocksList(data))

const loadBlocksPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(blocksQuerySchema.omit({ pageSize: true }))
  .handler(async ({ data }) => {
    const pageSize = await readDashboardRowsPerPage()
    return { list: await readBlocksList({ ...data, pageSize }), pageSize }
  })

// ---------------------------------------------------------------------------
// Focus groups
// ---------------------------------------------------------------------------

const groupsQuerySchema = z.object({
  sort: z.enum(GROUP_SORT_COLUMNS).default("created"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  ...pageFields,
})
export type GroupsQuery = z.input<typeof groupsQuerySchema>

const listGroupsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(groupsQuerySchema)
  .handler(({ data }) => listAdminGroups(data))

const loadGroupsPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(groupsQuerySchema.omit({ pageSize: true }))
  .handler(async ({ data }) => {
    const pageSize = await readDashboardRowsPerPage()
    return { list: await listAdminGroups({ ...data, pageSize }), pageSize }
  })

const loadGroupFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ groupId: z.string().uuid() }))
  .handler(({ data }) => loadAdminGroup(data.groupId))

const deleteGroupsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ ids: idsSchema }))
  .handler(({ data, context }) => deleteAdminGroups({ ids: data.ids, actorUserId: context.user.id }))

export const listPomodoroFollows = (data: FollowsQuery) => listFollowsFn({ data })
export const loadPomodoroFollowsPage = (data: Omit<FollowsQuery, "pageSize">) => loadFollowsPageFn({ data })
export const deletePomodoroFollows = (tab: (typeof FOLLOW_TABS)[number], ids: string[]) =>
  deleteFollowsFn({ data: { tab, ids } })
export const listPomodoroBlocks = (data: BlocksQuery) => listBlocksFn({ data })
export const loadPomodoroBlocksPage = (data: Omit<BlocksQuery, "pageSize">) => loadBlocksPageFn({ data })
export const listPomodoroGroups = (data: GroupsQuery) => listGroupsFn({ data })
export const loadPomodoroGroupsPage = (data: Omit<GroupsQuery, "pageSize">) => loadGroupsPageFn({ data })
export const loadPomodoroGroup = (groupId: string) => loadGroupFn({ data: { groupId } })
export const deletePomodoroGroups = (ids: string[]) => deleteGroupsFn({ data: { ids } })
