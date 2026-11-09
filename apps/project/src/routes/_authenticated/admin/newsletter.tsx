import { createFileRoute, redirect } from "@tanstack/react-router"

/**
 * The newsletter list is the CRM's Broadcasts tab (Tyler, 7 Nov 2026). This
 * address stays so old links and bookmarks land.
 */
export const Route = createFileRoute("/_authenticated/admin/newsletter")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/crm", search: { tab: "broadcasts" }, replace: true })
  },
})
