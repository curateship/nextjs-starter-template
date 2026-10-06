import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { userGet } from "@/server/guards"
import {
  pomodoroNoticeDetailsFor,
  type PomodoroNoticeDetail,
} from "@/server/pomodoro/notices"

/**
 * What this app says about its own bell notices, asked once for the notices
 * the tray has just pulled so the click itself never waits.
 *
 * The cap leaves room over the tray's page of twenty and keeps one request
 * from becoming an unbounded `in (...)` over the whole notifications table.
 */
const noticeIdsSchema = z.object({
  notificationIds: z.array(z.string().max(36)).max(100),
})

const loadNoticeDetailsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(noticeIdsSchema)
  .handler(
    async ({ data, context }): Promise<Record<string, PomodoroNoticeDetail>> =>
      pomodoroNoticeDetailsFor(context.user.id, data.notificationIds)
  )

export function loadPomodoroNoticeDetails(notificationIds: readonly string[]) {
  return loadNoticeDetailsFn({
    data: { notificationIds: [...notificationIds] },
  })
}
