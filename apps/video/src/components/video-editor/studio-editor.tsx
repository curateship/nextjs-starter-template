import * as React from "react"
import type { PanelImperativeHandle } from "react-resizable-panels"
import {
  Check,
  FilmIcon,
  CaptionsIcon,
  LayoutGrid,
  Loader2Icon,
  Share2,
  SparklesIcon,
  Type,
  Upload,
} from "lucide-react"

import { renameProject } from "@/lib/api/video/projects"
import { useShellRuntime } from "@/components/shell/shell-layout"
import { Button } from "@/components/ui/button"
import { ErrorBanner } from "@/components/ui/error-banner"
import { Input } from "@/components/ui/input"
import {
  BOTTOM_COLLAPSED_HEIGHT,
  PanelReopenTab,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  WorkspacePanel,
} from "@/components/ui/resizable"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"
import {
  ASPECT_RATIOS,
  type AspectRatio,
} from "@/lib/video/timeline-schema"
import {
  useBlankSpaceDoubleClick,
  usePanelToggle,
} from "@/lib/layout/panel-collapse"
import { useRememberedPanelLayout } from "@/lib/layout/panel-layout"
import { useWideScreen } from "@/lib/layout/wide-screen"
import {
  useEditorHasConflict,
  useEditorProjectName,
  useEditorRuntime,
  useEditorSaveStatus,
  useEditorSelector,
} from "@/components/video-editor/editor-store"
import {
  StudioContextPanel,
  type StudioPanel,
} from "@/components/video-editor/studio-panels"
import { AiBudgetIndicator } from "@/components/video-editor/ai-budget-indicator"
import { ExportDialog } from "@/components/video-editor/export-dialog"
import { useProjectExport } from "@/components/video-editor/use-project-export"
import { StudioInspector } from "@/components/video-editor/studio-inspector"
import { StudioStage } from "@/components/video-editor/studio-stage"
import { StudioTimeline } from "@/components/video-editor/studio-timeline"
import "@/components/video-editor/studio.css"

/**
 * The editor: the panel you are working from on the left, the picture in the
 * middle, the inspector on the right and the timeline along the bottom.
 *
 * It is the app's standard resizable workspace — the same panels, handles,
 * gaps and collapse behaviour as the automation editor — so dragging a divider,
 * shutting a panel by double-clicking its empty space, and coming back to the
 * sizes you left all work the way they do everywhere else. Only what is inside
 * each panel is particular to editing video.
 */

/**
 * Where this browser last left the dividers. The shell keeps its own keys in
 * `panelLayoutKey`; that file belongs to the shell, so this app names its own
 * here rather than editing it.
 */
const LAYOUT_KEY = {
  horizontal: "video-editor-horizontal",
  vertical: "video-editor-vertical",
}

/** The panels on the rail, in the order they appear on it. */
const RAIL: { id: StudioPanel; label: string; Icon: typeof FilmIcon }[] = [
  { id: "media", label: "Media", Icon: FilmIcon },
  { id: "text", label: "Text", Icon: Type },
  { id: "brand", label: "Brand", Icon: LayoutGrid },
  { id: "ai", label: "AI", Icon: SparklesIcon },
  { id: "transcript", label: "Transcript", Icon: CaptionsIcon },
]

