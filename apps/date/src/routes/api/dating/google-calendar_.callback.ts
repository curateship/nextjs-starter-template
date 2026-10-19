import { createFileRoute } from "@tanstack/react-router"

import { browserRedirect } from "@/server/auth/google"
import { findCurrentUser } from "@/server/auth/security"
import { finishCalendarConnect, takeCalendarHandshake } from "@/server/dating/google-calendar"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

/**
 * Connect Google Calendar, step two: Google sends the browser back here.
 *
 * The handshake cookie is read and cleared first, and Google's `state` has to
 * match it, so a link somebody else built cannot connect their calendar to
 * this account. The member must still be signed in, and the calendar is kept
 * against them and the site they are on. Every exit goes back to Settings,
 * Dating, with a word the tab turns into a message.
 */
export const Route = createFileRoute("/api/dating/google-calendar_/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const parameters = new URL(request.url).searchParams
        const verifier = takeCalendarHandshake(parameters.get("state"))
        if (parameters.get("error") === "access_denied") return browserRedirect("/admin/settings/dating?google=denied")
        const code = parameters.get("code")
        if (!verifier || !code) return browserRedirect("/admin/settings/dating?google=failed")
        const user = await findCurrentUser()
        if (!user) return browserRedirect("/login?redirect=/admin/settings/dating")
        try {
          await finishCalendarConnect(user.id, await workspaceIdForRequest(user.id), code, verifier)
          return browserRedirect("/admin/settings/dating?google=connected")
        } catch (error) {
          console.error("Google Calendar could not be connected", error)
          return browserRedirect("/admin/settings/dating?google=failed")
        }
      },
    },
  },
})
