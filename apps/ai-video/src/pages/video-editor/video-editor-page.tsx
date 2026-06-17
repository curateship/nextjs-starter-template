import * as React from "react"
import { useDefaultLayout, usePanelRef } from "react-resizable-panels"

import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { EditorMediaPanel } from "@/pages/video-editor/editor-media-panel"
import { EditorPlayerPanel } from "@/pages/video-editor/editor-player-panel"
import {
  EditorProvider,
  type EditorDocument,
} from "@/pages/video-editor/editor-provider"
import { EditorSettingsPanel } from "@/pages/video-editor/editor-settings-panel"
import { EditorTimeline } from "@/pages/video-editor/editor-timeline"
import {
  findClip,
  useEditor,
  type EditorDocumentKind,
} from "@/pages/video-editor/editor-store"

// Default timeline height (% of the editor) — also the expand-fallback size.
const TIMELINE_DEFAULT_PCT = 38
const SIDE_RESIZE_HANDLE_CLASS =
  "flex h-full w-4 bg-transparent after:block after:h-9 after:w-1 after:rounded-full after:bg-muted-foreground/35 after:content-[''] hover:bg-transparent"
const PANEL_LAYOUT_STORAGE = {
  getItem: (key: string) =>
    typeof window === "undefined" ? null : window.localStorage.getItem(key),
  setItem: (key: string, value: string) => {
    if (typeof window !== "undefined") window.localStorage.setItem(key, value)
  },
}

// Video editor dashboard: three panel cards over a height-resizable timeline
// strip. All editor state (tracks, selection, playback clock) lives in
// EditorProvider; the shell strips its content padding for this route, so the
// page owns the full area under the sticky header.
export function VideoEditorPage({
  document,
  kind,
}: {
  document: EditorDocument
  kind: EditorDocumentKind
}) {
  const timelinePanelRef = usePanelRef()
  // Tracked from onResize so it also follows handle-drag collapses,
  // not just the toolbar button.
  const [timelineCollapsed, setTimelineCollapsed] = React.useState(false)

  // Collapse the timeline down to just its toolbar (and back).
  function toggleTimeline() {
    const panel = timelinePanelRef.current
    if (!panel) return
    if (panel.isCollapsed()) {
      panel.expand()
      // expand() restores the remembered size, but can no-op when the
      // layout is mid-flight — force the default height as a fallback.
      requestAnimationFrame(() => {
        const current = timelinePanelRef.current
        if (current?.isCollapsed()) current.resize(TIMELINE_DEFAULT_PCT)
      })
    } else {
      panel.collapse()
    }
  }

  return (
    <EditorProvider document={document} kind={kind}>
      <ResizablePanelGroup orientation="vertical" className="h-full">
        {/* Panels area; px min keeps the cards usable at any viewport height */}
        <ResizablePanel defaultSize="62%" minSize="220px">
          {/* Mirrors the shell's default content spacing (DashboardContent /
              DashboardRow), which this route strips for the full-bleed timeline */}
          <EditorMainPanels />
        </ResizablePanel>

        {/* Drag handle: resizes the timeline height per the mock */}
        <ResizableHandle withHandle />

        <ResizablePanel
          defaultSize={`${TIMELINE_DEFAULT_PCT}%`}
          minSize="170px"
          maxSize="65%"
          collapsible
          collapsedSize="48px" // just the toolbar row stays visible
          panelRef={timelinePanelRef}
          onResize={(size) => setTimelineCollapsed(size.inPixels <= 52)}
        >
          <EditorTimeline
            onToggleCollapse={toggleTimeline}
            collapsed={timelineCollapsed}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </EditorProvider>
  )
}

function EditorMainPanels() {
  const { state } = useEditor()
  const selected = state.selectedClipId
    ? findClip(state.tracks, state.selectedClipId)
    : null
  const panelIds = selected
    ? ["media", "player", "inspector"]
    : ["media", "player"]
  const mainLayout = useDefaultLayout({
    id: "ai-video-editor-main-layout",
    panelIds,
    storage: PANEL_LAYOUT_STORAGE,
  })

  return (
    <div className="h-full min-h-0 p-3 sm:p-4 md:p-6">
      <ResizablePanelGroup
        id="ai-video-editor-main-layout"
        orientation="horizontal"
        className="h-full"
        defaultLayout={mainLayout.defaultLayout}
        onLayoutChanged={mainLayout.onLayoutChanged}
      >
        <ResizablePanel
          id="media"
          defaultSize="300px"
          minSize="220px"
          maxSize="420px"
        >
          <EditorMediaPanel />
        </ResizablePanel>

        <ResizableHandle className={SIDE_RESIZE_HANDLE_CLASS} />

        <ResizablePanel id="player" minSize="320px">
          <EditorPlayerPanel />
        </ResizablePanel>

        {selected ? (
          <>
            <ResizableHandle className={SIDE_RESIZE_HANDLE_CLASS} />
            <ResizablePanel
              id="inspector"
              defaultSize="330px"
              minSize="260px"
              maxSize="460px"
            >
              <EditorSettingsPanel clip={selected.clip} />
            </ResizablePanel>
          </>
        ) : null}
      </ResizablePanelGroup>
    </div>
  )
}
