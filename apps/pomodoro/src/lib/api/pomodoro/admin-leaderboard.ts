import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { adminPost } from "@/server/guards"
import { setBoardHidden } from "@/server/pomodoro/admin-leaderboard"
import { ADMIN_PAGE_SIZE_MAX } from "@/lib/pomodoro/admin-lists"

/**
 * Taking somebody off the leaderboard and putting them back (admin task 06,
 * part 6), behind `adminPost`. The admin's Leaderboard list went on 13 Nov
 * 2026 (Tyler: "we dont need the focus and leaderboard tab"); the switch
 * lives in the member's ⋮ on Flowfly. See `workspace/docs/leaderboard.md`.
 */

const setHiddenFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      userIds: z.array(z.string().trim().min(1).max(36)).min(1).max(ADMIN_PAGE_SIZE_MAX),
      hidden: z.boolean(),
    })
  )
  .handler(({ data, context }) => setBoardHidden({ ...data, actorUserId: context.user.id }))

export const setPomodoroBoardHidden = (userIds: string[], hidden: boolean) =>
  setHiddenFn({ data: { userIds, hidden } })
