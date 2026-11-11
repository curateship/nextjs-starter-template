import { createFileRoute, redirect } from "@tanstack/react-router"

/**
 * Pages is the Admin dashboard's Pages section (Tyler, 9 Nov 2026:
 * "consolidate the pages, navigation and styling into the admin dashboard").
 * This address stays so old links, bookmarks and the page builder's Back
 * land there, on the page they name when they name one.
 */
export const Route = createFileRoute("/_authenticated/admin/pages")({
  validateSearch: (search: Record<string, unknown>) => ({
    open: typeof search.open === "string" && search.open.startsWith("/") && search.open.length <= 512 ? search.open : undefined,
  }),
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/admin/dashboard", search: { tab: "pages", open: search.open }, replace: true })
  },
})
