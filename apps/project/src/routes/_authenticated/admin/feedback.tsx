import { createFileRoute, redirect } from "@tanstack/react-router"

import { readOpenSearch } from "@/lib/hooks/use-open-from-link"

/**
 * Feedback is the Admin dashboard's Feedback tab (Tyler, 8 Nov 2026), keeping
 * `?open=` so a link to one thread opens it. This address stays so old links
 * and bookmarks land.
 */
export const Route = createFileRoute("/_authenticated/admin/feedback")({
  validateSearch: readOpenSearch,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/admin/dashboard", search: { tab: "feedback", open: search.open }, replace: true })
  },
})
