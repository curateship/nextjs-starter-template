import { createFileRoute } from "@tanstack/react-router"

import { RoomInvitePage } from "@/components/pomodoro/room-invite-page"

/**
 * The invite link. `rooms_` (with the underscore) keeps this route from
 * nesting under the rooms page — the old app's routing trap: nested, the
 * invite would render inside the browse screen instead of on its own.
 */
export const Route = createFileRoute("/_pomodoro/rooms_/$slug")({
  component: RoomInvitePage,
})
