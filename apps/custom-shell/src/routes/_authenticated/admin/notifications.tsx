import { createFileRoute } from "@tanstack/react-router"

import { NotificationsPage } from "@/components/admin/notifications-page"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { loadAdminNotificationsPage } from "@/lib/api/notification"

// Admin access is enforced once by the /admin layout route.
export const Route = createFileRoute("/_authenticated/admin/notifications")({
  // No page size here: the server reads the configured rows-per-page and sends
  // it back, so the first page holds exactly what the table will show.
  loader: () => loadAdminNotificationsPage({ page: 1 }),
  component: NotificationsRoute,
})

function NotificationsRoute() {
  const { notifications, total, pageSize } = Route.useLoaderData()
  const runtime = useShellRuntime()

  return (
    <NotificationsPage
      initialNotifications={notifications}
      initialTotal={total}
      defaultPageSize={pageSize}
      onOpenFeedbackThread={runtime.onOpenFeedbackThread}
    />
  )
}
