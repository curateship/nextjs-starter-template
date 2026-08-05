import { createFileRoute } from "@tanstack/react-router"

import { routeErrorComponent } from "@/components/shell/route-error"
import { SystemEmailsPage } from "@/components/system-emails/system-emails-page"
import {
  getSystemEmailLoadErrorMessage,
  loadSystemEmailsPage,
} from "@/lib/api/system-emails"

export const Route = createFileRoute("/_authenticated/admin/system-emails")({
  loader: () => loadSystemEmailsPage(),
  component: AdminSystemEmailsRoute,
  errorComponent: routeErrorComponent(getSystemEmailLoadErrorMessage),
})

function AdminSystemEmailsRoute() {
  return <SystemEmailsPage initial={Route.useLoaderData()} />
}
