/* eslint-disable react-refresh/only-export-components */
import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
  useRouterState,
} from "@tanstack/react-router"
import { BotIcon } from "lucide-react"

import { DashboardTable } from "@/components/dashboard-table"
import { Button } from "@/components/ui/button"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { loadCurrentUser } from "@/lib/api/auth"
import { scraperModules } from "@/scrapers"

export const Route = createFileRoute("/_authenticated/admin/scrapers")({
  loader: async () => {
    const user = await loadCurrentUser()
    if (user?.role !== "admin") throw redirect({ to: "/" })
  },
  component: ScrapersRoute,
})

function ScrapersRoute() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  if (pathname !== "/admin/scrapers") {
    return <Outlet />
  }

  return (
    <div className="w-full pb-8">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h1 className="font-heading text-xl font-semibold">Scrapers</h1>
          <p className="text-sm text-muted-foreground">
            Registered scraper modules.
          </p>
        </div>
      </div>
      <DashboardTable
        title="Modules"
        icon={<BotIcon className="size-4 text-muted-foreground sm:size-[18px]" />}
        count={scraperModules.length}
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="main">Scraper</TableHead>
              <TableHead column="meta">Provider</TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={scraperModules.length === 0}
        emptyText="No scraper modules found."
        emptyColSpan={3}
        footer={{ type: "summary", count: scraperModules.length, label: "modules" }}
      >
        {scraperModules.map((module) => (
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
