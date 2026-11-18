import { createFileRoute, redirect } from "@tanstack/react-router"

import { forwardedSearch } from "@/lib/directory/listings-dashboard-search"

/**
 * An old address of the Listings pages. Since 18 Nov 2026 it is the
 * Listings dashboard's reports row, and this forwards there with the same
 * search, filters and open record, so a bookmark or an emailed link still
 * lands on the right record (`src/server/directory/notify.ts`).
 */
export const Route = createFileRoute("/_authenticated/admin/listing-reports")({
  validateSearch: (search: Record<string, unknown>) => search,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/admin/listings", search: forwardedSearch("reports", search), replace: true })
  },
})
