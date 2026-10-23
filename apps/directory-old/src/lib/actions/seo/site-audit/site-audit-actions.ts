import { createServerFn } from "@tanstack/react-start"
import { getSiteAuditDataImpl, getInternalLinkAnalysisImpl, saveSiteAuditSettingsImpl, getSiteForAuditImpl } from "./site-audit-actions.server"
import type { SiteSeoSettings } from "./site-audit-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./site-audit-actions.server"

export const getSiteAuditData = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string }) => data)
  .handler(async ({ data }) => getSiteAuditDataImpl(data.siteId))

export const getInternalLinkAnalysis = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string }) => data)
  .handler(async ({ data }) => getInternalLinkAnalysisImpl(data.siteId))

export const saveSiteAuditSettings = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; seoSettings: SiteSeoSettings }) => data)
  .handler(async ({ data }) => saveSiteAuditSettingsImpl(data.siteId, data.seoSettings))

export const getSiteForAudit = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string }) => data)
  .handler(async ({ data }) => getSiteForAuditImpl(data.siteId))
