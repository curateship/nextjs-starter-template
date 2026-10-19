import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { userGet } from "@/server/guards"
import { noticeLinks } from "@/server/note/notices"

/**
 * Where the video and note notices in the bell open, asked once per page of
 * notices.
 * Only the asker's own notices answer.
 */
const linksFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ ids: z.array(z.string().min(1).max(36)).max(200) }))
  .handler(
    async ({ data, context }): Promise<{ id: string; href: string }[]> =>
      noticeLinks(context.user.id, data.ids)
  )

export function loadNoticeLinks(ids: string[]) {
  return linksFn({ data: { ids } })
}
