import { createFileRoute, useRouter, type ErrorComponentProps } from "@tanstack/react-router"

import { AdminAnnouncementsDashboard } from "@/components/admin/admin-announcements-dashboard"
import { ErrorBanner } from "@/components/ui/error-banner"
import { TableSurface } from "@/components/ui/table"
import {
  getAnnouncementErrorMessage,
  loadAdminAnnouncements,
} from "@/lib/api/announcements"
import { readOpenSearch } from "@/lib/use-open-from-link"

/** `?open=<id>` is how the feeds dashboard links to one announcement. */
export const Route = createFileRoute("/_authenticated/admin/announcements")({
  validateSearch: readOpenSearch,
  loader: () => loadAdminAnnouncements(),
  component: AdminAnnouncementsRoute,
  errorComponent: AdminAnnouncementsErrorRoute,
})

function AdminAnnouncementsRoute() {
  const { announcements } = Route.useLoaderData()
  const { open } = Route.useSearch()

  return (
    <AdminAnnouncementsDashboard announcements={announcements} openId={open} />
  )
}

/** A database that would not answer. Say so and leave a way to try again. */
function AdminAnnouncementsErrorRoute({ error }: ErrorComponentProps) {
  const router = useRouter()

  return (
    <TableSurface>
      <ErrorBanner
        message={getAnnouncementErrorMessage(error)}
        onRetry={() => void router.invalidate()}
      />
    </TableSurface>
  )
}
