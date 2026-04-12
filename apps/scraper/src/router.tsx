import { Outlet, createRootRoute, createRoute, createRouter } from "@tanstack/react-router"
import { AppFrame } from "@/components/app-frame"
import { NewRunPage } from "@/pages/new-run-page"
import { OverviewPage } from "@/pages/overview-page"
import { RunDetailPage } from "@/pages/run-detail-page"
import { RunsPage } from "@/pages/runs-page"
import { SchedulesPage } from "@/pages/schedules-page"

const rootRoute = createRootRoute({
  component: () => (
    <AppFrame>
      <Outlet />
    </AppFrame>
  ),
})

const overviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: OverviewPage,
})

const runsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/runs",
  component: RunsPage,
})

const newRunRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/runs/new",
  component: NewRunPage,
})

const runDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/runs/$runId",
  component: RunDetailPage,
})

const schedulesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/schedules",
  component: SchedulesPage,
})

const routeTree = rootRoute.addChildren([
  overviewRoute,
  runsRoute,
  newRunRoute,
  runDetailRoute,
  schedulesRoute,
])

export const router = createRouter({ routeTree })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
