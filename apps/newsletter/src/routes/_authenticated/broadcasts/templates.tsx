import { createFileRoute } from "@tanstack/react-router"

import { BroadcastTemplatesPage } from "@/components/broadcasts/templates-page"

export const Route = createFileRoute("/_authenticated/broadcasts/templates")({
  component: BroadcastTemplatesPage,
})
