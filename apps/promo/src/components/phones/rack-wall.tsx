import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { ErrorRow } from "@/components/ui/error-row"
import { getScreenErrorMessage, loadWall, type WallView } from "@/lib/api/phones/screen"
import { formatTimeAgo } from "@/lib/format/format-time"
import { PHONE_STATUS_WORDS } from "@/lib/phones/options"
import { STATUS_DOT } from "@/lib/phones/status-dot"
import { useOnScreen } from "@/lib/phones/use-on-screen"

/** Tyler's decision, 18 Oct 2026: the wall refreshes each phone's picture every 5 seconds. */
const WALL_REFRESH_MS = 5_000

/**
 * One rack's wall, the middle panel's Wall tab (part 57 of the phone farm;
 * Racks dashboard, part 104): one small picture of each of the rack's
 * connected phones, new every 5 seconds, so they are seen at a glance. A held
 * or offline phone shows its status word instead of a picture. Nothing on
 * the wall is tappable: clicking a phone opens it on the right, on its Screen
 * tab, where control is off until it is switched on.
 *
 * Asking for the pictures is what keeps the rack sending them, and the tab
 * asks only while it is drawn and the browser tab is in front, so leaving it
 * stops them within ten seconds with no message of its own.
 */
export function RackWall({ rackId, onOpenScreen }: { rackId: string; onOpenScreen: (phoneId: string) => void }) {
  const [box, { drawn, front }] = useOnScreen<HTMLDivElement>()
  return (
    <div ref={box} className="min-h-24">
      <WallTiles rackId={rackId} watching={drawn && front} onOpenScreen={onOpenScreen} />
    </div>
  )
}

/** The tiles, read while the wall is on screen, every 5 seconds. */
function WallTiles({
  rackId,
  watching,
  onOpenScreen,
}: {
  rackId: string
  watching: boolean
  onOpenScreen: (phoneId: string) => void
}) {
  const [state, setState] = React.useState<{ view: WallView | null; error: string | null }>({ view: null, error: null })
  const [attempt, setAttempt] = React.useState(0)

  React.useEffect(() => {
    if (!watching) return
    let live = true
    const read = () =>
      loadWall(rackId).then(
        (view) => {
          if (live) setState({ view, error: null })
        },
        (error: unknown) => {
          if (live) setState((current) => ({ view: current.view, error: getScreenErrorMessage(error) }))
        }
      )
    void read()
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void read()
    }, WALL_REFRESH_MS)
    return () => {
      live = false
      clearInterval(timer)
    }
  }, [attempt, rackId, watching])

  if (state.error && !state.view) {
    return <ErrorRow message={state.error} onRetry={() => setAttempt((count) => count + 1)} />
  }
  if (!state.view) {
    return (
      <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
        <Loader2Icon className="size-4 animate-spin" aria-hidden="true" />
        Reading the phones
      </p>
    )
  }
  if (!state.view.phones.length) {
    return <p className="py-6 text-center text-sm text-muted-foreground">No phones on this rack yet.</p>
  }

  return (
    <div className="grid gap-4">
      {state.error ? (
        <p role="status" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(8.5rem,1fr))] gap-3">
        {state.view.phones.map((phone) => (
          <li key={phone.id} className="min-w-0">
            <button
              type="button"
              className="grid w-full gap-2 rounded-md border p-2 text-left hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
              aria-label={`Open ${phone.name}'s screen`}
              onClick={() => onOpenScreen(phone.id)}
            >
              <span className="grid aspect-[9/16] place-items-center overflow-hidden rounded-sm bg-muted">
                {phone.src ? (
                  <img
                    src={phone.src}
                    alt={`${phone.name}'s screen`}
                    draggable={false}
                    className="pointer-events-none size-full object-contain"
                  />
                ) : (
                  <span className="px-2 text-center text-xs text-muted-foreground">
                    {phone.status === "connected" || phone.status === "busy"
                      ? "Waiting for the first picture"
                      : PHONE_STATUS_WORDS[phone.status]}
                  </span>
                )}
              </span>
              <span className="grid">
                <span className="truncate text-sm font-medium">{phone.name}</span>
                <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span aria-hidden className={`size-2 shrink-0 rounded-full ${STATUS_DOT[phone.status]}`} />
                  {PHONE_STATUS_WORDS[phone.status]}
                  {phone.at ? <span>· {formatTimeAgo(phone.at)}</span> : null}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
