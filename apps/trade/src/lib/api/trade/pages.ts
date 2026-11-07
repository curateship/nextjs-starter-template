import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { KNOWN_PROTOCOLS, parseMarketKey } from "@/lib/protocols/contracts"
import {
  EXCHANGE_PAGE_MARKET,
  TRADE_PAGE_MAX_LENGTH,
} from "@/lib/trade/trade-pages"
import { userGet, userPost } from "@/server/guards"
import {
  loadTradePage,
  saveTradePage,
  setTradePageCover,
  setTradePageLocked,
} from "@/server/trade/pages"

/**
 * The dashboard's two pages: the exchange's own (`marketKey` "") and one
 * market's. Only the signed-in person's own pages are ever read or written.
 */
const pageSchema = z.object({
  protocol: z.enum(KNOWN_PROTOCOLS),
  marketKey: z
    .string()
    .max(180)
    .refine(
      (key) => key === EXCHANGE_PAGE_MARKET || parseMarketKey(key) !== null,
      { message: "Not a market key." }
    ),
})

const loadPageFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(pageSchema)
  .handler(({ context, data }) =>
    loadTradePage(context.user.id, data.protocol, data.marketKey)
  )

const savePageFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    pageSchema.extend({ body: z.string().max(TRADE_PAGE_MAX_LENGTH) })
  )
  .handler(({ context, data }) =>
    saveTradePage(context.user.id, data.protocol, data.marketKey, data.body)
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
    setTradePageLocked(
      context.user.id,
      data.protocol,
      data.marketKey,
      data.locked,
      data.shownBody
    )
  )

/** A picture from the media library: an https address, or this site's own path. */
const coverSchema = z
  .string()
  .max(1000)
  .refine((value) => {
    if (value.startsWith("/") && !value.startsWith("//")) return true
    try {
      return new URL(value).protocol === "https:"
    } catch {
      return false
    }
  })
  .nullable()

const coverPageFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(
    pageSchema.extend({
      coverUrl: coverSchema,
      shownBody: z.string().max(TRADE_PAGE_MAX_LENGTH),
    })
  )
  .handler(({ context, data }) =>
    setTradePageCover(
      context.user.id,
      data.protocol,
      data.marketKey,
      data.coverUrl,
      data.shownBody
    )
  )

type PageRef = z.infer<typeof pageSchema>

export function loadPage(ref: PageRef) {
  return loadPageFn({ data: ref })
}
export function savePage(ref: PageRef, body: string) {
  return savePageFn({ data: { ...ref, body } })
}
export function lockPage(ref: PageRef, locked: boolean, shownBody: string) {
  return lockPageFn({ data: { ...ref, locked, shownBody } })
}
export function setPageCover(
  ref: PageRef,
  coverUrl: string | null,
  shownBody: string
) {
  return coverPageFn({ data: { ...ref, coverUrl, shownBody } })
}
