import { createFileRoute, redirect } from "@tanstack/react-router"

import { forwardedSearch } from "@/lib/directory/listings-dashboard-search"

/**
 * An old address of Admin → Promotions. Since 18 Nov 2026 it is the Listings
 * dashboard's promotions row (Tyler: "we have to move promotions in the new
 * dashboard too"), and this forwards there with the same search, filters and
 * open record, so a bookmark or an emailed link still lands on the right
 * record (`src/server/directory/notify.ts`).
 */
export const Route = createFileRoute("/_authenticated/admin/promotions")({
  validateSearch: (search: Record<string, unknown>) => search,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/admin/listings", search: forwardedSearch("promotions", search), replace: true })
  },
})
