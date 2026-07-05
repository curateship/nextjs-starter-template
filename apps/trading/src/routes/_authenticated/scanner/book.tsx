import { createFileRoute } from "@tanstack/react-router"

import { BookDashboard } from "@/components/scanner/book-dashboard"
import { loadBookMetrics } from "@/lib/api/scanner"

export const Route = createFileRoute("/_authenticated/scanner/book")({
  loader: () => loadBookMetrics(),
  component: BookRoute,
})

function BookRoute() {
  const initial = Route.useLoaderData()
  return <BookDashboard initial={initial} />
}
