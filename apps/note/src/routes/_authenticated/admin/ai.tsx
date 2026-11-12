import { createFileRoute, redirect } from "@tanstack/react-router"

/**
 * AI usage is part of the Admin dashboard's Overview tab (Tyler, 8 Nov 2026).
 * This address stays so old links and bookmarks land.
 */
export const Route = createFileRoute("/_authenticated/admin/ai")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/dashboard", search: { tab: "overview" }, replace: true })
  },
})
