import { createFileRoute } from "@tanstack/react-router"

import { RoomInvitePage } from "@/components/pomoder/pomoder-pages"

export const Route = createFileRoute("/_pomoder/rooms_/$slug")({
  component: RoomInvitePage,
})
