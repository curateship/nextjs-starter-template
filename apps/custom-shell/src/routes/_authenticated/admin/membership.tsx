import {
  createFileRoute,
  useRouter,
  type ErrorComponentProps,
} from "@tanstack/react-router"

import { AdminMembershipDashboard } from "@/components/admin/admin-membership-dashboard"
import { ErrorBanner } from "@/components/ui/error-banner"
import { TableSurface } from "@/components/ui/table"
import { getMembershipErrorMessage, loadMembership } from "@/lib/api/membership"

export const Route = createFileRoute("/_authenticated/admin/membership")({
  loader: async () => ({ summary: await loadMembership() }),
  component: AdminMembershipRoute,
  errorComponent: AdminMembershipErrorRoute,
})

function AdminMembershipRoute() {
  const { summary } = Route.useLoaderData()

  return <AdminMembershipDashboard summary={summary} />
}

/** A database that would not answer. Say so and leave a way to try again. */
function AdminMembershipErrorRoute({ error }: ErrorComponentProps) {
  const router = useRouter()

  return (
    <TableSurface>
      <ErrorBanner
        message={getMembershipErrorMessage(error)}
        onRetry={() => void router.invalidate()}
      />
    </TableSurface>
  )
}
