/* eslint-disable react-refresh/only-export-components */
import { createFileRoute, redirect, useRouterState } from "@tanstack/react-router"

import {
  getMediaTabFromPath,
  MediaLibraryPage,
} from "@/components/media-library-page"
import { loadCurrentUser } from "@/lib/api/auth"

export const Route = createFileRoute("/_authenticated/admin/media")({
  loader: async () => {
    const user = await loadCurrentUser()
    if (user?.role !== "admin") throw redirect({ to: "/" })
  },
  component: MediaRoute,
})

function MediaRoute() {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })

  return <MediaLibraryPage activeTab={getMediaTabFromPath(pathname)} />
}
