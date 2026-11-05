import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { TEXT_SOCIALS, type SocialWatch, type TextSocial, type TextSocialsScreen, type WatchKind } from "@/lib/viral/socials"
import { adminGet, adminPost } from "@/server/guards"
import { addSocialWatch, loadTextSocials, readSocialWatchNow, removeSocialWatch } from "@/server/viral/social-watches"

/**
 * A project's X, Reddit and LinkedIn side (`workspace/docs/projects-and-socials.md`):
 * what it keeps reading through Promo, and the posts found. Admin only, as
 * the rest of the Promo link is: the reads run on Promo's own accounts.
 */

const id = z.string().min(1).max(36)
const kinds = ["search", "hashtag", "account", "person", "company", "subreddit"] as const satisfies readonly WatchKind[]

const loadFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ projectId: id }))
  .handler(async ({ data, context }): Promise<TextSocialsScreen> => loadTextSocials(context.user.id, data.projectId))

/** Whether Promo is set up, what the project reads on X, Reddit and LinkedIn, and the posts found. */
export function loadTextSocialsFn(projectId: string) {
  return loadFn({ data: { projectId } })
}

const addFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({ projectId: id, network: z.enum(TEXT_SOCIALS), kind: z.enum(kinds), value: z.string().min(1).max(300) })
  )
  .handler(async ({ data, context }): Promise<{ watch: SocialWatch; readError: string | null }> =>
    addSocialWatch(context.user.id, data)
  )

/** Adds a search, account, person, company or subreddit, and reads it at once when Promo is set up. */
export function addSocialWatchFn(input: { projectId: string; network: TextSocial; kind: WatchKind; value: string }) {
  return addFn({ data: input })
}

const readFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ watchId: id }))
  .handler(async ({ data, context }): Promise<SocialWatch> => readSocialWatchNow(context.user.id, data.watchId))

/** Reads one watched search, account or subreddit again now. */
export function readSocialWatchFn(watchId: string) {
  return readFn({ data: { watchId } })
}

const removeFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ watchId: id }))
  .handler(async ({ data, context }): Promise<{ ok: true }> => {
    await removeSocialWatch(context.user.id, data.watchId)
    return { ok: true }
  })

/** Takes a watched search, account or subreddit off, with the posts only it brought. */
export function removeSocialWatchFn(watchId: string) {
  return removeFn({ data: { watchId } })
}
