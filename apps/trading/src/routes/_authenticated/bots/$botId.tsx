import { createFileRoute } from "@tanstack/react-router"

import { BotDetail } from "@/components/bots/bot-detail"
import { loadBotDetail } from "@/lib/api/bots"

export const Route = createFileRoute("/_authenticated/bots/$botId")({
  loader: ({ params }) => loadBotDetail(params.botId),
  component: BotDetailRoute,
})

function BotDetailRoute() {
  const initial = Route.useLoaderData()
  const { botId } = Route.useParams()
  return <BotDetail botId={botId} initial={initial} />
}
