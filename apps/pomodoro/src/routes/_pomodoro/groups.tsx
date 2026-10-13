import { createFileRoute } from "@tanstack/react-router"

import { GroupsPage } from "@/components/pomodoro/groups-page"
import { GROUP_BOARD_ORDERS, type GroupBoardOrder } from "@/lib/pomodoro/groups"
import {
  DEFAULT_LEADERBOARD_WINDOW,
  LEADERBOARD_WINDOWS,
  type LeaderboardWindow,
} from "@/lib/pomodoro/leaderboard-windows"

type GroupsSearch = {
  /** The group in view. The first of yours when it is missing. */
  group?: string
  window?: LeaderboardWindow
  /** What orders the board (groups task 01, part 17). Hours when missing. */
  rank?: GroupBoardOrder
  /** Opens the Create a group window, for the account menu's row. */
  create?: "group"
}

const GROUP_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * `/groups`: your private focus groups on a dashboard of their own (Tyler,
 * 12 Oct 2026). The invite link stays at `/groups/join/<token>`, kept apart
 * from this page by the underscore in `groups_.join.$token.tsx`.
 */
export const Route = createFileRoute("/_pomodoro/groups")({
  // Which group, which window and whether Create is open live in the address,
  // so a reload or Back keeps them. Defaults are left off.
  validateSearch: (search: Record<string, unknown>): GroupsSearch => {
    const window = LEADERBOARD_WINDOWS.find((option) => option === search.window)
    const rank = GROUP_BOARD_ORDERS.find((option) => option === search.rank)
    // Undefined rather than left out, or the router keeps the raw value.
    return {
      group:
        typeof search.group === "string" && GROUP_ID.test(search.group)
          ? search.group
          : undefined,
      window: window && window !== DEFAULT_LEADERBOARD_WINDOW ? window : undefined,
      rank: rank && rank !== "hours" ? rank : undefined,
      create: search.create === "group" ? "group" : undefined,
    }
  },
  head: () => ({ meta: [{ title: "Groups - Pomoder" }] }),
  component: GroupsRoute,
})

function GroupsRoute() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  // Replaced rather than added, so Back leaves the page instead of stepping
  // through every group and tab that was clicked.
  const go = (next: Partial<GroupsSearch>) =>
    void navigate({
      search: (previous) => ({ ...previous, ...next }),
      replace: true,
    })
  return (
    <GroupsPage
      groupId={search.group}
      boardWindow={search.window ?? DEFAULT_LEADERBOARD_WINDOW}
      boardOrder={search.rank ?? "hours"}
      createRequested={search.create === "group"}
      onSelectGroup={(group) => go({ group })}
      onWindowChange={(window) =>
        go({ window: window === DEFAULT_LEADERBOARD_WINDOW ? undefined : window })
      }
      onOrderChange={(rank) => go({ rank: rank === "hours" ? undefined : rank })}
      onCreateRequestClosed={() => go({ create: undefined })}
    />
  )
}
