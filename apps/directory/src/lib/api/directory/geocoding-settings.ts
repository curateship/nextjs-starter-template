import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { adminPost } from "@/server/guards"
import {
  saveDirectoryGeocodingKey,
  saveDirectoryMapDisplayKey,
} from "@/server/directory/settings"
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

const saveDirectoryMapDisplayKeyFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ key: z.string().min(1).max(500) }))
  .handler(async ({ data, context }) =>
    saveDirectoryMapDisplayKey(
      await workspaceIdForRequest(context.user.id),
      data.key
    )
  )

/**
 * Saves the browser key the map is drawn with. A second key rather than the one
 * above because a browser key is restricted to a website address and a key
 * restricted that way is refused by the server-side place lookup.
 */
export function saveMapDisplayKey(key: string) {
  return saveDirectoryMapDisplayKeyFn({ data: { key } })
}
