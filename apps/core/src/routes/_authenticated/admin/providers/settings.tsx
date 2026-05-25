import { createFileRoute, redirect } from "@tanstack/react-router"

export const Route = createFileRoute("/_authenticated/admin/providers/settings")({
  loader: () => {
    throw redirect({ to: "/admin/settings/$tab", params: { tab: "providers" } })
  },
})
