import { createFileRoute } from "@tanstack/react-router"

import { TemplatesDashboard } from "@/components/backtest/templates-dashboard"
import { loadStrategyTemplates } from "@/lib/api/backtests"

export const Route = createFileRoute("/_authenticated/templates")({
  loader: () => loadStrategyTemplates(),
  component: TemplatesRoute,
})

function TemplatesRoute() {
  const { strategyDefaults, templates } = Route.useLoaderData()
  return (
    <TemplatesDashboard strategyDefaults={strategyDefaults} templates={templates} />
  )
}
