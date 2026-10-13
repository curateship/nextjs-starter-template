import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { adminGet } from "@/server/guards"
import { noticeLinks } from "@/server/social/notices"
import type { PromoNoticeKind } from "@/lib/social/notice-words"

/**
 * Where Promo's bell notices open, asked once per page of notices. Admin
 * only, like every Promo endpoint, and only the person's own notices answer.
 */
const linksFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ ids: z.array(z.string().min(1).max(36)).max(200) }))
  .handler(
    async ({ context, data }): Promise<Array<{ id: string; kind: PromoNoticeKind; href: string }>> =>
      noticeLinks(context.user.id, data.ids)
  )

export function loadPromoNoticeLinks(ids: string[]) {
  return linksFn({ data: { ids } })
}
