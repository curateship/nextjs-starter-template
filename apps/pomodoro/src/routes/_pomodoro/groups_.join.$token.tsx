import { createFileRoute } from "@tanstack/react-router"

import { GroupInvitePage } from "@/components/pomodoro/group-invite-page"

/**
 * A private focus group's invite link. `groups_` (with the underscore) keeps it
 * out from under any future groups page, the same trap the room invite avoids.
 */
export const Route = createFileRoute("/_pomodoro/groups_/join/$token")({
  component: GroupInvitePage,
})
