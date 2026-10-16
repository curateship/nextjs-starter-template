import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { Loader2Icon } from "lucide-react"

import { PANEL_FRAME_NAME } from "@/lib/layout/panel-view"
import {
  panelFrameSrc,
  readPanelReport,
  type ConnectedApp,
} from "@/lib/personal/app-panels"

/**
 * One of another app's pages, drawn in Personal's middle panel. The page sits
 * in a frame that fills the panel to its edges, because the framed app's own
 * panel already has the page's gutter; a second one around it would double it.
 *
 * Personal's address follows the frame. A click inside the frame moves the
 * frame on its own, the app reports where it is, and Personal swaps its own
 * address to match without loading the frame again, so a reload lands on the
 * same page. Only a move Personal made, such as a left-menu click, loads a new
 * page into the frame, even when that page is the one the frame started on.
 */
export function AppPanel({ app, path }: { app: ConnectedApp; path: string }) {
  const navigate = useNavigate()
  const frameRef = React.useRef<HTMLIFrameElement>(null)
  // `load` counts the pages Personal has put in the frame. It is the frame's
  // key, so asking for the page the frame started on still loads it again.
  const [frame, setFrame] = React.useState({ path, load: 0 })
  const [loaded, setLoaded] = React.useState(false)
  const [report, setReport] = React.useState<{ path: string; title: string } | null>(
    null
  )
  const [lastPath, setLastPath] = React.useState(path)
  if (path !== lastPath) {
    setLastPath(path)
    if (path !== report?.path) {
      setFrame((current) => ({ path, load: current.load + 1 }))
      setLoaded(false)
    }
  }

  // The address Personal shows now, read by the message handler below so a
  // report of the page already showing doesn't navigate again.
  const pathRef = React.useRef(path)
  React.useEffect(() => {
    pathRef.current = path
  }, [path])

  React.useEffect(() => {
    function onMessage(event: MessageEvent) {
      const next = readPanelReport(event, app, frameRef.current?.contentWindow)
      if (!next) return
      setReport(next)
      if (next.path === pathRef.current) return
      void navigate({
        to: "/apps/$app/$",
        params: { app: app.id, _splat: next.path.slice(1) },
        replace: true,
      })
    }
    window.addEventListener("message", onMessage)
    return () => window.removeEventListener("message", onMessage)
  }, [app, navigate])

  const pageTitle = report?.title
  React.useEffect(() => {
    if (!pageTitle) return
    const before = document.title
    document.title = `${pageTitle} · ${app.name}`
    return () => {
      document.title = before
    }
  }, [app.name, pageTitle])

  return (
    <div
      className="relative flex min-h-0 flex-1"
      style={{ margin: "calc(var(--shell-gutter, 0px) * -1)" }}
    >
      <iframe
        key={frame.load}
        ref={frameRef}
        src={panelFrameSrc(app, frame.path)}
        name={PANEL_FRAME_NAME}
        title={pageTitle ? `${app.name}: ${pageTitle}` : app.name}
        allow="clipboard-write"
        className="block min-h-0 w-full flex-1 border-0"
        onLoad={() => setLoaded(true)}
      />
      {loaded ? null : (
        <div
          role="status"
          className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-sm text-muted-foreground"
        >
          <Loader2Icon className="size-4 animate-spin" />
          Opening {app.name}
        </div>
      )}
    </div>
  )
}
