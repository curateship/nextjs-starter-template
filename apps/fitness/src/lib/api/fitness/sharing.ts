import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { userPost } from "@/server/guards"
import { copySharedProgram, loadSharedProgram } from "@/server/fitness/sharing"

export type { SharedProgram } from "@/server/fitness/sharing"

const code = z.string().min(8).max(24)

/**
 * A shared program's public page. Open to anyone with the link, signed in or
 * not, and listed in `src/app/open-endpoints.ts`. It hands out only the
 * program's name, days, lifts, sets, reps and rest, never anything about the
 * owner.
 */
const sharedFn = createServerFn({ method: "GET" })
  .inputValidator(z.object({ code }))
  .handler(async ({ data }) => loadSharedProgram(data.code))

export function loadShared(shareCode: string) {
  return sharedFn({ data: { code: shareCode } })
}

const copyFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ code }))
  .handler(async ({ data, context }) => copySharedProgram(context.user.id, data.code))

export function copyShared(shareCode: string) {
  return copyFn({ data: { code: shareCode } })
}
