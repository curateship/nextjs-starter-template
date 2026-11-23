import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { userGet, userPost } from "@/server/guards"
import { loadOrCreateProfile } from "@/server/pomodoro/profile"
import {
  disableStreakBadge,
  enableStreakBadge,
} from "@/server/pomodoro/streak-badge"

/**
 * Switching the public streak badge on and off.
 *
 * All three endpoints are guarded and act on the signed-in account only. None
 * of them takes a user id or a token from the browser: a badge is created for
 * you, or yours is cleared, and there is no address that touches someone
 * else's. The badge itself is served by a plain route, not from here, because
 * an `<img>` cannot call a server function.
 */

const timezoneSchema = z.object({
  timezone: z.string().min(1).max(60),
})

const loadStreakBadgeFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(timezoneSchema)
  .handler(async ({ data, context }) => {
    const profile = await loadOrCreateProfile(context.user.id, data.timezone)
    return { token: profile.streakBadgeToken }
  })

const enableStreakBadgeFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(timezoneSchema)
  .handler(async ({ data, context }) => {
    // The profile row has to exist before it can carry a secret, and someone
    // who never opened Settings may not have one yet.
    await loadOrCreateProfile(context.user.id, data.timezone)
    return { token: await enableStreakBadge(context.user.id) }
  })

const disableStreakBadgeFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .handler(async ({ context }) => {
    await disableStreakBadge(context.user.id)
    return { token: null }
  })

export const loadStreakBadge = (timezone: string) =>
  loadStreakBadgeFn({ data: { timezone } })
export const turnOnStreakBadge = (timezone: string) =>
  enableStreakBadgeFn({ data: { timezone } })
export const turnOffStreakBadge = () => disableStreakBadgeFn()
