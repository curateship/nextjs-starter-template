import { createFileRoute } from "@tanstack/react-router"

import { BroadcastsPage } from "@/components/broadcasts/broadcasts-page"

export const Route = createFileRoute("/_authenticated/broadcasts/")({
  component: BroadcastsPage,
})