export function StudioEditor({
  timelineError,
}: {
  timelineError?: string | null
}) {
  const { store, dispatch, clock } = useEditorRuntime()
  const { reportSaveStatus } = useShellRuntime()
  const hasConflict = useEditorHasConflict()
  const saveStatus = useEditorSaveStatus()
  const desktop = useWideScreen()
  const [panel, setPanel] = React.useState<StudioPanel>("media")

  const horizontalLayout = useRememberedPanelLayout(LAYOUT_KEY.horizontal)
  const verticalLayout = useRememberedPanelLayout(LAYOUT_KEY.vertical)

  const panelRef = React.useRef<PanelImperativeHandle>(null)
  const inspectorRef = React.useRef<PanelImperativeHandle>(null)
  const timelineRef = React.useRef<PanelImperativeHandle>(null)
  const [panelCollapsed, setPanelCollapsed] = React.useState(false)
  const [inspectorCollapsed, setInspectorCollapsed] = React.useState(false)

  const togglePanel = usePanelToggle(panelRef)
  const toggleInspector = usePanelToggle(inspectorRef)
  const toggleTimeline = usePanelToggle(timelineRef)

  // Double-clicking the empty part of a panel shuts it, and double-clicking
  // what is left of it opens it again.
  const panelDoubleClick = useBlankSpaceDoubleClick(togglePanel)
  const inspectorDoubleClick = useBlankSpaceDoubleClick(toggleInspector)
  const timelineDoubleClick = useBlankSpaceDoubleClick(toggleTimeline)

  // Saving is reported in the sticky app header, alongside every other
  // auto-save in the app. A failure says nothing there — it has already been
  // said in an error toast, and a header that reads "Saved" after a save that
  // did not land would be worse than silence. Clearing it on the way out
  // matters too: otherwise "Saved" is still sitting there on the next page.
  React.useEffect(() => {
    reportSaveStatus(
      saveStatus === "saving" ? "saving" : saveStatus === "saved" ? "saved" : "idle"
    )
  }, [reportSaveStatus, saveStatus])
  React.useEffect(() => () => reportSaveStatus(null), [reportSaveStatus])

  // Space plays and pauses, Delete removes the selected clip, Escape lets go of
  // it. Typing anywhere is left alone.
  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return
      }
      if (event.code === "Space") {
        event.preventDefault()
        clock.toggle()
      } else if (event.key === "Delete" || event.key === "Backspace") {
        const selectedClipId = store.getSnapshot().state.selectedClipId
        if (selectedClipId) {
          event.preventDefault()
          dispatch({ type: "DELETE_CLIP", clipId: selectedClipId })
        }
      } else if (event.key === "Escape") {
        dispatch({ type: "SELECT_CLIP", clipId: null })
        dispatch({ type: "SET_CUT_MODE", on: false })
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [clock, dispatch, store])

  const contextPanel = (
    <div data-screen-label="Panel" className="flex h-full min-h-0">
      <ToolRail panel={panel} onSelect={setPanel} />
      <div className="flex min-w-0 flex-1 flex-col">
        <StudioContextPanel panel={panel} />
      </div>
    </div>
  )

  const stage = (
    <WorkspacePanel className="flex flex-col">
      <StageHeader />
      <div className="relative flex min-h-0 flex-1">
        <StudioStage />
        {panelCollapsed ? (
          <PanelReopenTab
            side="left"
            label="Show the media panel"
            onClick={togglePanel}
          />
        ) : null}
        {inspectorCollapsed ? (
          <PanelReopenTab
            side="right"
            label="Show the inspector"
            onClick={toggleInspector}
          />
        ) : null}
      </div>
    </WorkspacePanel>
  )

  const workspace = desktop ? (
    <ResizablePanelGroup
      key={horizontalLayout.layoutKey}
      orientation="horizontal"
      className="min-h-0 flex-1"
      defaultLayout={horizontalLayout.defaultLayout}
      onLayoutChanged={horizontalLayout.onLayoutChanged}
    >
      <ResizablePanel
        id="panel"
        panelRef={panelRef}
        collapsible
        collapsedSize="0%"
        defaultSize="21%"
        minSize="16%"
        maxSize="34%"
        onResize={(size) => setPanelCollapsed(size.asPercentage < 0.5)}
      >
        <WorkspacePanel
          collapsed={panelCollapsed}
          onDoubleClick={panelDoubleClick}
        >
          {contextPanel}
        </WorkspacePanel>
      </ResizablePanel>
      <ResizableHandle gap collapsed={panelCollapsed} />
      <ResizablePanel id="stage" defaultSize="53%" minSize="30%">
        {stage}
      </ResizablePanel>
      <ResizableHandle gap collapsed={inspectorCollapsed} />
      <ResizablePanel
        id="inspector"
        panelRef={inspectorRef}
        collapsible
        collapsedSize="0%"
        defaultSize="26%"
        minSize="18%"
        maxSize="42%"
        onResize={(size) => setInspectorCollapsed(size.asPercentage < 0.5)}
      >
        <WorkspacePanel
          collapsed={inspectorCollapsed}
          onDoubleClick={inspectorDoubleClick}
        >
          <StudioInspector />
        </WorkspacePanel>
      </ResizablePanel>
    </ResizablePanelGroup>
  ) : (
    // Too narrow to sit three abreast: the picture takes the room, and the
    // panel and inspector are reachable through the timeline below it.
    stage
  )

  return (
    <div
      className="studio-root flex min-h-0 flex-1 flex-col"
      style={{ gap: "var(--shell-gutter, 0.75rem)" }}
    >
      {/* Two things the editor cannot put right on its own, said once and left
          in the shared error toast until they are dealt with. */}
      {timelineError ? <ErrorBanner message={timelineError} /> : null}
      {hasConflict ? (
        <ErrorBanner
          message="This project changed somewhere else, so nothing more will be saved from this window. Reload to pick up the newer version — anything you have done since will be lost."
          onRetry={() => window.location.reload()}
        />
      ) : null}

      <ResizablePanelGroup
        key={verticalLayout.layoutKey}
        orientation="vertical"
        className="min-h-0 flex-1"
        defaultLayout={verticalLayout.defaultLayout}
        onLayoutChanged={verticalLayout.onLayoutChanged}
      >
        <ResizablePanel id="workspace" defaultSize="68%" minSize="35%">
          <div className="flex h-full min-h-0">{workspace}</div>
        </ResizablePanel>
        {/* Keeps its gap even while the panel is shut — the collapsed toolbar
            row is still on screen, and this handle is what drags it open. */}
        <ResizableHandle gap />
        <ResizablePanel
          id="timeline"
          panelRef={timelineRef}
          defaultSize="32%"
          minSize="15%"
          collapsible
          collapsedSize={BOTTOM_COLLAPSED_HEIGHT}
        >
          <WorkspacePanel onDoubleClick={timelineDoubleClick}>
            <StudioTimeline />
          </WorkspacePanel>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}

