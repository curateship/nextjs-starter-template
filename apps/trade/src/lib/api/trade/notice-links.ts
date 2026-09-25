import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { userGet } from "@/server/guards"
import {
  tradeNoticeLinksFor,
  tradeSoundEventsAfter,
} from "@/server/trade/notice-links"
import type { TradeSoundCursor } from "@/lib/trade/trade-sounds"

/**
 * Where this app's own bell notices came from.
 *
 * The bell asks once for the notices it has just pulled, so the click itself
 * never waits. The cap matches the tray's own page of twenty with room to
 * spare, and exists so one request can never turn into an unbounded `in (...)`
 * over the whole notifications table.
 */
const noticeLinksSchema = z.object({
  notificationIds: z.array(z.string().max(36)).max(100),
})

const loadTradeNoticeLinksFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(noticeLinksSchema)
  .handler(async ({ data, context }): Promise<Record<string, string>> => {
    return tradeNoticeLinksFor(context.user.id, data.notificationIds)
  })

export function loadTradeNoticeLinks(notificationIds: readonly string[]) {
  return loadTradeNoticeLinksFn({
    data: { notificationIds: [...notificationIds] },
  })
}

const soundCursorSchema = z.object({
  afterAt: z.number().int().nonnegative().max(8_640_000_000_000_000),
  afterId: z.string().max(36),
})

const loadTradeSoundEventsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(soundCursorSchema)
  .handler(async ({ data, context }) => {
    return tradeSoundEventsAfter(context.user.id, data)
  })

export function loadTradeSoundEvents(cursor: TradeSoundCursor) {
  return loadTradeSoundEventsFn({ data: cursor })
}
