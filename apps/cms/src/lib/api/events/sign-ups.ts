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
  listWaitingList,
  removeSignUp,
  signUpForEvent,
  type EventSignUp,
  type EventWaitingPerson,
} from "@/server/events/sign-ups"
import { adminPost } from "@/server/guards"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

import { createErrorMessage } from "../error-message"

/**
 * The sign-up box's door on the event page, and Admin → Events' door for
 * taking somebody off the list or off the waiting list.
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
  .handler(async ({ data }): Promise<SignUpAnswer> => {
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
    if (data.trap.trim()) return { done: "signed-up" }

    const result = await signUpForEvent(
      site.id,
      data.eventId,
      { name: data.name, email: data.email },
      { ip: requestIp() }
    )
    switch (result.outcome) {
      case "signed-up":
        return { done: "signed-up" }
      case "waiting":
        return { done: "waiting", place: result.place }
      case "offered":
        return { done: "offered" }
      case "refused":
        return { done: false, problem: result.problem }
    }
  })

/**
 * What one visitor's sign-up did. Three of the four are a kind of yes: a seat,
 * a place in the queue, or a seat already being held for this address while
 * the link sits in its inbox.
 */
export type SignUpAnswer =
  | { done: "signed-up" }
  | { done: "waiting"; place: number }
  | { done: "offered" }
  | { done: false; problem: string }

/**
 * Signs a visitor up, or puts them on the waiting list when the event is
 * full. A refusal comes back as words for them, like "Sign-ups have closed."
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
  .handler(async ({ data, context }): Promise<EventLists> => {
    const site = await workspaceIdForRequest(context.user.id)
    await removeSignUp(site, data.signUpId)
    // Both lists, because removing somebody who is coming frees a seat that
    // the background pass is about to offer to somebody waiting, and the card
    // would otherwise show one of the two as it was a moment ago.
    const [signUps, waitingList] = await Promise.all([
      listSignUps(site, data.eventId),
      listWaitingList(site, data.eventId),
    ])
    return { signUps, waitingList }
  })

/** An event's two lists: who is coming, and who is waiting. */
export type EventLists = {
  signUps: EventSignUp[]
  waitingList: EventWaitingPerson[]
}

/**
 * Takes somebody off an event's list or its waiting list, and answers with
 * both lists as they are now.
 */
export function removeEventSignUp(input: {
  eventId: string
  signUpId: string
}) {
  return removeSignUpFn({ data: input })
}
