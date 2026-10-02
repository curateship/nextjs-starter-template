import { Link } from "@tanstack/react-router"

import { InitialsAvatar } from "@/components/pomodoro/initials-avatar"
import { cn } from "@/lib/utils"
import { formatFocusDuration } from "@/lib/pomodoro/focus-history"

/** One ranked account, as a board hands it over. Never a user id. */
export type BoardLeader = {
  name: string | null
  /**
   * Set when this person has a public profile that actually reads. Null means
   * the name draws as plain text, exactly as every name did before profiles
   * existed, so no row ever links to a 404.
   */
  handle?: string | null
  focusSessions: number
  focusSeconds: number
  isYou: boolean
}

/**
 * The ranked rows of a board: place, initials, display name, focus time.
 *
 * Shared by the global ranking and the private group boards, so the two read as
 * one list in two places rather than two lists that drift. Your own row is in
 * the accent colour.
 */
export function LeaderboardRows({ leaders }: { leaders: readonly BoardLeader[] }) {
  return (
    <>
      {leaders.map((leader, index) => (
        <article
          key={`${index}-${leader.name}`}
          className={cn(
            "flex min-h-9 items-center gap-3 rounded-lg border px-3",
            leader.isYou &&
              "border-[rgba(255,90,60,0.4)] bg-[rgba(255,90,60,0.08)]"
          )}
        >
          <strong className="w-5 text-center font-mono text-xs text-muted-foreground">
            {index + 1}
          </strong>
          <InitialsAvatar name={leader.name ?? "?"} />
          {/* Initials stay on the boards; a photo belongs to the profile
              page. The name is the only thing that becomes a link. */}
          {leader.handle ? (
            <Link
              to="/u/$handle"
              params={{ handle: leader.handle }}
              className="flex-1 truncate text-sm font-bold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {leader.name}
            </Link>
          ) : (
            <b className="flex-1 truncate text-sm">{leader.name}</b>
          )}
          <span className="font-mono text-xs">
            {formatFocusDuration(leader.focusSeconds)}{" "}
            <small className="text-muted-foreground">
              {leader.focusSessions} sessions
            </small>
          </span>
        </article>
      ))}
    </>
  )
}
