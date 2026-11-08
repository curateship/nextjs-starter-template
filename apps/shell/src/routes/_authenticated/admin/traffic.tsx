import { createFileRoute, redirect } from "@tanstack/react-router"

import { readAnalyticsRange } from "@/lib/analytics/range"

/**
 * Traffic is the Admin dashboard's Overview tab (Tyler, 8 Nov 2026), keeping
 * its `?days=` as the range. This address stays so old links and bookmarks
 * land.
 */
export const Route = createFileRoute("/_authenticated/admin/traffic")({
  validateSearch: (search: Record<string, unknown>) => ({ days: readAnalyticsRange(search.days) }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/admin/dashboard", search: { tab: "overview", range: search.days }, replace: true })
  },
})
