/* eslint-disable react-refresh/only-export-components */
import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
  useRouterState,
} from "@tanstack/react-router"
import { BotIcon } from "lucide-react"

import {
  DashboardToolbar,
  DashboardToolbarTitle,
} from "@/components/dashboard-toolbar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSurface,
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
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Scrapers</h1>
        <p className="text-sm text-muted-foreground">Registered scraper modules.</p>
      </div>
      <TableSurface>
        <DashboardToolbar>
          <DashboardToolbarTitle>
            <BotIcon className="size-4 text-muted-foreground" />
            <span className="text-sm font-medium sm:text-base">Modules</span>
            <Badge variant="secondary">{scraperModules.length}</Badge>
          </DashboardToolbarTitle>
        </DashboardToolbar>
        <ScrollArea className="w-full">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead column="main">Scraper</TableHead>
                <TableHead column="meta">Provider</TableHead>
                <TableHead column="meta">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
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
            </TableBody>
          </Table>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </TableSurface>
    </div>
  )
}
