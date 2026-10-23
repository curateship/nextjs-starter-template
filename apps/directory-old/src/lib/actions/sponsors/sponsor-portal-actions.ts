import { createServerFn } from "@tanstack/react-start"
import { getSponsorReportLinksActionImpl, createSponsorReportLinkActionImpl, revokeSponsorReportLinkActionImpl } from "./sponsor-portal-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./sponsor-portal-actions.server"

export const getSponsorReportLinksAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string }) => data)
  .handler(async ({ data }) => getSponsorReportLinksActionImpl(data.siteId))

export const createSponsorReportLinkAction = createServerFn({ method: "POST" })
  .inputValidator((data: { sponsorId: string }) => data)
  .handler(async ({ data }) => createSponsorReportLinkActionImpl(data.sponsorId))

export const revokeSponsorReportLinkAction = createServerFn({ method: "POST" })
  .inputValidator((data: { sponsorId: string }) => data)
  .handler(async ({ data }) => revokeSponsorReportLinkActionImpl(data.sponsorId))
