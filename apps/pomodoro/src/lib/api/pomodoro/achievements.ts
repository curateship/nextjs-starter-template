import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { userGet } from "@/server/guards"
import { loadAchievementState } from "@/server/pomodoro/achievements"
import { loadOrCreateProfile } from "@/server/pomodoro/profile"
import { localDateFor } from "@/server/pomodoro/productivity"

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
    const profile = await loadOrCreateProfile(context.user.id, data.timezone)
    const state = await loadAchievementState(
      context.user.id,
      localDateFor(profile.timezone)
    )
    // The panel dates each badge in the account's timezone, not the
    // browser's, so it needs to know which one that is.
    return { ...state, timezone: profile.timezone }
  })

export const loadAchievements = (timezone: string) =>
  loadAchievementsFn({ data: { timezone } })
