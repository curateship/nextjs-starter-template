import { Link } from "@tanstack/react-router"

import { InitialsAvatar } from "@/components/pomodoro/initials-avatar"
import { cn } from "@/lib/utils"
import { formatFocusDuration } from "@/lib/pomodoro/focus-history"
import { plural } from "@/lib/format/plural"

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
export function LeaderboardRows({
  leaders,
  firstPlace = 1,
}: {
  leaders: readonly BoardLeader[]
  /** The place of the first row. Your own row below the list starts at yours. */
  firstPlace?: number
}) {
  return (
    <>
      {leaders.map((leader, index) => (
        <article
          key={`${index}-${leader.name}`}
          className={cn(
            "flex min-h-14 items-center gap-3 rounded-2xl border border-transparent px-3 sm:min-h-[60px] sm:gap-4 sm:px-4",
            leader.isYou &&
              "border-[color:var(--p-accent)]/50 bg-[color:var(--p-accent)]/15"
          )}
        >
          {/* The first three places read brighter than the rest. */}
          <strong
            className={cn(
              "min-w-6 shrink-0 text-center font-mono text-base font-normal",
              firstPlace + index > 3 && !leader.isYou && "text-muted-foreground"
            )}
          >
            {firstPlace + index}
          </strong>
          <InitialsAvatar
            name={leader.name ?? "?"}
            className="size-8 text-xs sm:size-9 sm:text-sm"
          />
          {/* Initials stay on the boards; a photo belongs to the profile
              page. The name is the only thing that becomes a link. */}
          {leader.handle ? (
            <Link
              to="/u/$handle"
              params={{ handle: leader.handle }}
              className="min-w-0 truncate text-base font-semibold underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {leaderName(leader)}
            </Link>
          ) : (
            <b className="min-w-0 truncate text-base font-semibold">
              {leaderName(leader)}
            </b>
          )}
          {leader.isYou ? (
            <span className="shrink-0 rounded-full border border-[color:var(--p-accent)]/60 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[var(--p-accent-2)]">
              You
            </span>
          ) : null}
          <span className="ml-auto flex shrink-0 items-baseline gap-3 sm:gap-5">
            <span className="font-mono text-sm tabular-nums sm:text-base">
              {formatFocusDuration(leader.focusSeconds)}
            </span>
            <small className="hidden w-20 font-mono text-xs text-muted-foreground sm:inline">
              {leader.focusSessions} {plural(leader.focusSessions, "session")}
            </small>
          </span>
        </article>
      ))}
    </>
  )
}
