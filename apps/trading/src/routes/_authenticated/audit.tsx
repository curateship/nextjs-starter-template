import { createFileRoute } from "@tanstack/react-router"

import { AuditDashboard } from "@/components/trading/audit-dashboard"
import { loadAuditPage } from "@/lib/api/audit"

export const Route = createFileRoute("/_authenticated/audit")({
  loader: () => loadAuditPage(),
  component: AuditRoute,
})

function AuditRoute() {
  const initial = Route.useLoaderData()
  return <AuditDashboard initial={initial} />
}
