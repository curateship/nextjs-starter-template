import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { describeAuthError } from "@/lib/api/error-message"
import { enforceRateLimit, RateLimitError } from "@/server/auth/rate-limit"
import { findCurrentUser } from "@/server/auth/security"
import { visitorSite } from "@/server/directory/public"
import { userPost } from "@/server/guards"
import { setFollowing } from "@/server/promotions/follows"
import { dealsAccessFor } from "@/server/promotions/public"

/**
 * The Follow button on a listing's page. Following needs an account, so the
 * door is guarded; whether this person already follows comes with the listing
 * page itself, read after its cache.
 */

/** The fallback when something unexpected fails, never the server's words. */
export function getFollowErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  return (
    describeAuthError(message) ??
    "Following did not go through. Please try again."
  )
}

// More than anybody taps a Follow button, less than a script flipping it.
const FOLLOW_RATE_LIMIT = { maxAttempts: 60, windowSeconds: 3600 }

export type FollowAnswer =
  | { done: true; following: boolean }
  | { done: false; problem: string }

const setFollowFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    z.object({ listingId: z.string().min(1).max(36), following: z.boolean() })
  )
  .handler(async ({ data, context }): Promise<FollowAnswer> => {
    const site = await visitorSite()
    // Following is for a listing's deals, so it follows the Deals page's switch.
    const open =
      site &&
      (await dealsAccessFor(site.id, async () =>
        Boolean(await findCurrentUser().catch(() => null))
      ))
    if (!site || !open) {
      return { done: false, problem: "Deals are not on this site right now." }
    }
    try {
      await enforceRateLimit(`listing-follow:${context.user.id}`, FOLLOW_RATE_LIMIT)
    } catch (error) {
      if (error instanceof RateLimitError) {
        return {
          done: false,
          problem: "That is a lot of following for one hour. Try again later.",
        }
      }
      throw error
    }
    try {
      const { following } = await setFollowing(site.id, context.user.id, data)
      return { done: true, following }
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("That listing")) {
        return { done: false, problem: error.message }
      }
      throw error
    }
  })

/** Follows or unfollows a listing for the signed-in person. */
export function followListing(input: { listingId: string; following: boolean }) {
  return setFollowFn({ data: input })
}
