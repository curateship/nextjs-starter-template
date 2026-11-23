import { createFileRoute } from "@tanstack/react-router"

import { BotRunsDashboard } from "@/components/bots/bot-runs-dashboard"
import { loadBots } from "@/lib/api/bots"

export const Route = createFileRoute("/_authenticated/bots/")({
  loader: () => loadBots(),
  component: BotsRoute,
})

function BotsRoute() {
  const initial = Route.useLoaderData()
  return <BotRunsDashboard initial={initial} />
}
