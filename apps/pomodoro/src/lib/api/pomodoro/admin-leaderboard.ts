import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "../error-message"
import { adminGet, adminPost } from "@/server/guards"
import {
  listAdminBoard,
  listBoardHidden,
  setBoardHidden,
  type AdminBoardHiddenRow,
  type AdminBoardRow,
} from "@/server/pomodoro/admin-leaderboard"
import { readDashboardRowsPerPage } from "@/server/shell-settings"
import { ADMIN_PAGE_SIZE_MAX, LEADERBOARD_TABS } from "@/lib/pomodoro/admin-lists"
import { LEADERBOARD_WINDOWS } from "@/lib/pomodoro/leaderboard-windows"

/**
 * The leaderboard in the admin (admin task 06, part 6), every door behind
 * `adminGet` or `adminPost`. See `workspace/docs/leaderboard.md`.
 */
export type { AdminBoardHiddenRow, AdminBoardRow }

export const getAdminLeaderboardErrorMessage = createErrorMessage({}, "That did not work. Please try again.")

const querySchema = z.object({
  tab: z.enum(LEADERBOARD_TABS).default("board"),
  window: z.enum(LEADERBOARD_WINDOWS).default("week"),
  search: z.string().trim().max(120).default(""),
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(5).max(ADMIN_PAGE_SIZE_MAX).default(25),
})
export type LeaderboardQuery = z.input<typeof querySchema>

async function readList(data: z.output<typeof querySchema>) {
  if (data.tab === "hidden") return { tab: "hidden" as const, ...(await listBoardHidden(data)) }
  return { tab: "board" as const, ...(await listAdminBoard(data)) }
}

const listFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(querySchema)
  .handler(({ data }) => readList(data))

const loadPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(querySchema.omit({ pageSize: true }))
  .handler(async ({ data }) => {
    const pageSize = await readDashboardRowsPerPage()
    return { list: await readList({ ...data, pageSize }), pageSize }
  })

const setHiddenFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      userIds: z.array(z.string().trim().min(1).max(36)).min(1).max(ADMIN_PAGE_SIZE_MAX),
      hidden: z.boolean(),
    })
  )
  .handler(({ data, context }) => setBoardHidden({ ...data, actorUserId: context.user.id }))

export const listPomodoroLeaderboard = (data: LeaderboardQuery) => listFn({ data })
export const loadPomodoroLeaderboardPage = (data: Omit<LeaderboardQuery, "pageSize">) => loadPageFn({ data })
export const setPomodoroBoardHidden = (userIds: string[], hidden: boolean) =>
  setHiddenFn({ data: { userIds, hidden } })
