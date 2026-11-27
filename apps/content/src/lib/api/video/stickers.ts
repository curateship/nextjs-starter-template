import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { describeAuthError } from "../error-message"
import {
  STICKER_DUPLICATE_MESSAGE,
  STICKER_LIST_FULL_MESSAGE,
  STICKER_NOT_EMOJI_MESSAGE,
  STICKER_PICTURE_NOT_FOUND_MESSAGE,
  stickerEntrySchema,
  type Sticker,
  type StickerEntry,
} from "@/lib/video/stickers"
import { userGet, userPost } from "@/server/guards"
import { listVideoMedia } from "@/server/video/media-list"
import {
  addSticker as addStickerQuery,
  getStickers,
  removeSticker as removeStickerQuery,
} from "@/server/video/stickers"

/**
 * The Text panel's stickers. Per person, like the media collections: anyone
 * signed in reads and changes their own list and nobody else's.
 */

export type { Sticker, StickerEntry }

const KNOWN_MESSAGES = new Set([
  STICKER_DUPLICATE_MESSAGE,
  STICKER_LIST_FULL_MESSAGE,
  STICKER_NOT_EMOJI_MESSAGE,
  STICKER_PICTURE_NOT_FOUND_MESSAGE,
])

export function getStickerErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : ""
  if (KNOWN_MESSAGES.has(message)) return message
  return describeAuthError(message) ?? "Stickers request failed."
}

export const STICKER_PICKER_PAGE_SIZE = 60

const pictureSearchSchema = z.object({
  search: z.string().trim().max(120).default(""),
})

const loadStickersFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => getStickers(context.user.id))

const addStickerFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(stickerEntrySchema)
  .handler(async ({ data, context }) => addStickerQuery(context.user.id, data))

const removeStickerFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(stickerEntrySchema)
  .handler(async ({ data, context }) =>
    removeStickerQuery(context.user.id, data)
  )

// Every picture the person owns, not just the ones on this project's shelf:
// a logo is uploaded once and used in every project. The newest page only;
// `total` lets the picker say so and point at the search.
const listStickerPicturesFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(pictureSearchSchema)
  .handler(async ({ data, context }) => {
    const page = await listVideoMedia({
      userId: context.user.id,
      fileType: "image",
      pageSize: STICKER_PICKER_PAGE_SIZE,
      search: data.search,
    })
    return { media: page.media, total: page.total }
  })

export function loadStickers() {
  return loadStickersFn()
}

export function addSticker(entry: StickerEntry) {
  return addStickerFn({ data: entry })
}

export function removeSticker(entry: StickerEntry) {
  return removeStickerFn({ data: entry })
}

export function listStickerPictures(search: string) {
  return listStickerPicturesFn({ data: { search } })
}
