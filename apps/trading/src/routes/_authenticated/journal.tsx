import { createFileRoute } from "@tanstack/react-router"

import { JournalWorkspace } from "@/components/journal/journal-workspace"
import { loadJournalOverview } from "@/lib/api/journal"

export const Route = createFileRoute("/_authenticated/journal")({
  loader: async () => {
    const journal = await loadJournalOverview()
    return { journal }
  },
  component: JournalRoute,
})

function JournalRoute() {
  const { journal } = Route.useLoaderData()
  return <JournalWorkspace initial={journal} />
}
