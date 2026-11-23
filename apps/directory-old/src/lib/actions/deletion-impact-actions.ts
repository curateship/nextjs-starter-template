import { createServerFn } from "@tanstack/react-start"
import { getDeletionImpactActionImpl } from "./deletion-impact-actions.server"
import type { DeletionImpactRequest } from "./deletion-impact-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./deletion-impact-actions.server"

export const getDeletionImpactAction = createServerFn({ method: "POST" })
  .inputValidator((data: { input: DeletionImpactRequest }) => data)
  .handler(async ({ data }) => getDeletionImpactActionImpl(data.input))
