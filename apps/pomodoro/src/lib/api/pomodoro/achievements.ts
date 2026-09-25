import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { userGet } from "@/server/guards"
import { loadAchievementState } from "@/server/pomodoro/achievements"
import { userToday } from "@/server/pomodoro/profile"

/**
 * The badges panel's one endpoint, guarded with `userGet` like every other
 * read. Badges are private: this answers for the signed-in account and takes
 * no user id, so there is no address that reads somebody else's.
 *
 * There is no endpoint that awards a badge. Awarding happens on the paths
 * that change a counter (completing a focus, opening a room), so nothing a
 * browser sends can hand itself one.
 */

const timezoneSchema = z.object({ timezone: z.string().min(1).max(60) })

const loadAchievementsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(timezoneSchema)
  .handler(async ({ data, context }) => {
    const today = await userToday(context.user.id, data.timezone)
    return loadAchievementState(context.user.id, today)
  })

export const loadAchievements = (timezone: string) =>
  loadAchievementsFn({ data: { timezone } })
