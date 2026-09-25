import { createFileRoute } from "@tanstack/react-router"

import { routeErrorComponent } from "@/components/shell/route-error"
import { DevOutboxPage } from "@/components/system-emails/dev-outbox-page"
import {
  getDevOutboxErrorMessage,
  loadDevOutbox,
} from "@/lib/api/email/dev-outbox"

export const Route = createFileRoute("/_authenticated/admin/dev-outbox")({
  loader: () => loadDevOutbox(),
  component: AdminDevOutboxRoute,
  errorComponent: routeErrorComponent(getDevOutboxErrorMessage),
})

function AdminDevOutboxRoute() {
  return <DevOutboxPage emails={Route.useLoaderData()} />
}
