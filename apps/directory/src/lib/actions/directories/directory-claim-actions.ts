import { createServerFn } from "@tanstack/react-start"
import { getDirectoryClaimStateActionImpl, submitDirectoryClaimActionImpl, getDirectoryClaimListActionImpl, reviewDirectoryClaimActionImpl, getMyClaimedDirectoriesActionImpl, submitMyClaimedDirectoryEditRequestActionImpl, getDirectoryOwnerEditRequestListActionImpl, reviewDirectoryOwnerEditRequestActionImpl } from "./directory-claim-actions.server"
import type { DirectoryClaimStatus, DirectoryOwnerEditRequestStatus } from "./directory-claim-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./directory-claim-actions.server"

export const getDirectoryClaimStateAction = createServerFn({ method: "POST" })
  .inputValidator((data: { directoryId: string }) => data)
  .handler(async ({ data }) => getDirectoryClaimStateActionImpl(data.directoryId))

export const submitDirectoryClaimAction = createServerFn({ method: "POST" })
  .inputValidator((data: { input: {
  directoryId: string
  businessEmail: string
  claimantName: string
  roleTitle?: string
  phone?: string
  message?: string
  proofUrl?: string
} }) => data)
  .handler(async ({ data }) => submitDirectoryClaimActionImpl(data.input))

export const getDirectoryClaimListAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; status?: DirectoryClaimStatus }) => data)
  .handler(async ({ data }) => getDirectoryClaimListActionImpl(data.siteId, data.status))

export const reviewDirectoryClaimAction = createServerFn({ method: "POST" })
  .inputValidator((data: { input: {
  claimId: string
  status: 'approved' | 'rejected' | 'revoked'
  note?: string
} }) => data)
  .handler(async ({ data }) => reviewDirectoryClaimActionImpl(data.input))

export const getMyClaimedDirectoriesAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string }) => data)
  .handler(async ({ data }) => getMyClaimedDirectoriesActionImpl(data.siteId))

export const submitMyClaimedDirectoryEditRequestAction = createServerFn({ method: "POST" })
  .inputValidator((data: { input: {
  siteId: string
  directoryId: string
  title: string
  slug?: string
  featuredImage?: string | null
  metaDescription?: string | null
  contentBlocks: Record<string, any>
  categoryIds?: unknown[]
  primaryCategoryId?: string | null
} }) => data)
  .handler(async ({ data }) => submitMyClaimedDirectoryEditRequestActionImpl(data.input))

export const getDirectoryOwnerEditRequestListAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; status?: DirectoryOwnerEditRequestStatus }) => data)
  .handler(async ({ data }) => getDirectoryOwnerEditRequestListActionImpl(data.siteId, data.status))

export const reviewDirectoryOwnerEditRequestAction = createServerFn({ method: "POST" })
  .inputValidator((data: { input: {
  requestId: string
  status: 'approved' | 'rejected'
  note?: string
} }) => data)
  .handler(async ({ data }) => reviewDirectoryOwnerEditRequestActionImpl(data.input))
