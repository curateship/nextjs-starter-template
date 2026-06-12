import { createFileRoute } from "@tanstack/react-router"

import { CreatorDetailPage } from "@/pages/creators/creator-detail-page"

export const Route = createFileRoute(
  "/_authenticated/admin/creators/$creatorId"
)({
  component: CreatorDetailPage,
})
