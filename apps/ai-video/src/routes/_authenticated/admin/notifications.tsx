import { createFileRoute, redirect } from "@tanstack/react-router"

import { NotificationsPage } from "@/components/notifications-page"
import { useShellRuntime } from "@/components/shell-runtime"
import { loadCurrentUser } from "@/lib/api/auth"

export const Route = createFileRoute("/_authenticated/admin/notifications")({
  loader: async () => {
    const user = await loadCurrentUser()
    if (user?.role !== "admin") {
      throw redirect({ to: "/" })
    }
  },
  component: NotificationsRoute,
})

function NotificationsRoute() {
  const runtime = useShellRuntime()
  return (
    <NotificationsPage
      defaultRowsPerPage={runtime.config.dashboardRowsPerPage}
      onOpenFeedbackThread={runtime.onOpenFeedbackThread}
    />
  )
}
