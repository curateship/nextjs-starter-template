import { createFileRoute } from "@tanstack/react-router"

import { browserRedirect } from "@/server/auth/google"
import { findCurrentUser } from "@/server/auth/security"
import { requestAccount } from "@/server/dating/accounts"
import { googleCalendarAvailable, startCalendarConnect } from "@/server/dating/google-calendar"

/**
 * Connect Google Calendar, step one: send the signed-in member to Google, for
 * the profile open on the Dating dashboard. Part 15 of
 * "features/01-chats-and-replies". It writes nothing; the state it puts in a
 * cookie, with the profile, is the guard for step two.
 *
 * Outside `src/lib/api/`, so the shell's guard test does not walk it; the
 * session check below is its lock.
 */
export const Route = createFileRoute("/api/dating/google-calendar")({
  server: {
    handlers: {
      GET: async () => {
        const user = await findCurrentUser()
        if (!user) return browserRedirect("/login?redirect=/admin/dating")
        if (!googleCalendarAvailable()) return browserRedirect("/admin/dating?google=not-set-up")
        const account = await requestAccount(user.id)
        return browserRedirect(startCalendarConnect(account.id))
      },
    },
  },
})
