import * as React from "react"
import { Loader2Icon } from "lucide-react"

import type { Frame } from "@/lib/frames"
import { frameSrc, parseAppUrl } from "@/lib/menu"
import { PANEL_FRAME_NAME, PANEL_GO_TYPE, readPanelReport, type PanelReport } from "@/lib/panel"
import { PHONE_WIDTH, type PanelZoom } from "@/lib/use-panel-view"
import { cn } from "@/lib/utils"

type View = { zoom: PanelZoom; phone: boolean }

/**
 * One kept frame: another app's real screen. A spinner shows until its page
 * has loaded. The app reports each move inside the frame, and `onReport`
 * hands it on, named by this frame, so a hidden frame's moves never move
 * Personal's address.
 */
function PanelFrame({
  frame,
  shown,
  view,
  onReport,
}: {
  frame: Frame
  shown: boolean
  view: View
  onReport: (frameId: number, report: PanelReport) => void
}) {
  const frameRef = React.useRef<HTMLIFrameElement>(null)
  const [loadedKey, setLoadedKey] = React.useState<number | null>(null)
  const origin = parseAppUrl(frame.frameUrl)?.origin ?? ""
  // Zoom draws the page larger by 1/zoom and scales it back down from the top
  // left, so it still fills the panel exactly. Phone view ignores zoom.
  const zoom = view.phone ? 1 : view.zoom

  // A reload loads the page again inside the same frame, swapping its address
  // in place, rather than making a new frame. A new frame would take the
  // frame's earlier moves out of the browser's history, and Back would then
  // step on nothing. The first load is the frame's own `src`.
  const firstLoad = React.useRef(frame.load)
  // Fixed once: a changed `src` would load the page as a new history step.
  const [firstSrc] = React.useState(() => frameSrc(frame.frameUrl))
  React.useEffect(() => {
    if (frame.load === firstLoad.current) return
    const src = frameSrc(frame.frameUrl)
    const target = frameRef.current?.contentWindow
    if (target) target.location.replace(src)
    else if (frameRef.current) frameRef.current.src = src
  }, [frame.load, frame.frameUrl])

  // Asks the app to change page itself, as a click inside it would. Only the
  // path goes, and only to this app's address. `goTo` is only ever set for an
  // app that said it takes the note.
  const goTo = frame.goTo
  React.useEffect(() => {
    if (!goTo) return
    frameRef.current?.contentWindow?.postMessage({ type: PANEL_GO_TYPE, path: goTo.path }, origin)
    // Runs once per ask: `goTo` is a new object only when Personal asks again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [goTo])

  React.useEffect(() => {
    function onMessage(event: MessageEvent) {
      const report = readPanelReport(event, origin, frameRef.current?.contentWindow)
      if (report) onReport(frame.id, report)
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [origin, onReport, frame.id])

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
          name={PANEL_FRAME_NAME}
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
            Opening {parseAppUrl(frame.frameUrl)?.host}
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
  onReport,
  children,
}: {
  frames: Frame[]
  openId: number | null
  view: View
  onReport: (frameId: number, report: PanelReport) => void
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
          onReport={onReport}
        />
      ))}
    </div>
  )
}
