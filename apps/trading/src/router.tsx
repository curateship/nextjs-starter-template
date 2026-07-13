import { createRouter } from "@tanstack/react-router"

import { DashboardLoadingSkeleton } from "@/components/loading-skeleton"
import { routeTree } from "./routeTree.gen"

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPendingComponent: DashboardLoadingSkeleton,
    defaultPendingMs: 200,
    defaultPendingMinMs: 300,
  })
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
