import { createRouter } from "@tanstack/react-router"

import { PublicNotFound } from "@/components/shell/not-found-page"
import { routeTree } from "./routeTree.gen"

export function getRouter() {
  return createRouter({
    routeTree,
    scrollRestoration: true,
    scrollToTopSelectors: [
      '[data-scroll-restoration-id="dashboard-content"]',
    ],
    defaultNotFoundComponent: PublicNotFound,
  })
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
