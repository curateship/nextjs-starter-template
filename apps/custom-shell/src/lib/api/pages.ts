import { createServerFn } from "@tanstack/react-start"

import { adminGet } from "@/server/guards"
import {
  loadPagesOverview as loadPagesOverviewQuery,
  type PagesOverview,
  type PublicPageRow,
} from "@/server/pages"

import { createErrorMessage } from "./error-message"

export type { PagesOverview, PublicPageRow }

export const getPagesErrorMessage = createErrorMessage(
  { FORBIDDEN: "Only an admin can see the pages list." },
  "The pages list could not be loaded. Please try again."
)

const loadPagesOverviewFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async (): Promise<PagesOverview> => {
    return loadPagesOverviewQuery()
  })

export function loadPagesOverview() {
  return loadPagesOverviewFn()
}
