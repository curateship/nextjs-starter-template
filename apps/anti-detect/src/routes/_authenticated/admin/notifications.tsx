import { createFileRoute } from "@tanstack/react-router"

import { NotificationsPage } from "@/components/notifications-page"
import { useShellRuntime } from "@/components/shell-layout"
import { requireAdminRoute } from "@/lib/admin-route"

export const Route = createFileRoute("/_authenticated/admin/notifications")({
  loader: requireAdminRoute,
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
