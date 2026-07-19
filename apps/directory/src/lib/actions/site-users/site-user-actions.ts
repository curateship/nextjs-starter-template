import { createServerFn } from "@tanstack/react-start"
import { getSiteUsersImpl, createSiteUserImpl, updateSiteUserImpl, deleteSiteUsersImpl } from "./site-user-actions.server"
import type { SiteUserFilterGroup } from "./site-user-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./site-user-actions.server"

export const getSiteUsers = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; options?: {
    filterGroup?: SiteUserFilterGroup | null
    searchQuery?: string | null
    page?: number
    pageSize?: number
  } }) => data)
  .handler(async ({ data }) => getSiteUsersImpl(data.siteId, data.options))

export const createSiteUser = createServerFn({ method: "POST" })
  .inputValidator((data: { input: {
  siteId: string
  email: string
  displayName?: string
  password: string
  role: 'admin' | 'member'
  status: 'active' | 'suspended'
} }) => data)
  .handler(async ({ data }) => createSiteUserImpl(data.input))

export const updateSiteUser = createServerFn({ method: "POST" })
  .inputValidator((data: { input: {
  membershipId: string
  siteId: string
  displayName?: string
  role: 'admin' | 'member'
  status: 'active' | 'suspended'
} }) => data)
  .handler(async ({ data }) => updateSiteUserImpl(data.input))

export const deleteSiteUsers = createServerFn({ method: "POST" })
  .inputValidator((data: { input: {
  siteId: string
  membershipIds: string[]
} }) => data)
  .handler(async ({ data }) => deleteSiteUsersImpl(data.input))
