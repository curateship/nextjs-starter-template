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
 * Somebody who opted in without picking a display name. The same word the
 * header's leaderboard uses, so a row is never blank and a screen reader never
 * hears a place and a time with no person.
 */
function leaderName(leader: BoardLeader) {
  return leader.name?.trim() || "Someone"
}

/**
 * The ranked rows of a board: place, initials, display name, focus time.
 *
 * Shared by the global ranking and the private group boards, so the two read as
 * one list in two places rather than two lists that drift. Your own row is in
 * the accent tint and says "You" after the name, so it can be found with the
 * colour ignored, and a screen reader hears it.
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
              "border-primary/40 bg-primary/8"
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
              className="min-w-0 truncate text-sm font-bold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {leaderName(leader)}
            </Link>
          ) : (
            <b className="min-w-0 truncate text-sm">{leaderName(leader)}</b>
          )}
          {leader.isYou ? (
            <span className="shrink-0 rounded-full border border-primary/40 px-2 font-mono text-[10px] font-bold uppercase tracking-wider text-[var(--p-accent-2)]">
              You
            </span>
          ) : null}
          <span className="ml-auto shrink-0 font-mono text-xs">
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
