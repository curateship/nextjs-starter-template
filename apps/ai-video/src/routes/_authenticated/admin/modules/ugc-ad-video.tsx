/* eslint-disable react-refresh/only-export-components */
import { Outlet, createFileRoute, useRouterState } from "@tanstack/react-router"

import { VideosPage } from "@/components/videos-page"

export const Route = createFileRoute("/_authenticated/admin/modules/ugc-ad-video")({
  component: UgcAdVideoRoute,
})

function UgcAdVideoRoute() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  if (pathname !== "/admin/modules/ugc-ad-video") {
    return <Outlet />
  }

  return <VideosPage />
}
