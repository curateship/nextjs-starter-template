import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { userGet, userPost } from "@/server/guards"
import {
  loadOrCreateProfile,
  updateProfile as updateProfileRow,
} from "@/server/pomodoro/profile"

/**
 * The app profile: public display name, timezone, leaderboard opt-in.
 * The account's own name, email, password and deletion stay with the
 * shell's account dialog.
 */

const profileSchema = z.object({
  publicDisplayName: z.string().trim().min(1).max(50).nullable(),
  timezone: z.string().min(1).max(80),
  leaderboardOptIn: z.boolean(),
})

const loadProfileFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ timezone: z.string().min(1).max(60) }))
  .handler(async ({ data, context }) => {
    return loadOrCreateProfile(context.user.id, data.timezone)
  })

const updateProfileFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(profileSchema)
  .handler(async ({ data, context }) => {
    return updateProfileRow(context.user.id, data)
  })

export const loadPomodoroProfile = (timezone: string) =>
  loadProfileFn({ data: { timezone } })
export const updatePomodoroProfile = (data: z.infer<typeof profileSchema>) =>
  updateProfileFn({ data })
