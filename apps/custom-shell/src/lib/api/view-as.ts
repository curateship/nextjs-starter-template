import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

/** Who an admin is currently looking at the app as. */
export type ViewingAs = {
  userId: string
  name: string
  email: string
}

const viewAsErrorMessages: Record<string, string> = {
  FORBIDDEN: "You do not have access to that.",
  AUTH_REQUIRED: "Please sign in again.",
  USER_NOT_FOUND: "That account no longer exists.",
  VIEW_AS_SELF: "You are already yourself.",
  VIEW_AS_ADMIN: "You cannot view the app as another admin.",
  VIEW_AS_SUSPENDED:
    "That account is suspended, so there is nothing to look at. Unsuspend it first.",
  VIEW_AS_NOT_ACTIVE: "You are not viewing the app as anybody.",
}

export function getViewAsErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  const matched = Object.keys(viewAsErrorMessages).find((code) =>
    message.includes(code)
  )

  return matched
    ? viewAsErrorMessages[matched]
    : "We could not do that. Please try again."
}

const startFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ userId: z.string().min(1).max(36) }))
  .handler(async ({ data }): Promise<ViewingAs> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { getSessionToken, requireAdmin } = await import("@/server/security")
    const { startViewingAs } = await import("@/server/view-as")

    requireAppOrigin()
    const admin = await requireAdmin()
    const token = getSessionToken()
    if (!token) {
      throw new Error("AUTH_REQUIRED")
    }

    return startViewingAs(admin.id, token, data.userId)
  })

/**
 * Exiting is not behind `requireAdmin` on purpose: while the view is on, the
 * app treats the caller as the member, so an admin check here would be a door
 * that locks from the inside. The session row is the guard — only the browser
 * holding the session that started this can end it.
 */
const stopFn = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ userId: string }> => {
    const { requireAppOrigin } = await import("@/server/origin")
    const { getSessionToken } = await import("@/server/security")
    const { stopViewingAs } = await import("@/server/view-as")

    requireAppOrigin()
    const token = getSessionToken()
    if (!token) {
      throw new Error("AUTH_REQUIRED")
    }

    return stopViewingAs(token)
  }
)

export function startViewingAsMember(userId: string) {
  return startFn({ data: { userId } })
}

export function stopViewingAsMember() {
  return stopFn()
}
