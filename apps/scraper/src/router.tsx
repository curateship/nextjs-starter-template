import { Outlet, createRootRoute, createRoute, createRouter } from "@tanstack/react-router"
import { AppFrame } from "@/components/app-frame"
import { PageMetadataModulePage } from "@/modules/page-metadata/page"
import { Dashboard } from "@/pages/layout/dashboard"
import { RunDetailPage } from "@/pages/runs/run-detail-page"

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

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/settings",
  component: () => null,
})

const pageMetadataRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/modules/page-metadata",
  component: PageMetadataModulePage,
})

const runDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/runs/$runId",
  component: RunDetailPage,
})

const settingsTabRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/settings/$settingsTab",
  component: () => null,
})

const routeTree = rootRoute.addChildren([
  overviewRoute,
  pageMetadataRoute,
  runDetailRoute,
  settingsRoute,
  settingsTabRoute,
])

export const router = createRouter({ routeTree })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
