import { getRouteApi } from "@tanstack/react-router"

import { AutomationsDashboard } from "@/components/automations/automations-dashboard"

const routeApi = getRouteApi("/_authenticated/automations/")

export function AutomationsRouteContent() {
  const { automations } = routeApi.useLoaderData()
  return <AutomationsDashboard initial={automations} />
}
