import { createFileRoute } from "@tanstack/react-router"

import { ContactsPage } from "@/components/broadcasts/contacts-page"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getContactLoadErrorMessage,
  loadContactsPage,
} from "@/lib/api/contacts"

export const Route = createFileRoute("/_authenticated/admin/contacts")({
  loader: () => loadContactsPage(),
  component: AdminContactsRoute,
  errorComponent: routeErrorComponent(getContactLoadErrorMessage),
})

function AdminContactsRoute() {
  return <ContactsPage initial={Route.useLoaderData()} />
}
