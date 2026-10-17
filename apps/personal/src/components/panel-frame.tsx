import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { frameSrc, parseAppUrl } from "@/lib/menu"
import { PANEL_FRAME_NAME, readPanelReport } from "@/lib/panel"

/**
 * The middle panel: another app's real screen in a frame that fills it. A
 * spinner shows until the frame's page has loaded. The app reports each move
 * inside the frame, and `onReport` hands it on so Personal's address follows.
 */
export function PanelFrame({
  url,
  load,
  title,
  onReport,
}: {
  url: string
  load: number
  title: string
  onReport: (path: string, title: string) => void
}) {
  const frameRef = React.useRef<HTMLIFrameElement>(null)
  const [loadedKey, setLoadedKey] = React.useState<number | null>(null)
  const origin = parseAppUrl(url)?.origin ?? ""

  React.useEffect(() => {
    function onMessage(event: MessageEvent) {
      const report = readPanelReport(event, origin, frameRef.current?.contentWindow)
      if (report) onReport(report.path, report.title)
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [origin, onReport])

  return (
    <div className="relative flex min-h-0 flex-1">
      <iframe
        key={load}
        ref={frameRef}
        src={frameSrc(url)}
        name={PANEL_FRAME_NAME}
        title={title || "The open screen"}
        allow="clipboard-write"
        className="block min-h-0 w-full flex-1 border-0"
        onLoad={() => setLoadedKey(load)}
      />
      {loadedKey === load ? null : (
        <div
          role="status"
          className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground"
        >
          <Loader2Icon className="size-4 animate-spin" />
          Opening {parseAppUrl(url)?.host}
        </div>
      )}
    </div>
  )
}
