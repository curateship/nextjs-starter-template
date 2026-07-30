import { createFileRoute } from "@tanstack/react-router"

import { AdminAuditDashboard } from "@/components/admin/admin-audit-dashboard"
import { useShellRuntime } from "@/components/shell/shell-layout"
import {
  AUDIT_LOADER_PAGE_SIZE,
  listAdminAuditLogs,
} from "@/lib/api/admin-audit"

export const Route = createFileRoute("/_authenticated/admin/audit")({
  loader: () =>
    listAdminAuditLogs({ page: 1, pageSize: AUDIT_LOADER_PAGE_SIZE }),
  component: AdminAuditRoute,
})

function AdminAuditRoute() {
  const { entries, total, options } = Route.useLoaderData()
  const runtime = useShellRuntime()

  return (
    <AdminAuditDashboard
      initialEntries={entries}
      initialTotal={total}
      initialOptions={options}
      defaultPageSize={runtime.config.dashboardRowsPerPage}
    />
  )
}
