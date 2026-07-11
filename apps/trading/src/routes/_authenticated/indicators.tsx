import { createFileRoute } from "@tanstack/react-router"

import { IndicatorsDashboard } from "@/components/indicators/indicators-dashboard"
import { loadIndicators } from "@/lib/api/indicators"

export const Route = createFileRoute("/_authenticated/indicators")({
  loader: () => loadIndicators(),
  component: IndicatorsRoute,
})

function IndicatorsRoute() {
  const indicators = Route.useLoaderData()
  return <IndicatorsDashboard initial={indicators} />
}
