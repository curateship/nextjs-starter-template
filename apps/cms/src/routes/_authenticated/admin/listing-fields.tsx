import { createFileRoute } from "@tanstack/react-router"

import { CustomSectionsDashboard } from "@/components/directory/custom-sections-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getCustomSectionErrorMessage,
  loadCustomSectionRows,
} from "@/lib/api/directory/custom-sections"

export const Route = createFileRoute("/_authenticated/admin/listing-fields")({
  loader: () => loadCustomSectionRows(),
  component: AdminListingFieldsRoute,
  errorComponent: routeErrorComponent(getCustomSectionErrorMessage),
})

function AdminListingFieldsRoute() {
  return <CustomSectionsDashboard sections={Route.useLoaderData()} />
}
