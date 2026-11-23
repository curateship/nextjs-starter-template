import { createFileRoute } from "@tanstack/react-router"

import { HistoryPage } from "@/components/pomoder/history-page"

export const Route = createFileRoute("/_pomoder/history")({
  component: HistoryPage,
})
