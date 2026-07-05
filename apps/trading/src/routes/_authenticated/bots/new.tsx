import { ClientOnly, createFileRoute } from "@tanstack/react-router"

import { BotWizard } from "@/components/bots/bot-wizard"
import { loadTradingContext } from "@/lib/api/trading"

export const Route = createFileRoute("/_authenticated/bots/new")({
  loader: () => loadTradingContext(),
  component: NewBotRoute,
})

function NewBotRoute() {
  const { network, wallets } = Route.useLoaderData()
  return (
    <ClientOnly
      fallback={
        <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
          Loading…
        </div>
      }
    >
      <BotWizard network={network} wallets={wallets} />
    </ClientOnly>
  )
}
