import { createFileRoute } from "@tanstack/react-router"

import { CreateVideoPage } from "@/components/create-video-page"

export const Route = createFileRoute(
  "/_authenticated/admin/modules/ugc-ad-video/create"
)({
  component: CreateVideoPage,
})
