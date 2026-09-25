import type { BotDetailResponse } from "@/lib/api/bots"
import { cn } from "@/lib/utils"

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
})

const LEVEL_DOT: Record<string, string> = {
  info: "bg-muted-foreground/50",
  warn: "bg-amber-500",
  error: "bg-red-500",
}

/**
 * One run's activity log — the bot_events rows the detail response already
 * carries (newest first, last 50). Presentational only.
 */
export function BotEventsList({
  events,
}: {
  events: BotDetailResponse["events"]
}) {
  if (events.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-sm text-muted-foreground">
        No events yet.
      </div>
    )
  }
  return (
    <ul className="divide-y">
      {events.map((event) => (
        <li
          key={event.id}
          className="flex items-center gap-3 px-4 py-1.5 text-sm"
        >
          <span className="shrink-0 font-mono text-xs whitespace-nowrap tabular-nums text-muted-foreground">
            {timeFormatter.format(new Date(event.created_at))}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            <span
              className={cn(
                "size-1.5 rounded-full",
                LEVEL_DOT[event.level] ?? LEVEL_DOT.info
              )}
            />
            {event.level}
          </span>
          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            {event.type}
          </span>
          <span className="min-w-0 flex-1 truncate" title={event.message}>
            {event.message}
          </span>
        </li>
      ))}
    </ul>
  )
}
