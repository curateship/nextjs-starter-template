import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  OWNER_MESSAGE_MAX,
  OWNER_MESSAGE_NAME_MAX,
} from "@/lib/directory/field-lengths"
import { requestIp, requireAppOrigin } from "@/server/auth/origin"
import { findCurrentUser } from "@/server/auth/security"
import { enforceHumanCheck } from "@/server/auth/turnstile"
import { readPageVisibility } from "@/server/content/pages"
import { OWNER_MESSAGES_CLOSED } from "@/lib/directory/owner-message-sentences"
import {
  cleanOwnerMessageInput,
  countOwnerMessageAttempt,
  sendOwnerMessage,
} from "@/server/directory/owner-messages"
import { visitorSite } from "@/server/directory/public"

/**
 * The "Message the owner" form's door.
 *
 * Open to the whole internet, because the person asking whether a restaurant
 * takes a table of twelve has no account. It is written down in
 * `src/app/open-endpoints.ts` with its reason, and does its own checking:
 *
 * - the request has to come from this app's own pages;
 * - the human check, when the site has its keys;
 * - the site comes from the Host header, never the request body, and the
 *   directory has to be open to this visitor;
 * - three limits, because every message is two emails from the site's sender.
 *
 * It answers `{ sent: true }` and nothing else. The owner's address is never
 * in a response, an error included.
 */

const messageOwnerFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      listingId: z.string().min(1).max(36),
      name: z.string().max(OWNER_MESSAGE_NAME_MAX),
      email: z.string().max(255),
      message: z.string().max(OWNER_MESSAGE_MAX),
      humanCheckToken: z.string().max(4096).optional(),
    })
  )
  .handler(async ({ data }): Promise<{ sent: true }> => {
    // Guarded by hand because there is no guard for "anybody, but only from our
    // own pages". This is the same check every `adminPost` runs.
    requireAppOrigin()
    await enforceHumanCheck(data.humanCheckToken)

    const site = await visitorSite()
    if (!site) throw new Error(OWNER_MESSAGES_CLOSED)

    // A directory switched off, or kept for members from a signed-out
    // visitor, has no listing page to send from.
    const visibility = await readPageVisibility(site.id, "/directory")
    if (visibility === "off") throw new Error(OWNER_MESSAGES_CLOSED)
    if (
      visibility === "members" &&
      !(await findCurrentUser().catch(() => null))
    ) {
      throw new Error(OWNER_MESSAGES_CLOSED)
    }

    // Before any counting, so an empty box does not cost one of the nine.
    const input = cleanOwnerMessageInput(data)
    await countOwnerMessageAttempt(
      site.id,
      requestIp(),
      input.email,
      data.listingId
    )

    await sendOwnerMessage(site, data.listingId, input)
    return { sent: true }
  })

/** Passes a visitor's message on to the listing's owner by email. */
export function messageOwner(input: {
  listingId: string
  name: string
  email: string
  message: string
  humanCheckToken?: string
}) {
  return messageOwnerFn({ data: input })
}
