import { createFileRoute, useRouterState } from "@tanstack/react-router"

import {
  getMediaTabFromPath,
  MediaLibraryPage,
} from "@/components/media-library-page"

export const Route = createFileRoute("/_authenticated/admin/media")({
  component: MediaRoute,
})

function MediaRoute() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  return <MediaLibraryPage activeTab={getMediaTabFromPath(pathname)} />
}
