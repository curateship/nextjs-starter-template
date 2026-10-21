import { createFileRoute } from "@tanstack/react-router"

import { browserRedirect } from "@/server/auth/google"
import { findCurrentUser } from "@/server/auth/security"
import { ownAccount } from "@/server/dating/accounts"
import { finishCalendarConnect, takeCalendarHandshake } from "@/server/dating/google-calendar"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

/**
 * Connect Google Calendar, step two: Google sends the browser back here.
 *
 * The handshake cookie is read and cleared first, and Google's `state` has to
 * match it, so a link somebody else built cannot connect their calendar to
 * this account. The member must still be signed in and own the profile that
 * asked, and the calendar is kept against that profile. Every exit goes back to the Dating
 * dashboard, with a word that opens its settings window and says how it went.
 */
export const Route = createFileRoute("/api/dating/google-calendar_/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const parameters = new URL(request.url).searchParams
        const handshake = takeCalendarHandshake(parameters.get("state"))
        if (parameters.get("error") === "access_denied") return browserRedirect("/admin/dating?google=denied")
        const code = parameters.get("code")
        if (!handshake || !code) return browserRedirect("/admin/dating?google=failed")
        const user = await findCurrentUser()
        if (!user) return browserRedirect("/login?redirect=/admin/dating")
        try {
          const account = await ownAccount(user.id, await workspaceIdForRequest(user.id), handshake.accountId)
          await finishCalendarConnect(account, code, handshake.verifier)
          return browserRedirect("/admin/dating?google=connected")
        } catch (error) {
          console.error("Google Calendar could not be connected", error)
          return browserRedirect("/admin/dating?google=failed")
        }
      },
    },
  },
})
