import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  creatorsQuery,
  MAX_SEARCH_LENGTH,
  type SocialCreatorsSearch,
} from "@/lib/trade/social/creators-query"
import type {
  SocialCreator,
  SocialDashboard,
  SocialPostsPage,
} from "@/lib/trade/social/dashboard"
import { userGet, userPost } from "@/server/guards"
import {
  addSocialCreator,
  listSocialCreatorRows,
  type SocialCreatorRow,
  type SocialCreatorsList,
} from "@/server/trade/social-creators"
import {
  loadSocialPostsPage,
  loadSocialDashboard,
  refreshSocialCreator,
} from "@/server/trade/social-posts"

import { createErrorMessage } from "../error-message"

export type {
  SocialCreator,
  SocialCreatorRow,
  SocialCreatorsList,
  SocialDashboard,
  SocialPostsPage,
}

/**
 * Every door onto the social dashboard.
 *
 * All four carry a shared guard and every one of them hands the signed-in
 * member's own id to the database layer, which filters on it in the same
 * `where` as the row it is looking for. There is no endpoint here that takes
 * a creator id and trusts it.
 */

const handleSchema = z.object({ handle: z.string().min(1).max(40) })

const loadSocialDashboardFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(handleSchema)
  .handler(({ data, context }): Promise<SocialDashboard> =>
    loadSocialDashboard(context.user.id, data.handle)
  )

const pageSchema = z.object({
  creatorId: z.string().min(1).max(36),
  /** The oldest post already on screen. Absent for the first page. */
  before: z.number().int().positive().nullable(),
  /** Only the posts naming this coin. Absent for all of them. */
  market: z
    .string()
    .max(15)
    .regex(/^[A-Za-z0-9]+$/)
    .nullable(),
})

const loadSocialPostsPageFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(pageSchema)
  .handler(({ data, context }): Promise<SocialPostsPage> =>
    loadSocialPostsPage(
      context.user.id,
      data.creatorId,
      data.before,
      data.market
    )
  )

const addSchema = z.object({ address: z.string().min(1).max(500) })

const addSocialCreatorFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(addSchema)
  .handler(({ data, context }): Promise<SocialCreator> =>
    addSocialCreator(context.user.id, data.address)
  )

/**
 * The list screen's question, checked again here.
 *
 * **Every field falls back to nothing rather than refusing the request.** A
 * stale link, a hand-edited address or a renamed filter would otherwise be a
 * 500 on a page that could perfectly well have drawn the plain list, and
 * `validateSearch` in the browser is not a guarantee: it cleans what the
 * screen reads without rewriting the address, so the raw value still travels.
 * Unrecognised values land on their defaults in `creatorsQuery` below.
 */
const listSchema = z.object({
  q: z.string().max(MAX_SEARCH_LENGTH).catch("").optional(),
  posts: z
    .enum(["any", "under50", "50to500", "over500"])
    .catch("any")
    .optional(),
  last: z.enum(["any", "week", "month", "older"]).catch("any").optional(),
  sort: z
    .enum(["posts", "last", "handle", "followers"])
    .catch("last")
    .optional(),
  dir: z.enum(["asc", "desc"]).catch("desc").optional(),
})

const listSocialCreatorsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(listSchema)
  .handler(({ data, context }): Promise<SocialCreatorsList> =>
    listSocialCreatorRows(context.user.id, creatorsQuery(data))
  )

export function loadSocialDashboardData(handle: string) {
  return loadSocialDashboardFn({ data: { handle } })
}

/**
 * Reads the creator's public X profile and writes down the follower count,
 * the links and any posts the page shows that are not held yet.
 *
 * A POST because it writes. It answers with whether anything changed, so the
 * screen reloads only when there is something new to draw.
 */
const refreshSchema = handleSchema.extend({
  /** True when somebody pressed Sync profile, false for the read on open. */
  asked: z.boolean(),
})

const refreshSocialCreatorFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(refreshSchema)
  .handler(({ data, context }): Promise<{ changed: boolean; added: number }> =>
    refreshSocialCreator(context.user.id, data.handle, data.asked)
  )

export function refreshCreatorFromX(handle: string, asked: boolean) {
  return refreshSocialCreatorFn({ data: { handle, asked } })
}

export function loadSocialPosts(
  creatorId: string,
  before: number | null,
  market: string | null
) {
  return loadSocialPostsPageFn({ data: { creatorId, before, market } })
}

export function addCreator(address: string) {
  return addSocialCreatorFn({ data: { address } })
}

export function listCreators(search: SocialCreatorsSearch) {
  return listSocialCreatorsFn({ data: search })
}

/** The list screen names itself, rather than borrowing the dashboard's line. */
export const getSocialCreatorsErrorMessage = createErrorMessage(
  {},
  "Your creators could not be read. Try again."
)

export const getSocialErrorMessage = createErrorMessage(
  {
    SOCIAL_CREATOR_NOT_TRACKED:
      "You are not tracking that account yet. Add it and its posts will show up here.",
    SOCIAL_CREATOR_EXISTS: "You already track that account.",
    SOCIAL_CREATORS_FULL:
      "You are tracking as many accounts as one member can. Remove one before adding another.",
    SOCIAL_CREATOR_NOT_SAVED: "That account could not be saved. Try again.",
    SOCIAL_HANDLE_EMPTY: "Paste an X address or type a handle.",
    SOCIAL_HANDLE_BAD:
      "That is not an X handle. Paste something like https://x.com/cryptosam.",
    SOCIAL_HANDLE_NOT_X: "Only X accounts can be tracked.",
    SOCIAL_HANDLE_NOT_AN_ACCOUNT:
      "That address is a page on X, not somebody's account.",
    SOCIAL_HANDLE_PRIVATE_ADDRESS:
      "That address points at a private or internal machine, so it was refused.",
  },
  "This creator's dashboard could not be read. Try again."
)
