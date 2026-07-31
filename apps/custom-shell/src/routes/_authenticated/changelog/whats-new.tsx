import { createFileRoute } from "@tanstack/react-router"

import { ChangelogPage } from "@/components/changelog/changelog-page"
import { loadChangelog } from "@/lib/api/changelog"

export const Route = createFileRoute("/_authenticated/changelog/whats-new")({
  loader: () => loadChangelog(),
  component: WhatsNewRoute,
})

function WhatsNewRoute() {
  const { entries } = Route.useLoaderData()

  return <ChangelogPage initialEntries={entries} />
}
