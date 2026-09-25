/* eslint-disable react-refresh/only-export-components */
import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
  useRouterState,
} from "@tanstack/react-router"
import * as React from "react"
import { DatabaseZapIcon } from "lucide-react"

import { DashboardTable } from "@/components/dashboard-table"
import { Button } from "@/components/ui/button"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableSortButton,
  TableRow,
  type TableSortDirection,
} from "@/components/ui/table"
import { loadCurrentUser } from "@/lib/api/auth"
import { providers } from "@/providers"

type ProviderSortColumn = "name" | "provider"

export const Route = createFileRoute("/_authenticated/admin/datasource")({
  loader: async () => {
    const user = await loadCurrentUser()
    if (user?.role !== "admin") throw redirect({ to: "/" })
  },
  component: ProvidersRoute,
})

function ProvidersRoute() {
  const [sortColumn, setSortColumn] = React.useState<ProviderSortColumn>("name")
  const [sortDirection, setSortDirection] = React.useState<TableSortDirection>("asc")
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  if (pathname !== "/admin/datasource") {
    return <Outlet />
  }

  const sortedProviders = [...providers].sort((a, b) => {
    const direction = sortDirection === "asc" ? 1 : -1
    if (sortColumn === "provider") return 0
    return a.name.localeCompare(b.name) * direction
  })

  const toggleSort = (column: ProviderSortColumn) => {
    if (sortColumn === column) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"))
      return
    }

    setSortColumn(column)
    setSortDirection("asc")
  }

  return (
    <div className="w-full pb-8">
      <DashboardTable
        title="Data Sources"
        icon={<DatabaseZapIcon className="text-muted-foreground" />}
        count={sortedProviders.length}
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="main">
                <TableSortButton active={sortColumn === "name"} direction={sortDirection} onClick={() => toggleSort("name")}>
                  Data Source
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">
                <TableSortButton active={sortColumn === "provider"} direction={sortDirection} onClick={() => toggleSort("provider")}>
                  Provider
                </TableSortButton>
              </TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={sortedProviders.length === 0}
        emptyText="No providers found."
        emptyColSpan={3}
        footer={{ type: "summary", count: sortedProviders.length, label: "providers" }}
      >
        {sortedProviders.map((provider) => (
          <TableRow key={provider.key}>
            <TableCell column="main">
              <Link
                to="/admin/datasource/google-maps"
                className="inline-flex items-center gap-2 font-medium hover:underline"
              >
                <provider.icon className="size-4 text-muted-foreground" />
                {provider.name}
              </Link>
            </TableCell>
            <TableCell column="meta">Apify</TableCell>
            <TableCell column="meta">
              <Button asChild variant="outline" size="sm" className="h-8 sm:h-9">
                <Link to="/admin/datasource/google-maps">Open</Link>
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>
    </div>
  )
}
