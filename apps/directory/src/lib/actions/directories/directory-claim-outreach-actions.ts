import { createServerFn } from "@tanstack/react-start"
import {
  getDirectoryClaimOutreachListActionImpl,
  sendDirectoryClaimOutreachActionImpl,
} from "./directory-claim-outreach-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./directory-claim-outreach-actions.server"

export const getDirectoryClaimOutreachListAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string }) => data)
  .handler(async ({ data }) => getDirectoryClaimOutreachListActionImpl(data.siteId))

export const sendDirectoryClaimOutreachAction = createServerFn({ method: "POST" })
  .inputValidator((data: { input: {
  siteId: string
  directoryIds: string[]
} }) => data)
  .handler(async ({ data }) => sendDirectoryClaimOutreachActionImpl(data.input))
