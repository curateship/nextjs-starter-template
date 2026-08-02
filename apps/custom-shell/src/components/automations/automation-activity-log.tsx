import { ScrollArea } from "@/components/ui/scroll-area"
import { formatClockTime } from "@/lib/format-time"

import type { AutomationLogEntry } from "./automation-log"

export function AutomationActivityLog({
  entries,
}: {
  entries: AutomationLogEntry[]
}) {
  return (
    <div className="flex h-full min-h-0 flex-col bg-card">
      {/* Same 44px header height and hairline as the palette's tab row and the
          inspector. The panel collapses to exactly this row, so the title stays
          readable while it's shut. */}
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-foreground/10 px-4">
        <h2 className="text-xs font-semibold tracking-wide uppercase">
          Activity log
        </h2>
        <span className="text-xs text-muted-foreground">
          {entries.length} {entries.length === 1 ? "event" : "events"}
        </span>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div role="log" aria-live="polite" className="grid gap-2 p-4 text-xs">
          {entries.length === 0 ? (
            <p className="text-muted-foreground">
              Canvas changes will appear here. Saving is automatic, so it isn't
              logged.
            </p>
          ) : (
            entries.map((entry) => {
              const at = new Date(entry.time)
              return (
                <div
                  key={entry.id}
                  className="flex items-start gap-3 rounded-md border bg-muted/20 px-3 py-2"
                >
                  <time
                    dateTime={at.toISOString()}
                    className="shrink-0 font-mono text-muted-foreground"
                  >
                    {formatClockTime(at, { seconds: true })}
                  </time>
                  <span>{entry.message}</span>
                </div>
              )
            })
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
