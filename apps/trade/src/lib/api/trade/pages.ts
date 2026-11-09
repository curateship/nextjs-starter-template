import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { coverImagesSchema, coverSchema } from "@/lib/notes/page-cover"
import { TRADE_PAGE_MAX_LENGTH } from "@/lib/trade/trade-pages"
import { userGet, userPost } from "@/server/guards"
import {
  loadTradePage,
  saveTradePage,
  setTradePageCover,
  setTradePageLocked,
} from "@/server/trade/pages"

/**
 * The Trade dashboard's left page, one per person. Only the signed-in
 * person's own page is ever read or written.
 */
const pageSchema = z.object({})

const loadPageFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(({ context }) => loadTradePage(context.user.id))

const savePageFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    pageSchema.extend({ body: z.string().max(TRADE_PAGE_MAX_LENGTH) })
  )
  .handler(({ context, data }) =>
    saveTradePage(context.user.id, data.body)
  )

const lockPageFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    pageSchema.extend({
      locked: z.boolean(),
      shownBody: z.string().max(TRADE_PAGE_MAX_LENGTH),
    })
  )
  .handler(({ context, data }) =>
    setTradePageLocked(context.user.id, data.locked, data.shownBody)
  )

const coverPageFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    pageSchema.extend({
      // The shell's cover rules: none, the sky, or a picture, and the
      // page's own pictures (`src/lib/notes/page-cover.ts`).
      coverUrl: coverSchema,
      coverImages: coverImagesSchema,
      shownBody: z.string().max(TRADE_PAGE_MAX_LENGTH),
    })
  )
  .handler(({ context, data }) =>
    setTradePageCover(
      context.user.id,
      { coverUrl: data.coverUrl || null, coverImages: data.coverImages },
      data.shownBody
    )
  )

export function loadPage() {
  return loadPageFn()
}
export function savePage(body: string) {
  return savePageFn({ data: { body } })
}
export function lockPage(locked: boolean, shownBody: string) {
  return lockPageFn({ data: { locked, shownBody } })
}
export function setPageCover(
  cover: { coverUrl: string | null; coverImages: string[] },
  shownBody: string
) {
  return coverPageFn({ data: { ...cover, shownBody } })
}
