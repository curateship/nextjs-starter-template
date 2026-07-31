import { createServerFn } from "@tanstack/react-start"
import {
  createSponsorActionImpl,
  deleteSponsorActionImpl,
  deleteSponsorsActionImpl,
  getActiveSponsorsByIdsActionImpl,
  getActiveSponsorsForPickerActionImpl,
  getSiteSponsorsActionImpl,
  updateSponsorActionImpl,
} from "./sponsor-actions.server"
import type { SponsorInput, SponsorUpdateInput } from "./sponsor-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./sponsor-actions.server"

export const getSiteSponsorsAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string }) => data)
  .handler(async ({ data }) => getSiteSponsorsActionImpl(data.siteId))

export const getActiveSponsorsForPickerAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string }) => data)
  .handler(async ({ data }) => getActiveSponsorsForPickerActionImpl(data.siteId))

export const getActiveSponsorsByIdsAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; sponsorIds: string[] }) => data)
  .handler(async ({ data }) => getActiveSponsorsByIdsActionImpl(data.siteId, data.sponsorIds))

export const createSponsorAction = createServerFn({ method: "POST" })
  .inputValidator((data: { input: SponsorInput }) => data)
  .handler(async ({ data }) => createSponsorActionImpl(data.input))

export const updateSponsorAction = createServerFn({ method: "POST" })
  .inputValidator((data: { sponsorId: string; input: SponsorUpdateInput }) => data)
  .handler(async ({ data }) => updateSponsorActionImpl(data.sponsorId, data.input))

export const deleteSponsorAction = createServerFn({ method: "POST" })
  .inputValidator((data: { sponsorId: string }) => data)
  .handler(async ({ data }) => deleteSponsorActionImpl(data.sponsorId))

export const deleteSponsorsAction = createServerFn({ method: "POST" })
  .inputValidator((data: { sponsorIds: string[] }) => data)
  .handler(async ({ data }) => deleteSponsorsActionImpl(data.sponsorIds))
