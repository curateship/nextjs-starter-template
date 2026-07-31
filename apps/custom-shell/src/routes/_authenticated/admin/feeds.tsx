import {
  createFileRoute,
  useRouter,
  type ErrorComponentProps,
} from "@tanstack/react-router"

import { AdminFeedsDashboard } from "@/components/admin/admin-feeds-dashboard"
import { ErrorBanner } from "@/components/ui/error-banner"
import { TableSurface } from "@/components/ui/table"
import { getFeedsErrorMessage, loadFeeds } from "@/lib/api/feeds"

export const Route = createFileRoute("/_authenticated/admin/feeds")({
  loader: async () => ({ summary: await loadFeeds() }),
  component: AdminFeedsRoute,
  errorComponent: AdminFeedsErrorRoute,
})

function AdminFeedsRoute() {
  const { summary } = Route.useLoaderData()

  return <AdminFeedsDashboard summary={summary} />
}

/** A database that would not answer. Say so and leave a way to try again. */
function AdminFeedsErrorRoute({ error }: ErrorComponentProps) {
  const router = useRouter()

  return (
    <TableSurface>
      <ErrorBanner
        message={getFeedsErrorMessage(error)}
        onRetry={() => void router.invalidate()}
      />
    </TableSurface>
  )
}
