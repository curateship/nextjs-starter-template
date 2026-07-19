import { createServerFn } from "@tanstack/react-start"
import { checkDomainHealthImpl, getDeliverabilityReportImpl } from "./deliverability-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./deliverability-actions.server"

export const checkDomainHealth = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string }) => data)
  .handler(async ({ data }) => checkDomainHealthImpl(data.siteId))

export const getDeliverabilityReport = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string }) => data)
  .handler(async ({ data }) => getDeliverabilityReportImpl(data.siteId))
