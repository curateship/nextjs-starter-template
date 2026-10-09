import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "../error-message"
import { adminGet, adminPost } from "@/server/guards"
import {
  listAdminAchievements,
  revokeAchievements,
  type AdminAchievementRow,
} from "@/server/pomodoro/admin-achievements"
import { readDashboardRowsPerPage } from "@/server/shell-settings"
import { ACHIEVEMENT_SORT_COLUMNS, ADMIN_PAGE_SIZE_MAX } from "@/lib/pomodoro/admin-lists"
import { ACHIEVEMENTS } from "@/lib/pomodoro/achievements"

/**
 * Earned badges in the admin (admin task 06, part 10), every door behind
 * `adminGet` or `adminPost`. See `workspace/docs/achievements.md`.
 */
export type { AdminAchievementRow }

export const getAdminAchievementErrorMessage = createErrorMessage({}, "That did not work. Please try again.")

const BADGE_IDS = ACHIEVEMENTS.map((badge) => badge.id) as [string, ...string[]]

const querySchema = z.object({
  search: z.string().trim().max(120).default(""),
  badgeId: z.enum(BADGE_IDS).optional(),
  userId: z.string().trim().min(1).max(36).optional(),
  sort: z.enum(ACHIEVEMENT_SORT_COLUMNS).default("earned"),
  direction: z.enum(["asc", "desc"]).default("desc"),
  page: z.number().int().min(1).max(10_000).default(1),
  pageSize: z.number().int().min(5).max(ADMIN_PAGE_SIZE_MAX).default(25),
})
export type AchievementsQuery = z.input<typeof querySchema>

const listFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(querySchema)
  .handler(({ data }) => listAdminAchievements(data))

const loadPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(querySchema.omit({ pageSize: true }))
  .handler(async ({ data }) => {
    const pageSize = await readDashboardRowsPerPage()
    return { list: await listAdminAchievements({ ...data, pageSize }), pageSize }
  })

const revokeFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ ids: z.array(z.string().uuid()).min(1).max(ADMIN_PAGE_SIZE_MAX) }))
  .handler(({ data, context }) => revokeAchievements({ ids: data.ids, actorUserId: context.user.id }))

export const listPomodoroAchievements = (data: AchievementsQuery) => listFn({ data })
export const loadPomodoroAchievementsPage = (data: Omit<AchievementsQuery, "pageSize">) => loadPageFn({ data })
export const revokePomodoroAchievements = (ids: string[]) => revokeFn({ data: { ids } })
