import { createFileRoute, redirect } from "@tanstack/react-router"

/**
 * The Notifications history page was removed with the Admin dashboard (Tyler,
 * 8 Nov 2026); the address lands on it. This address stays so old links and
 * bookmarks land.
 */
export const Route = createFileRoute("/_authenticated/admin/notifications")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/dashboard", replace: true })
  },
})
