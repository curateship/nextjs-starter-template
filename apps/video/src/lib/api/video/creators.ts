import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { createErrorMessage } from "../error-message"
import { adminGet, adminPost } from "@/server/guards"
import {
  addCreatorByLink,
  deleteCreator,
  listCreators,
  setCreatorWatch,
} from "@/server/video/creators/creators"
import { listFolders } from "@/server/video/creators/folders"
import { loadFeedView } from "@/server/video/creators/feed"
import { getYoutubeKeyStatus } from "@/server/video/settings"
import {
  EVERYONE_SCOPE,
  type CreatorResearchData,
  type ResearchCreator,
} from "@/lib/video/creators"

/**
 * The research dashboard's own doors: who you follow, and following somebody
 * new.
 *
 * Admin only, the same as the Viral page. Following a YouTube channel spends a
 * unit of the day's YouTube allowance and the watch timer spends more, so this
 * is not a door to leave open to every member.
 */

export const getCreatorErrorMessage = createErrorMessage(
  {
    CREATOR_NOT_FOUND: "That creator is no longer on your list.",
    CREATOR_ALREADY_FOLLOWED: "You already follow that creator.",
    YOUTUBE_KEY_MISSING:
      "Following a YouTube channel needs the YouTube key. Paste one in Settings → YouTube first.",
    YOUTUBE_CHANNEL_NOT_FOUND:
      "YouTube has no channel at that link. Check the address and try again.",
    ENCRYPTION_NOT_CONFIGURED:
      "The server has no encryption key set, so the YouTube key cannot be read. Set CUSTOM_SHELL_SECRET_ENCRYPTION_KEY first.",
  },
  "That did not work. Try again in a moment."
)

const loadResearchFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<CreatorResearchData> => {
    const [folders, creators, view, keyStatus] = await Promise.all([
      listFolders(context.user.id),
      listCreators(context.user.id),
      loadFeedView(context.user.id, EVERYONE_SCOPE),
      getYoutubeKeyStatus(),
    ])
    return {
      ...view,
      folders,
      creators,
      youtubeKeyConfigured: keyStatus.configured && !keyStatus.unreadable,
    }
  })

/** Everything the dashboard opens with, in one trip. */
export function loadResearchData() {
  return loadResearchFn()
}

const addCreatorFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ link: z.string().min(1).max(2048) }))
  .handler(
    async ({ data, context }): Promise<ResearchCreator> =>
      addCreatorByLink(context.user.id, data.link)
  )

/** Follows a creator from a pasted profile link. */
export function addCreator(link: string) {
  return addCreatorFn({ data: { link } })
}

const setWatchFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({ creatorId: z.string().min(1).max(36), watch: z.boolean() })
  )
  .handler(async ({ data, context }) => {
    await setCreatorWatch(context.user.id, data.creatorId, data.watch)
    return { creators: await listCreators(context.user.id) }
  })

/** Turns the watch timer on or off for one creator. */
export function setCreatorWatching(creatorId: string, watch: boolean) {
  return setWatchFn({ data: { creatorId, watch } })
}

const deleteCreatorFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ creatorId: z.string().min(1).max(36) }))
  .handler(async ({ data, context }) => {
    await deleteCreator(context.user.id, data.creatorId)
    const [folders, creators] = await Promise.all([
      listFolders(context.user.id),
      listCreators(context.user.id),
    ])
    return { folders, creators }
  })

/**
 * Unfollows a creator. Their posts go with them; anything already broken down
 * stays, which the confirmation says before you press it.
 */
export function removeCreator(creatorId: string) {
  return deleteCreatorFn({ data: { creatorId } })
}
