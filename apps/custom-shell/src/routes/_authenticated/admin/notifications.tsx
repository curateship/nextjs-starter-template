import { createFileRoute } from "@tanstack/react-router"

import { NotificationsPage } from "@/components/admin/notifications-page"
import { useShellRuntime } from "@/components/shell/shell-layout"

// Admin access is enforced once by the /admin layout route.
export const Route = createFileRoute("/_authenticated/admin/notifications")({
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
