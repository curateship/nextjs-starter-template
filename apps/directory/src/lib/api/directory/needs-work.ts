import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { NEEDS_WORK_GAPS } from "@/lib/directory/needs-work"
import { listNeedsWork, type NeedsWorkListing, type NeedsWorkPage } from "@/server/directory/needs-work"
import { adminGet } from "@/server/guards"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

export type { NeedsWorkListing, NeedsWorkPage }

const pageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(
    z.object({
      search: z.string().max(200).optional(),
      gap: z.enum(NEEDS_WORK_GAPS).optional(),
      page: z.number().int().min(1).max(10_000).optional(),
      limit: z.number().int().min(1).max(100).optional(),
    })
  )
  .handler(
    async ({ data, context }): Promise<NeedsWorkPage> =>
      listNeedsWork(await workspaceIdForRequest(context.user.id), data)
  )

/** One page of the Needs work row: published listings missing a photo, hours, a write-up or a category. */
export function loadNeedsWorkPage(options: { search?: string; gap?: (typeof NEEDS_WORK_GAPS)[number]; page?: number; limit?: number }) {
  return pageFn({ data: options })
}
