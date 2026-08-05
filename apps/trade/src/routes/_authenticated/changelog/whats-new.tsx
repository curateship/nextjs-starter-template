import { createFileRoute } from "@tanstack/react-router"

import { ChangelogPage } from "@/components/changelog/changelog-page"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getChangelogErrorMessage, loadChangelog } from "@/lib/api/changelog"

export const Route = createFileRoute("/_authenticated/changelog/whats-new")({
  loader: () => loadChangelog(),
  component: WhatsNewRoute,
  errorComponent: routeErrorComponent(getChangelogErrorMessage),
})

function WhatsNewRoute() {
  const { entries } = Route.useLoaderData()

  return <ChangelogPage initialEntries={entries} />
}
