import { createFileRoute } from "@tanstack/react-router"

import { MediaLibraryPage } from "@/components/media-library-page"
import { requireAdminRoute } from "@/lib/admin-route"

export const Route = createFileRoute("/_authenticated/admin/media")({
  loader: requireAdminRoute,
  component: () => <MediaLibraryPage activeTab="all" />,
})
