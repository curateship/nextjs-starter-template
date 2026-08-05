import { createServerFn } from "@tanstack/react-start"
import { requireAppOrigin } from "@/server/origin"
import { getSessionToken } from "@/server/security"
import { adminPost } from "@/server/guards"
import { startViewingAs, stopViewingAs } from "@/server/view-as"
import { createErrorMessage } from "./error-message"
import { z } from "zod"

/** Who an admin is currently looking at the app as. */
export type ViewingAs = {
  userId: string
  name: string
  email: string
}

export const getViewAsErrorMessage = createErrorMessage(
  {
    USER_NOT_FOUND: "That account no longer exists.",
    VIEW_AS_SELF: "You are already yourself.",
    VIEW_AS_ADMIN: "You cannot view the app as another admin.",
    VIEW_AS_SUSPENDED:
      "That account is suspended, so there is nothing to look at. Unsuspend it first.",
    VIEW_AS_NOT_ACTIVE: "You are not viewing the app as anybody.",
  },
  "We could not change who you are viewing as. Please try again."
)

const startFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ userId: z.string().min(1).max(36) }))
  .handler(async ({ data, context }): Promise<ViewingAs> => {
    const token = getSessionToken()
    if (!token) {
      throw new Error("AUTH_REQUIRED")
    }

    return startViewingAs(context.user.id, token, data.userId)
  })

/**
 * Exiting is not behind `requireAdmin` on purpose: while the view is on, the
 * app treats the caller as the member, so an admin check here would be a door
 * that locks from the inside. The session row is the guard — only the browser
 * holding the session that started this can end it.
 */
const stopFn = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ userId: string }> => {
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