/** The strip of panel buttons down the left edge of the first panel. */
function ToolRail({
  panel,
  onSelect,
}: {
  panel: StudioPanel
  onSelect: (panel: StudioPanel) => void
}) {
  return (
    <nav
      data-screen-label="Tool rail"
      aria-label="Editor panels"
      className="flex w-16 shrink-0 flex-col items-center gap-1 border-r py-3"
    >
      {RAIL.map(({ id, label, Icon }) => {
        const on = panel === id
        return (
          <button
            key={id}
            type="button"
            aria-pressed={on}
            onClick={() => onSelect(id)}
            className={cn(
              "flex w-full flex-col items-center gap-1 py-2 transition-colors",
              on
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="size-5" />
            <span className="text-[0.625rem] font-medium">{label}</span>
          </button>
        )
      })}
    </nav>
  )
}

/** The picture's header: what this project is called, and a link to it. */
function StageHeader() {
  const projectName = useEditorProjectName()
  const { setProjectName, projectId } = useEditorRuntime()
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState(projectName)
  const [shared, setShared] = React.useState(false)
  const [exportOpen, setExportOpen] = React.useState(false)
  const { job, setJob } = useProjectExport(projectId)
  const rendering = job?.status === "queued" || job?.status === "running"

  async function commitRename() {
    setEditing(false)
    const next = draft.trim()
    if (!next || next === projectName) {
      setDraft(projectName)
      return
    }
    setProjectName(next)
    try {
      await renameProject(projectId, next)
    } catch (error) {
      showErrorToast(
        error instanceof Error && error.message
          ? error.message
          : "The new name could not be saved."
      )
    }
  }

  function shareLink() {
    void navigator.clipboard
      ?.writeText(window.location.href)
      .then(() => {
        setShared(true)
        setTimeout(() => setShared(false), 1600)
      })
      .catch(() => undefined)
  }

  return (
    <div className="grid h-[3.15rem] shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b px-4 sm:px-5">
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground" aria-hidden>
          <FilmIcon className="size-4" />
        </span>
        {editing ? (
          <Input
            autoFocus
            value={draft}
            aria-label="Project name"
            className="h-8 max-w-72"
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => void commitRename()}
            onKeyDown={(event) => {
              if (event.key === "Enter") void commitRename()
              if (event.key === "Escape") {
                setDraft(projectName)
                setEditing(false)
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="font-heading min-w-0 truncate text-left text-[0.99rem] leading-snug font-medium hover:underline"
            title="Rename this project"
            onClick={() => {
              setDraft(projectName)
              setEditing(true)
            }}
          >
            {projectName}
          </button>
        )}
      </div>

      <AspectSwitch />

      <div className="flex items-center justify-end gap-2">
        <AiBudgetIndicator />
        <Button type="button" variant="outline" onClick={shareLink}>
          {shared ? <Check /> : <Share2 />}
          {shared ? "Copied" : "Share"}
        </Button>
        <Button type="button" onClick={() => setExportOpen(true)}>
          {rendering ? <Loader2Icon className="animate-spin" /> : <Upload />}
          {rendering ? "Exporting" : "Export"}
        </Button>
      </div>

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        projectId={projectId}
        projectName={projectName}
        job={job}
        onJobChange={setJob}
      />
    </div>
  )
}

/** What shape the finished video is, kept where you are looking at it. */
function AspectSwitch() {
  const aspect = useEditorSelector((state) => state.aspect)
  const { dispatch } = useEditorRuntime()

  return (
    <Tabs
      value={aspect}
      onValueChange={(next) =>
        dispatch({ type: "SET_ASPECT", aspect: next as AspectRatio })
      }
    >
      <TabsList aria-label="Shape">
        {ASPECT_RATIOS.map((option) => (
          <TabsTrigger key={option} value={option}>
            {option}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}
