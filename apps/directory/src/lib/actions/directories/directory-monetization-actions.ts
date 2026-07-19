import { createServerFn } from "@tanstack/react-start"
import { getDirectoryFeaturedPlansActionImpl, saveDirectoryFeaturedPlanActionImpl, setDirectoryFeaturedPlanArchivedActionImpl, getDirectoryFeaturedEntitlementsActionImpl, getDirectoryFeaturedRevenueSummaryActionImpl, revokeDirectoryFeaturedEntitlementActionImpl, getMyDirectoryFeaturedUpgradeStateActionImpl, createDirectoryFeaturedCheckoutActionImpl, confirmDirectoryFeaturedCheckoutActionImpl } from "./directory-monetization-actions.server"
import type { DirectoryFeaturedEntitlementStatus } from "./directory-monetization-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./directory-monetization-actions.server"

export const getDirectoryFeaturedPlansAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string }) => data)
  .handler(async ({ data }) => getDirectoryFeaturedPlansActionImpl(data.siteId))

export const saveDirectoryFeaturedPlanAction = createServerFn({ method: "POST" })
  .inputValidator((data: { input: {
  siteId: string
  planId?: string | null
  name: string
  description?: string | null
  stripePriceId: string
  durationDays: number | string
  priority?: number | string
  displayOrder?: number | string
} }) => data)
  .handler(async ({ data }) => saveDirectoryFeaturedPlanActionImpl(data.input))

export const setDirectoryFeaturedPlanArchivedAction = createServerFn({ method: "POST" })
  .inputValidator((data: { input: {
  siteId: string
  planId: string
  archived: boolean
} }) => data)
  .handler(async ({ data }) => setDirectoryFeaturedPlanArchivedActionImpl(data.input))

export const getDirectoryFeaturedEntitlementsAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; status?: DirectoryFeaturedEntitlementStatus }) => data)
  .handler(async ({ data }) => getDirectoryFeaturedEntitlementsActionImpl(data.siteId, data.status))

export const getDirectoryFeaturedRevenueSummaryAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string }) => data)
  .handler(async ({ data }) => getDirectoryFeaturedRevenueSummaryActionImpl(data.siteId))

export const revokeDirectoryFeaturedEntitlementAction = createServerFn({ method: "POST" })
  .inputValidator((data: { input: {
  siteId: string
  entitlementId: string
  note?: string
} }) => data)
  .handler(async ({ data }) => revokeDirectoryFeaturedEntitlementActionImpl(data.input))

export const getMyDirectoryFeaturedUpgradeStateAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; directoryId: string }) => data)
  .handler(async ({ data }) => getMyDirectoryFeaturedUpgradeStateActionImpl(data.siteId, data.directoryId))

export const createDirectoryFeaturedCheckoutAction = createServerFn({ method: "POST" })
  .inputValidator((data: { input: {
  siteId: string
  directoryId: string
  planId: string
  returnPath?: string
} }) => data)
  .handler(async ({ data }) => createDirectoryFeaturedCheckoutActionImpl(data.input))

export const confirmDirectoryFeaturedCheckoutAction = createServerFn({ method: "POST" })
  .inputValidator((data: { input: {
  siteId: string
  sessionId: string
} }) => data)
  .handler(async ({ data }) => confirmDirectoryFeaturedCheckoutActionImpl(data.input))
