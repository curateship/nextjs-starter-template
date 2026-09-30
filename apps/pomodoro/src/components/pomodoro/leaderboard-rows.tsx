import { InitialsAvatar } from "@/components/pomodoro/initials-avatar"
import { cn } from "@/lib/utils"
import { formatFocusDuration } from "@/lib/pomodoro/focus-history"

/** One ranked account, as a board hands it over. Never a user id. */
export type BoardLeader = {
  name: string | null
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
          <b className="flex-1 truncate text-sm">{leader.name}</b>
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
