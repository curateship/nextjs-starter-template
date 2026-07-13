import * as React from "react"
import { getRouteApi, useRouter } from "@tanstack/react-router"

import { BacktestAutomationDialog } from "@/components/automations/backtest-automation-dialog"
import { AutomationEditor } from "@/components/automations/automation-editor"
import { NewBotDialog } from "@/components/bots/new-bot-dialog"
import { WorkspaceLoadBoundary } from "@/components/loading-skeleton"
import { Button } from "@/components/ui/button"
import { getAutomationErrorMessage } from "@/lib/api/automations"

const routeApi = getRouteApi("/_authenticated/automations/$automationId")

export function AutomationRouteContent() {
  const { automation, pinnedIndicators, indicatorParamSeeds } =
    routeApi.useLoaderData()
  const router = useRouter()
  const [botOpen, setBotOpen] = React.useState(false)
  const [backtestOpen, setBacktestOpen] = React.useState(false)

  return (
    <>
      <WorkspaceLoadBoundary>
        <AutomationEditor
          key={automation.id}
          initial={automation}
          pinnedIndicators={pinnedIndicators}
          indicatorParamSeeds={indicatorParamSeeds}
          onCreateBot={() => setBotOpen(true)}
          onBacktest={() => setBacktestOpen(true)}
        />
      </WorkspaceLoadBoundary>

      <NewBotDialog
        open={botOpen}
        onOpenChange={setBotOpen}
        initialAutomationId={automation.id}
        onCreated={(botId) =>
          void router.navigate({ to: "/bots/$botId", params: { botId } })
        }
      />

      <BacktestAutomationDialog
        open={backtestOpen}
        onOpenChange={setBacktestOpen}
        automationId={automation.id}
        automationName={automation.name}
        interval={automation.interval}
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
