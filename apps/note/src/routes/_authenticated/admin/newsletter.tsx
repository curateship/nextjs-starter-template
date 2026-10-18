import { createFileRoute } from "@tanstack/react-router"

import { BroadcastsListPage } from "@/components/broadcasts/broadcasts-list-page"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getBroadcastLoadErrorMessage,
  loadBroadcastsPage,
} from "@/lib/api/email/broadcasts"

export const Route = createFileRoute("/_authenticated/admin/newsletter")({
  loader: () => loadBroadcastsPage(),
  component: AdminNewsletterRoute,
  errorComponent: routeErrorComponent(getBroadcastLoadErrorMessage),
})

function AdminNewsletterRoute() {
  return <BroadcastsListPage initial={Route.useLoaderData()} />
}
