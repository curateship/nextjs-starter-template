import { Outlet, createRootRoute, createRoute, createRouter } from "@tanstack/react-router"
import { AppFrame } from "@/components/app-frame"
import { NewRunPage } from "@/pages/google-maps/new-run-page"
import { OverviewPage } from "@/pages/google-maps/overview-page"
import { RunDetailPage } from "@/pages/google-maps/run-detail-page"
import { RunsPage } from "@/pages/google-maps/runs-page"
import { SchedulesPage } from "@/pages/google-maps/schedules-page"
import { Dashboard } from "@/pages/layout/dashboard"

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
  component: Dashboard,
})

const googleMapsOverviewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/google-maps",
  component: OverviewPage,
})

const runsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/google-maps/runs",
  component: RunsPage,
})

const newRunRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/google-maps/runs/new",
  component: NewRunPage,
})

const runDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/google-maps/runs/$runId",
  component: RunDetailPage,
})

const schedulesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/google-maps/schedules",
  component: SchedulesPage,
})

const routeTree = rootRoute.addChildren([
  overviewRoute,
  googleMapsOverviewRoute,
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
