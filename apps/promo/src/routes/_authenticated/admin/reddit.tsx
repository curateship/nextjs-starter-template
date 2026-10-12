import { createFileRoute, redirect } from "@tanstack/react-router"

/**
 * The Reddit dashboard's old address. The Projects dashboard replaced it on
 * 12 Oct 2026, so an old bookmark lands there.
 */
export const Route = createFileRoute("/_authenticated/admin/reddit")({
  beforeLoad: () => {
    throw redirect({ to: "/admin/projects", replace: true })
  },
})
