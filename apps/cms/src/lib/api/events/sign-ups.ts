import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  SIGN_UP_EMAIL_MAX,
  SIGN_UP_NAME_MAX,
} from "@/lib/events/sign-up-fields"
import { requestIp, requireAppOrigin } from "@/server/auth/origin"
import { findCurrentUser } from "@/server/auth/security"
import { visitorSite } from "@/server/directory/public"
import { eventsAccessFor } from "@/server/events/public"
import {
  listSignUps,
  removeSignUp,
  signUpForEvent,
  type EventSignUp,
} from "@/server/events/sign-ups"
import { adminPost } from "@/server/guards"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

import { createErrorMessage } from "../error-message"

/**
 * The sign-up box's door on the event page, and Admin → Events' door for
 * taking somebody off the list.
 *
 * The public one is open to anybody, which is the feature, and is written
 * down in `src/app/open-endpoints.ts`. It checks for itself rather than
 * trusting the page: the site comes from the address, the Events page's
 * switch is read, and the request must come from this app's own pages.
 */

/** The fallback when something unexpected fails, never the server's words. */
export const getSignUpErrorMessage = createErrorMessage(
  {},
  "That did not go through. Please try again."
)

const signUpFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      eventId: z.string().min(1).max(36),
      // A little over each column, so a long answer is cut rather than
      // refused with a message about a schema.
      name: z.string().max(SIGN_UP_NAME_MAX * 2),
      email: z.string().max(SIGN_UP_EMAIL_MAX * 2),
      trap: z.string().max(500),
    })
  )
  .handler(
    async ({
      data,
    }): Promise<{ done: true } | { done: false; problem: string }> => {
      // No guard can say "anybody, but only from our own pages", so this is
      // the same check every guarded POST runs.
      requireAppOrigin()

      const site = await visitorSite()
      const open =
        site &&
        (await eventsAccessFor(site.id, async () =>
          Boolean(await findCurrentUser().catch(() => null))
        ))
      if (!site || !open) {
        return { done: false, problem: "This event is not taking sign-ups." }
      }
      // A bot is told it worked, so it learns nothing, and nothing is kept.
      if (data.trap.trim()) return { done: true }

      const result = await signUpForEvent(
        site.id,
        data.eventId,
        { name: data.name, email: data.email },
        { ip: requestIp() }
      )
      return result.outcome === "signed-up"
        ? { done: true }
        : { done: false, problem: result.problem }
    }
  )

/**
 * Signs a visitor up. A refusal comes back as words for them, like "Sorry,
 * this event is full."
 */
export function signUp(input: {
  eventId: string
  name: string
  email: string
  trap: string
}) {
  return signUpFn({ data: input })
}

const removeSignUpFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      eventId: z.string().min(1).max(36),
      signUpId: z.string().min(1).max(36),
    })
  )
  .handler(async ({ data, context }): Promise<EventSignUp[]> => {
    const site = await workspaceIdForRequest(context.user.id)
    await removeSignUp(site, data.signUpId)
    return listSignUps(site, data.eventId)
  })

/** Takes somebody off an event's list and answers with the list as it is now. */
export function removeEventSignUp(input: {
  eventId: string
  signUpId: string
}) {
  return removeSignUpFn({ data: input })
}
