import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { userGet } from "@/server/guards"
import {
  tradeNoticeDetailsFor,
  tradeSoundEventsAfter,
  type TradeNoticeDetail,
} from "@/server/trade/notice-links"
import type { TradeSoundCursor } from "@/lib/trade/trade-sounds"

/**
 * What this app says about its own bell notices.
 *
 * The bell asks once for the notices it has just pulled, so the click itself
 * never waits. The cap matches the tray's own page of twenty with room to
 * spare, and exists so one request can never turn into an unbounded `in (...)`
 * over the whole notifications table.
 */
const noticeLinksSchema = z.object({
  notificationIds: z.array(z.string().max(36)).max(100),
})

const loadTradeNoticeDetailsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(noticeLinksSchema)
  .handler(
    async ({ data, context }): Promise<Record<string, TradeNoticeDetail>> => {
      return tradeNoticeDetailsFor(context.user.id, data.notificationIds)
    }
  )

export function loadTradeNoticeDetails(notificationIds: readonly string[]) {
  return loadTradeNoticeDetailsFn({
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
