import { createFileRoute, redirect } from "@tanstack/react-router"

import { oldPageSearch } from "@/lib/pomodoro/flowfly-search"

/**
 * This page moved into the Flowfly admin dashboard on 13 Nov 2026 (Tyler:
 * "consolidate and combine all of the app's dashboard into one 3 panel
 * dashboard"). The old address forwards to its tab there, keeping the rest of
 * its address, so a bookmark or an old link still lands in the right list.
 * `OLD_ADMIN_PAGES` in `src/lib/pomodoro/flowfly-search.ts` says where.
 */
export const Route = createFileRoute("/_authenticated/admin/pomodoro-media")({
  beforeLoad: ({ location }) => {
    throw redirect({
      to: "/admin/flowfly",
      search: oldPageSearch("pomodoro-media", location.search as Record<string, unknown>),
      replace: true,
    })
  },
})
