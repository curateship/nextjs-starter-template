import { createFileRoute } from "@tanstack/react-router"

import { MediaLibraryPage } from "@/components/media-library-page"

export const Route = createFileRoute("/_authenticated/admin/media/videos")({
  component: () => <MediaLibraryPage activeTab="videos" />,
})
