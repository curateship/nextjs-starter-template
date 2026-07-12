import * as React from "react"
import { getRouteApi, useRouter } from "@tanstack/react-router"

import { AutomationEditor } from "@/components/automations/automation-editor"
import { NewRunDialog } from "@/components/backtest/new-run-dialog"
import { NewBotDialog } from "@/components/bots/new-bot-dialog"
import { QuickTestDialog } from "@/components/chart/quick-test-dialog"
import { Button } from "@/components/ui/button"
import { getAutomation, getAutomationErrorMessage } from "@/lib/api/automations"
import type { AutomationStrategyConfig } from "@/lib/automations/automation"
import { useMarketRows } from "@/lib/hl/hooks"

const routeApi = getRouteApi("/_authenticated/automations/$automationId")

export function AutomationRouteContent() {
  const { automation, trading, pinnedIndicators, indicatorParamSeeds } =
    routeApi.useLoaderData()
  const router = useRouter()
  const markets = useMarketRows(trading.network)
  const defaultMarket =
    markets.find((row) => row.coin === "BTC")?.coin ?? markets[0]?.coin ?? "BTC"
  const [quickTestOpen, setQuickTestOpen] = React.useState(false)
  const [botOpen, setBotOpen] = React.useState(false)
  const [backtestOpen, setBacktestOpen] = React.useState(false)
  const [quickConfig, setQuickConfig] =
    React.useState<AutomationStrategyConfig | null>(null)
  const [launchError, setLaunchError] = React.useState<string | null>(null)

  const openQuickTest = async () => {
    setLaunchError(null)
    try {
      const saved = await getAutomation(automation.id)
      if (!saved.compiledConfig) {
        setLaunchError("Save a valid Automation before running Quick Test.")
        return
      }
      setQuickConfig(saved.compiledConfig)
      setQuickTestOpen(true)
    } catch (error) {
      setLaunchError(getAutomationErrorMessage(error))
    }
  }

  return (
    <>
      <AutomationEditor
        key={automation.id}
        initial={automation}
        pinnedIndicators={pinnedIndicators}
        indicatorParamSeeds={indicatorParamSeeds}
        onQuickTest={() => void openQuickTest()}
        onCreateBot={() => {
          setLaunchError(null)
          setBotOpen(true)
        }}
        onCreateBacktest={() => {
          setLaunchError(null)
          setBacktestOpen(true)
        }}
      />

      {launchError ? (
        <div
          role="alert"
          className="fixed top-16 right-4 z-50 rounded-md border border-destructive/30 bg-background px-3 py-2 text-sm text-destructive shadow-lg"
        >
          {launchError}
        </div>
      ) : null}

      <QuickTestDialog
        open={quickTestOpen}
        onOpenChange={setQuickTestOpen}
        network={trading.network}
        networkEditable={trading.mainnetEnabled}
        market={defaultMarket}
        marketOptions={markets}
        config={quickConfig}
        automationId={automation.id}
        onSaved={(backtestId) =>
          void router.navigate({
            to: "/backtest",
            search: { run: backtestId },
          })
        }
      />

      <NewBotDialog
        open={botOpen}
        onOpenChange={setBotOpen}
        initialAutomationId={automation.id}
        onCreated={(botId) =>
          void router.navigate({ to: "/bots/$botId", params: { botId } })
        }
      />

      <NewRunDialog
        open={backtestOpen}
        onOpenChange={setBacktestOpen}
        markets={markets}
        defaultMarket={defaultMarket}
        initialAutomationId={automation.id}
        onLaunched={(backtestId) =>
          void router.navigate({
            to: "/backtest",
            search: { run: backtestId },
          })
        }
      />
    </>
  )
}

export function AutomationRouteError({ error }: { error: unknown }) {
  const router = useRouter()
  return (
    <div className="flex h-64 flex-col items-center justify-center gap-4 text-center">
      <div>
        <p className="text-sm font-semibold">Could not load this automation</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {getAutomationErrorMessage(error)}
        </p>
      </div>
      <div className="flex gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => void router.navigate({ to: "/automations" })}
        >
          Back to Automations
        </Button>
        <Button type="button" onClick={() => void router.invalidate()}>
          Retry
        </Button>
      </div>
    </div>
  )
}
