import { createServerFn } from "@tanstack/react-start"
import { geocodeNearMeLocationActionImpl } from "./directory-near-me-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./directory-near-me-actions.server"

export const geocodeNearMeLocationAction = createServerFn({ method: "POST" })
  .inputValidator((data: { input: { siteId: string; query: string } }) => data)
  .handler(async ({ data }) => geocodeNearMeLocationActionImpl(data.input))
