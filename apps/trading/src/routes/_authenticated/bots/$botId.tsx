import { createFileRoute, useRouter } from "@tanstack/react-router"

import { BotWorkspace } from "@/components/bots/bot-workspace"
import { Button } from "@/components/ui/button"
import { getBotErrorMessage, loadBotDetail } from "@/lib/api/bots"

export const Route = createFileRoute("/_authenticated/bots/$botId")({
  loader: ({ params }) => loadBotDetail(params.botId),
  // The workspace self-refreshes via useIntervalLoader (which swallows
  // transient errors), so the route loader should not auto-revalidate on
  // focus/navigation — a momentary server blip must not hard-crash the page.
  staleTime: Infinity,
  errorComponent: BotDetailError,
  component: BotDetailRoute,
})

function BotDetailRoute() {
  const initial = Route.useLoaderData()
  const { botId } = Route.useParams()
  return <BotWorkspace botId={botId} initial={initial} />
}

function BotDetailError({ error }: { error: unknown }) {
  const router = useRouter()
  return (
    <div className="flex h-[calc(100vh-var(--header-height,3.5rem))] flex-col items-center justify-center gap-4 p-8 text-center">
      <div>
        <p className="text-sm font-semibold">Couldn't load this bot</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {getBotErrorMessage(error)}
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => void router.navigate({ to: "/bots" })}
        >
          Back to bots
        </Button>
        <Button type="button" onClick={() => void router.invalidate()}>
          Retry
        </Button>
      </div>
    </div>
  )
}
