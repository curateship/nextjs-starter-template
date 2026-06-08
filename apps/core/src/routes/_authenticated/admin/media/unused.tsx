import { createFileRoute } from "@tanstack/react-router"

import { UnusedImagesPage } from "@/components/unused-images-page"

export const Route = createFileRoute("/_authenticated/admin/media/unused")({
  component: UnusedImagesPage,
})
