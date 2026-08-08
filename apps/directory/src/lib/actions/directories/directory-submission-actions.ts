import { createServerFn } from "@tanstack/react-start"
import {
  submitDirectoryListingSubmissionActionImpl,
  getListingSubmissionCategoriesActionImpl,
  getDirectorySubmissionListActionImpl,
  reviewDirectorySubmissionActionImpl,
} from "./directory-submission-actions.server"
import type { DirectorySubmissionStatus } from "./directory-submission-actions.server"

// Types stay importable from this path. `export type` is erased at runtime,
// so no server code reaches the client through it.
export type * from "./directory-submission-actions.server"

export const submitDirectoryListingSubmissionAction = createServerFn({ method: "POST" })
  .inputValidator((data: { input: Parameters<typeof submitDirectoryListingSubmissionActionImpl>[0] }) => data)
  .handler(async ({ data }) => submitDirectoryListingSubmissionActionImpl(data.input))

export const getListingSubmissionCategoriesAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string }) => data)
  .handler(async ({ data }) => getListingSubmissionCategoriesActionImpl(data.siteId))

export const getDirectorySubmissionListAction = createServerFn({ method: "POST" })
  .inputValidator((data: { siteId: string; status?: DirectorySubmissionStatus }) => data)
  .handler(async ({ data }) => getDirectorySubmissionListActionImpl(data.siteId, data.status))

export const reviewDirectorySubmissionAction = createServerFn({ method: "POST" })
  .inputValidator((data: { input: Parameters<typeof reviewDirectorySubmissionActionImpl>[0] }) => data)
  .handler(async ({ data }) => reviewDirectorySubmissionActionImpl(data.input))
