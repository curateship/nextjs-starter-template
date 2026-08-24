import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { userGet } from "@/server/guards"
import { tradeNoticeLinksFor } from "@/server/trade/notice-links"

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
