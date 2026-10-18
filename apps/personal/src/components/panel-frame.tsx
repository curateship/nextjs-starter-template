import * as React from "react"
import { Loader2Icon } from "lucide-react"

import type { Frame } from "@/lib/frames"
import { parseAppUrl } from "@/lib/menu"
import { PHONE_WIDTH, type PanelZoom } from "@/lib/use-panel-view"
import { cn } from "@/lib/utils"

type View = { zoom: PanelZoom; phone: boolean }

/** What the frame loads: the screen itself, or nothing for an address that isn't one. */
function frameSrc(url: string) {
  return parseAppUrl(url)?.href ?? "about:blank"
}

/**
 * One kept frame: another app's real screen, exactly as it shows in its own
 * tab, its own top navigation included. A spinner shows until its page has
 * loaded.
 */
function PanelFrame({ frame, shown, view }: { frame: Frame; shown: boolean; view: View }) {
  const frameRef = React.useRef<HTMLIFrameElement>(null)
  const [loadedKey, setLoadedKey] = React.useState<number | null>(null)
  // Zoom draws the page larger by 1/zoom and scales it back down from the top
  // left, so it still fills the panel exactly. Phone view ignores zoom.
  const zoom = view.phone ? 1 : view.zoom

  // A reload loads the page again inside the same frame, swapping its address
  // in place, rather than making a new frame. A new frame would take the
  // frame's earlier moves out of the browser's history, and Back would then
  // step on nothing. The first load is the frame's own `src`.
  const firstLoad = React.useRef(frame.load)
  // Fixed once: a changed `src` would load the page as a new history step.
  const [firstSrc] = React.useState(() => frameSrc(frame.url))
  React.useEffect(() => {
    if (frame.load === firstLoad.current) return
    const src = frameSrc(frame.url)
    const target = frameRef.current?.contentWindow
    if (target) target.location.replace(src)
    else if (frameRef.current) frameRef.current.src = src
  }, [frame.load, frame.url])

  return (
    // A hidden frame keeps its size and is only made invisible, so its app
    // keeps its scroll and layout. Invisible also keeps it out of Tab and
    // screen readers.
    <div
      className={cn("absolute inset-0 flex justify-center", !shown && "invisible")}
      aria-hidden={shown ? undefined : true}
    >
      <div
        data-panel-box=""
        className={cn("relative h-full overflow-hidden", view.phone ? "max-w-full border-x" : "w-full")}
        // Two more pixels for the side lines, so the page inside is exactly a
        // phone's width.
        style={view.phone ? { width: PHONE_WIDTH + 2 } : undefined}
      >
        <iframe
          ref={frameRef}
          src={firstSrc}
          title={frame.title || "The open screen"}
          allow="clipboard-write"
          className="block size-full origin-top-left border-0"
          style={
            zoom === 1
              ? undefined
              : {
                  width: `${100 / zoom}%`,
                  height: `${100 / zoom}%`,
                  transform: `scale(${zoom})`,
                }
          }
          onLoad={() => setLoadedKey(frame.load)}
        />
        {loadedKey === frame.load ? null : (
          <div
            role="status"
            className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground"
          >
            <Loader2Icon className="size-4 animate-spin" />
            Opening {parseAppUrl(frame.url)?.host}
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * The middle panel: up to three kept frames stacked in the same spot, the
 * open one shown and the rest hidden behind it, still loaded. With none open,
 * all are hidden and `children` (the start page) shows in their place.
 */
export function PanelFrames({
  frames,
  openId,
  view,
  children,
}: {
  frames: Frame[]
  openId: number | null
  view: View
  children: React.ReactNode
}) {
  return (
    <div className="relative min-h-0 flex-1">
      {openId === null ? children : null}
      {frames.map((frame) => (
        <PanelFrame
          key={frame.id}
          frame={frame}
          shown={frame.id === openId}
          view={view}
        />
      ))}
    </div>
  )
}
