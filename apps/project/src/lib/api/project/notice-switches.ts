import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { NOTICE_SWITCH_IDS } from "@/lib/project/notice-switches"
import { userPost } from "@/server/guards"
import { setNoticeSwitch } from "@/server/project/notice-switches"

const setNoticeSwitchFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ id: z.enum(NOTICE_SWITCH_IDS), on: z.boolean() }))
  .handler(async ({ data, context }) => setNoticeSwitch(context.user.id, data))

/** Switches one kind of bell notice on or off for me. */
export function saveNoticeSwitch(data: { id: (typeof NOTICE_SWITCH_IDS)[number]; on: boolean }) {
  return setNoticeSwitchFn({ data })
}
