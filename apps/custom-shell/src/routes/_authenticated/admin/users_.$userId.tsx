import {
  createFileRoute,
  Link,
  useRouter,
  type ErrorComponentProps,
} from "@tanstack/react-router"
import { ArrowLeftIcon } from "lucide-react"

import { AdminAccountPage } from "@/components/admin/admin-account-page"
import { Button } from "@/components/ui/button"
import { ErrorBanner } from "@/components/ui/error-banner"
import { TableSurface } from "@/components/ui/table"
import {
  getAdminUserErrorMessage,
  loadAdminAccountDetail,
} from "@/lib/api/admin-users"

export const Route = createFileRoute("/_authenticated/admin/users_/$userId")({
  loader: ({ params }) => loadAdminAccountDetail(params.userId),
  component: AdminAccountRoute,
  errorComponent: AdminAccountErrorRoute,
})

function AdminAccountRoute() {
  const { detail, plans } = Route.useLoaderData()
  const router = useRouter()

  return (
    <AdminAccountPage
      // Remount when switching people so no panel keeps the last one's state.
      key={detail.profile.id}
      detail={detail}
      plans={plans}
      // Every panel is loader data, so re-running the loader is what refreshes
      // the page after the account modal saves — there is nothing to patch by
      // hand and no chance of one card disagreeing with another.
      onSaved={() => router.invalidate()}
    />
  )
}

/**
 * A deleted account, or a database that would not answer. Either way there is
 * nothing to show, so say which in plain words and leave the way back — the
 * default crash screen put the database's own error code on screen.
 */
function AdminAccountErrorRoute({ error }: ErrorComponentProps) {
  const router = useRouter()
  const gone =
    error instanceof Error && error.message.includes("USER_NOT_FOUND")

  return (
    <div
      className="flex w-full flex-col"
      style={{ gap: "var(--shell-gutter, 1.5rem)" }}
    >
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon">
          <Link to="/admin/users" aria-label="Back to Users">
            <ArrowLeftIcon className="size-4" />
          </Link>
        </Button>
        <h1 className="text-base font-medium">Account</h1>
      </div>
      <TableSurface>
        <ErrorBanner
          message={getAdminUserErrorMessage(error)}
          // Retrying a lookup for somebody who is gone can only fail again.
          onRetry={gone ? undefined : () => void router.invalidate()}
        />
      </TableSurface>
    </div>
  )
}
