import { Outlet, createRootRoute, createRoute, createRouter } from "@tanstack/react-router"
import { AppFrame } from "@/components/app-frame"
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

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/settings",
  component: () => null,
})

const settingsTabRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/admin/settings/$settingsTab",
  component: () => null,
})

const routeTree = rootRoute.addChildren([
  overviewRoute,
  settingsRoute,
  settingsTabRoute,
])

export const router = createRouter({ routeTree })

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router
  }
}
