import { createServerFn } from "@tanstack/react-start"
import {
  backfillDirectoryCoordinatesActionImpl,
  getDirectoryCoordinateStatsActionImpl,
  getDirectoryMapConfigActionImpl,
} from "./directory-map-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./directory-map-actions.server"

export const getDirectoryMapConfigAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string }) => data)
  .handler(async ({ data }) => getDirectoryMapConfigActionImpl(data.siteId))

export const getDirectoryCoordinateStatsAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string }) => data)
  .handler(async ({ data }) => getDirectoryCoordinateStatsActionImpl(data.siteId))

export const backfillDirectoryCoordinatesAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string }) => data)
  .handler(async ({ data }) => backfillDirectoryCoordinatesActionImpl(data.siteId))
