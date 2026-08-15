import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { adminPost } from "@/server/guards"
import { saveDirectoryGeocodingKey } from "@/server/directory/settings"
import { workspaceIdForRequest } from "@/server/workspaces/for-request"

const saveDirectoryGeocodingKeyFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ key: z.string().min(1).max(500) }))
  .handler(async ({ data, context }) =>
    saveDirectoryGeocodingKey(
      await workspaceIdForRequest(context.user.id),
      data.key
    )
  )

/** Saves one visited site's Google key without rewriting unrelated settings. */
export function saveGeocodingKey(key: string) {
  return saveDirectoryGeocodingKeyFn({ data: { key } })
}
