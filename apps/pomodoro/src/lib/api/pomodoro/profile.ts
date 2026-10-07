import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { userGet, userPost } from "@/server/guards"
import {
  loadAccountMenu as loadAccountMenuRow,
  loadOrCreateProfile,
  updateProfile as updateProfileRow,
} from "@/server/pomodoro/profile"
import { refreshMyRoom } from "@/server/pomodoro/rooms"

/**
 * The app profile: public display name, timezone, leaderboard opt-in, and
 * whether the people in a room with you see the task you are focusing on.
 * The account's own name, email, password and deletion stay with the
 * shell's account dialog.
 */

const profileSchema = z.object({
  publicDisplayName: z.string().trim().min(1).max(50).nullable(),
  timezone: z.string().min(1).max(80),
  leaderboardOptIn: z.boolean(),
  shareTaskInRooms: z.boolean(),
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
    const profile = await updateProfileRow(context.user.id, data)
    // The room you are in shows your task or stops showing it on its next
    // snapshot, so send one now rather than whenever the room next changes.
    // The profile is already saved, so a failed nudge only logs.
    try {
      await refreshMyRoom(context.user.id)
    } catch (error) {
      console.error("the room could not be told about a profile change", error)
    }
    return profile
  })

// What the header's account menu adds to the shell's user: the plan and the
// public page's address. Signed-in only; the layout never asks for a guest.
const loadAccountMenuFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => loadAccountMenuRow(context.user.id))

export const loadAccountMenu = () => loadAccountMenuFn()
export type AccountMenuFacts = Awaited<ReturnType<typeof loadAccountMenu>>
export const loadPomodoroProfile = (timezone: string) =>
  loadProfileFn({ data: { timezone } })
export const updatePomodoroProfile = (data: z.infer<typeof profileSchema>) =>
  updateProfileFn({ data })
