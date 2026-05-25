/* eslint-disable react-refresh/only-export-components */
import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
  useRouterState,
} from "@tanstack/react-router"
import * as React from "react"
import { BotIcon } from "lucide-react"

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
import { scraperModules } from "@/scrapers"

type ScraperSortColumn = "name" | "provider"

export const Route = createFileRoute("/_authenticated/admin/scrapers")({
  loader: async () => {
    const user = await loadCurrentUser()
    if (user?.role !== "admin") throw redirect({ to: "/" })
  },
  component: ScrapersRoute,
})

function ScrapersRoute() {
  const [sortColumn, setSortColumn] = React.useState<ScraperSortColumn>("name")
  const [sortDirection, setSortDirection] = React.useState<TableSortDirection>("asc")
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  if (pathname !== "/admin/scrapers") {
    return <Outlet />
  }

  const sortedModules = [...scraperModules].sort((a, b) => {
    const direction = sortDirection === "asc" ? 1 : -1
    if (sortColumn === "provider") return 0
    return a.name.localeCompare(b.name) * direction
  })

  const toggleSort = (column: ScraperSortColumn) => {
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
        title="Modules"
        icon={<BotIcon className="size-4 text-muted-foreground sm:size-[18px]" />}
        count={sortedModules.length}
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="main">
                <TableSortButton active={sortColumn === "name"} direction={sortDirection} onClick={() => toggleSort("name")}>
                  Scraper
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
        isEmpty={sortedModules.length === 0}
        emptyText="No scraper modules found."
        emptyColSpan={3}
        footer={{ type: "summary", count: sortedModules.length, label: "modules" }}
      >
        {sortedModules.map((module) => (
          <TableRow key={module.key}>
            <TableCell column="main">
              <Link
                to="/admin/scrapers/google-maps"
                className="inline-flex items-center gap-2 font-medium hover:underline"
              >
                <module.icon className="size-4 text-muted-foreground" />
                {module.name}
              </Link>
            </TableCell>
            <TableCell column="meta">Apify</TableCell>
            <TableCell column="meta">
              <Button asChild variant="outline" size="sm" className="h-8 sm:h-9">
                <Link to="/admin/scrapers/google-maps">Open</Link>
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>
    </div>
  )
}
