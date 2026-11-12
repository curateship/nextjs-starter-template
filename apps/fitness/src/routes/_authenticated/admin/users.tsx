import { createFileRoute, redirect } from "@tanstack/react-router"

import { readOpenSearch } from "@/lib/hooks/use-open-from-link"

/**
 * Users is the Admin dashboard's Users tab (Tyler, 8 Nov 2026), keeping
 * `?open=` so a link to one person opens them. This address stays so old links
 * and bookmarks land.
 */
export const Route = createFileRoute("/_authenticated/admin/users")({
  validateSearch: readOpenSearch,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/admin/dashboard", search: { tab: "users", open: search.open }, replace: true })
  },
})
