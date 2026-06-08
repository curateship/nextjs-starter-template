/* eslint-disable react-refresh/only-export-components */
import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router"

import { MediaLibraryPage } from "@/components/media-library-page"

export const Route = createFileRoute("/_authenticated/admin/media")({
  component: MediaRoute,
})

function MediaRoute() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  if (pathname !== "/admin/media") {
    return <Outlet />
  }

  return <MediaLibraryPage activeTab="all" />
}
