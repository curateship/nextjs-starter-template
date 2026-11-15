import * as React from "react"
import { Loader2Icon, RefreshCwIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  askRackLog,
  getPhoneErrorMessage,
  loadRackLog,
  type RackLogView,
  type RackView,
} from "@/lib/api/phones/phones"
import { formatTimeAgo } from "@/lib/format/format-time"

/** The Log tab asks the rack again this often, for this long, until its lines arrive. */
const LOG_POLL_MS = 3_000
const LOG_WAIT_MS = 30_000

/**
 * The last lines of the rack program's own log, newest at the bottom, in the
 * Log card on the rack's left panel (part 61 of the phone farm; Racks
 * dashboard, part 89). The card asks, the rack is told on its next check for
 * work, and the lines arrive a few seconds later; the card reads again every
 * 3 seconds for up to 30. The log is never streamed whole and never stored.
 */
export function RackLogPanel({ rack }: { rack: Pick<RackView, "id" | "live"> }) {
  const [log, setLog] = React.useState<RackLogView>(null)
  // While waiting: when the ask went out on this clock, and when the lines
  // already shown were sent on the server's clock, so an answer counts as new
  // against the server's own time and never against this computer's.
  const [asked, setAsked] = React.useState<{ since: number; before: number } | null>(null)
  const [gaveUp, setGaveUp] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const endRef = React.useRef<HTMLDivElement>(null)

  const ask = React.useCallback(async () => {
    setGaveUp(false)
    setError(null)
    try {
      // The lines Promo already holds come first, so the answer the rack sends
      // to this ask counts as new against them and not against a blank tab.
      const held = await loadRackLog(rack.id)
      if (held) setLog(held)
      await askRackLog(rack.id)
      setAsked({ since: Date.now(), before: held ? new Date(held.at).getTime() : 0 })
    } catch (askError) {
      setError(getPhoneErrorMessage(askError))
    }
  }, [rack.id])

  // Asked once as the tab opens, when the rack is there to answer.
  const askRef = React.useRef(ask)
  React.useEffect(() => {
    askRef.current = ask
  })
  React.useEffect(() => {
    if (rack.live) void askRef.current()
  }, [rack.id, rack.live])

  // Reads every 3 seconds after an ask until lines newer than the ones shown arrive, or 30 seconds pass.
  React.useEffect(() => {
    if (asked === null) return
    let live = true
    const read = async () => {
      try {
        const next = await loadRackLog(rack.id)
        if (!live) return
        if (next && new Date(next.at).getTime() > asked.before) {
          setLog(next)
          setAsked(null)
          return
        }
        if (Date.now() - asked.since >= LOG_WAIT_MS) {
          setGaveUp(true)
          setAsked(null)
        }
      } catch (readError) {
        if (live) setError(getPhoneErrorMessage(readError))
      }
    }
    void read()
    const timer = setInterval(() => void read(), LOG_POLL_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [asked, rack.id])

  React.useEffect(() => {
    endRef.current?.scrollIntoView?.({ block: "end" })
  }, [log])

  const waiting = asked !== null
  const words = !rack.live
    ? "The rack is not checking in, so it cannot send its log."
    : error
      ? error
      : waiting
        ? "The rack has not answered yet."
        : gaveUp
          ? "The rack has not answered in 30 seconds. Press Refresh to ask again."
          : log
            ? `The rack's last ${log.lines.length} ${log.lines.length === 1 ? "line" : "lines"}, sent ${formatTimeAgo(log.at)}.`
            : "No lines yet."

  return (
    <div className="grid min-w-0 gap-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status" className={!rack.live || error ? "text-destructive" : "text-muted-foreground"}>
          {words}
        </p>
        <Button type="button" variant="outline" disabled={!rack.live || waiting} onClick={() => void ask()}>
          {waiting ? <Loader2Icon className="animate-spin" /> : <RefreshCwIcon />}
          Refresh
        </Button>
      </div>
      {log ? (
        <ScrollArea className="rounded-md border bg-background" viewportClassName="max-h-72">
          <pre className="p-3 font-mono text-xs whitespace-pre-wrap break-all">{log.lines.join("\n")}</pre>
          <div ref={endRef} />
        </ScrollArea>
      ) : null}
    </div>
  )
}
