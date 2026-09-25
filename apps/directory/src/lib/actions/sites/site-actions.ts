import { createServerFn } from "@tanstack/react-start"
import {
  checkSubdomainAvailabilityActionImpl,
  cloneSiteActionImpl,
  createSiteActionImpl,
  deleteSiteActionImpl,
  getAllSitesActionImpl,
  getSiteByIdActionImpl,
  updateSiteActionImpl,
  updateSiteFooterActionImpl,
  updateSiteNavigationActionImpl,
} from "./site-actions.server"
import type { CloneSiteData, CreateSiteData } from "./site-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./site-actions.server"

export const getAllSitesAction = createServerFn({ method: "POST" })
  .handler(async () => getAllSitesActionImpl())

export const createSiteAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteData: CreateSiteData }) => data)
  .handler(async ({ data }) => createSiteActionImpl(data.siteData))

export const cloneSiteAction = createServerFn({ method: "POST" })
  .inputValidator((data: { sourceSiteId: string; cloneData: CloneSiteData }) => data)
  .handler(async ({ data }) => cloneSiteActionImpl(data.sourceSiteId, data.cloneData))

export const updateSiteAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; updates: Partial<CreateSiteData> }) => data)
  .handler(async ({ data }) => updateSiteActionImpl(data.siteId, data.updates))

export const deleteSiteAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string }) => data)
  .handler(async ({ data }) => deleteSiteActionImpl(data.siteId))

export const getSiteByIdAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string }) => data)
  .handler(async ({ data }) => getSiteByIdActionImpl(data.siteId))

export const checkSubdomainAvailabilityAction = createServerFn({ method: "POST" })
  .inputValidator((data: { subdomain: string }) => data)
  .handler(async ({ data }) => checkSubdomainAvailabilityActionImpl(data.subdomain))

export const updateSiteNavigationAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; navigationData: Record<string, any> }) => data)
  .handler(async ({ data }) => updateSiteNavigationActionImpl(data.siteId, data.navigationData))

export const updateSiteFooterAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; footerData: Record<string, any> }) => data)
  .handler(async ({ data }) => updateSiteFooterActionImpl(data.siteId, data.footerData))
