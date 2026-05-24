/* eslint-disable react-refresh/only-export-components */
import {
  Link,
  Outlet,
  createFileRoute,
  redirect,
  useRouterState,
} from "@tanstack/react-router"
import { ClapperboardIcon } from "lucide-react"

import { DashboardTable } from "@/components/dashboard-table"
import { Button } from "@/components/ui/button"
import {
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { loadCurrentUser } from "@/lib/api/auth"
import { moduleRegistry } from "@/video-modules"

export const Route = createFileRoute("/_authenticated/admin/modules")({
  loader: async () => {
    const user = await loadCurrentUser()
    if (user?.role !== "admin") throw redirect({ to: "/" })
  },
  component: ModulesRoute,
})

function ModulesRoute() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  if (pathname !== "/admin/modules") {
    return <Outlet />
  }

  return (
    <div className="w-full pb-8">
      <DashboardTable
        title="Modules"
        icon={<ClapperboardIcon className="size-4 text-muted-foreground sm:size-[18px]" />}
        count={moduleRegistry.length}
        header={
          <TableHeader>
            <TableRow>
              <TableHead column="main">Module</TableHead>
              <TableHead column="meta">Provider</TableHead>
              <TableHead column="meta">Actions</TableHead>
            </TableRow>
          </TableHeader>
        }
        isEmpty={moduleRegistry.length === 0}
        emptyText="No modules found."
        emptyColSpan={3}
        footer={{ type: "summary", count: moduleRegistry.length, label: "modules" }}
      >
        {moduleRegistry.map((module) => (
          <TableRow key={module.key}>
            <TableCell column="main">
              <Link
                to={module.href}
                className="inline-flex items-center gap-2 font-medium hover:underline"
              >
                <module.icon className="size-4 text-muted-foreground" />
                {module.name}
              </Link>
            </TableCell>
            <TableCell column="meta">{module.provider}</TableCell>
            <TableCell column="meta">
              <Button asChild variant="outline" size="sm" className="h-8 sm:h-9">
                <Link to={module.href}>Open</Link>
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </DashboardTable>
    </div>
  )
}
