import * as React from "react"
import { useNavigate } from "@tanstack/react-router"
import { useDefaultLayout, usePanelRef } from "react-resizable-panels"
import {
  AlertCircleIcon,
  FileVideoIcon,
  ImageIcon,
  Loader2Icon,
  MusicIcon,
  PauseIcon,
  PlayIcon,
  ReplaceIcon,
  SettingsIcon,
  SparklesIcon,
  Trash2Icon,
  TypeIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Switch } from "@/components/ui/switch"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import { ViralVideoModal } from "@/components/viral-video-modal"
import {
  createProjectFromTemplate,
  getTemplateErrorMessage,
} from "@/lib/api/video-templates"
import { EditorMediaPanel } from "@/pages/video-editor/editor-media-panel"
import { EditorPlayerPanel } from "@/pages/video-editor/editor-player-panel"
import {
  EditorProvider,
  type EditorDocument,
} from "@/pages/video-editor/editor-provider"
import {
  ElementsPanel,
  EditorSettingsPanel,
  TextClipSettings,
} from "@/pages/video-editor/editor-settings-panel"
import { EditorSettingsDialog } from "@/pages/video-editor/editor-settings-dialog"
import { EditorTimeline } from "@/pages/video-editor/editor-timeline"
import { ExportControls } from "@/pages/video-editor/editor-timeline"
import {
  findClip,
  useEditor,
  type EditorClip,
  type EditorDocumentKind,
  type EditorMode,
  type EditorTrack,
} from "@/pages/video-editor/editor-store"
import { formatTimecode } from "@/pages/video-editor/timeline-utils"
import {
  ReplaceMediaDialog,
  type ReplacementMedia,
} from "@/pages/video-editor/replace-media-dialog"
import { useAudioPreview } from "@/pages/video-editor/use-audio-preview"
import { getVideoFilmstrip } from "@/pages/video-editor/video-thumbnails"

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
  const mode: EditorMode =
    kind === "template"
      ? "template-builder"
      : document.template_id
        ? "fill-template"
        : "regular"
  // Tracked from onResize so it also follows handle-drag collapses,
  // not just the toolbar button.
  const [timelineCollapsed, setTimelineCollapsed] = React.useState(
    mode !== "regular"
  )

  React.useEffect(() => {
    if (mode === "regular") return
    const id = requestAnimationFrame(() => {
      timelinePanelRef.current?.collapse()
    })
    return () => cancelAnimationFrame(id)
  }, [mode, timelinePanelRef])

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
    <EditorProvider document={document} kind={kind} mode={mode}>
      <ResizablePanelGroup orientation="vertical" className="h-full">
        {/* Panels area; px min keeps the cards usable at any viewport height */}
        <ResizablePanel defaultSize="62%" minSize="220px">
          {/* Mirrors the shell's default content spacing (DashboardContent /
              DashboardRow), which this route strips for the full-bleed timeline */}
          {mode === "regular" ? (
            <>
              <RegularEditorHeader />
              <EditorMainPanels />
            </>
          ) : (
            <SlotFirstEditor document={document} mode={mode} />
          )}
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

function RegularEditorHeader() {
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const { documentName } = useEditor()

  return (
    <nav className="flex min-h-14 shrink-0 flex-wrap items-center gap-2 bg-muted/30 px-3 py-2 shadow-[0_3px_12px_rgba(0,0,0,0.055)] sm:px-4 md:px-6">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-sm font-semibold" title={documentName}>
          {documentName}
        </h1>
      </div>
      <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
        <ExportControls className="flex items-center gap-2" />
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label="Settings (cog)"
          onClick={() => setSettingsOpen(true)}
        >
          <SettingsIcon />
          Settings
        </Button>
      </div>
      <EditorSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </nav>
  )
}

function SlotFirstEditor({
  document,
  mode,
}: {
  document: EditorDocument
  mode: Exclude<EditorMode, "regular">
}) {
  const { state, saveStatus, documentName } = useEditor()
  const selected = state.selectedClipId
    ? findClip(state.tracks, state.selectedClipId)
    : null

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SlotModeHeader
        mode={mode}
        document={document}
        documentName={documentName}
        saveStatus={saveStatus}
      />
      <ResizablePanelGroup
        orientation="horizontal"
        className="min-h-0 flex-1 p-3 sm:p-4 md:p-6"
      >
        <ResizablePanel defaultSize="300px" minSize="240px" maxSize="420px">
          <SlotWorkflowPanel mode={mode} />
        </ResizablePanel>

        <ResizableHandle className={SIDE_RESIZE_HANDLE_CLASS} />

        <ResizablePanel minSize="320px">
          <EditorPlayerPanel />
        </ResizablePanel>

        <ResizableHandle className={SIDE_RESIZE_HANDLE_CLASS} />

        <ResizablePanel defaultSize="330px" minSize="280px" maxSize="460px">
          <SlotInspector
            mode={mode}
            clip={selected?.clip ?? null}
          />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  )
}

function SlotModeHeader({
  mode,
  document,
  documentName,
  saveStatus,
}: {
  mode: Exclude<EditorMode, "regular">
  document: EditorDocument
  documentName: string
  saveStatus: "saved" | "saving" | "error"
}) {
  const navigate = useNavigate()
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [analysisOpen, setAnalysisOpen] = React.useState(false)
  const [useOpen, setUseOpen] = React.useState(false)
  const [projectName, setProjectName] = React.useState(documentName)
  const [usingTemplate, setUsingTemplate] = React.useState(false)
  const [useError, setUseError] = React.useState<string | null>(null)
  const isTemplate = mode === "template-builder"

  async function handleUseTemplate() {
    setUsingTemplate(true)
    setUseError(null)
    try {
      const { projectId } = await createProjectFromTemplate(
        document.id,
        projectName
      )
      void navigate({
        to: "/admin/video-editor/$projectId",
        params: { projectId },
      })
    } catch (error) {
      setUseError(getTemplateErrorMessage(error))
      setUsingTemplate(false)
    }
  }

  return (
    <>
      <nav className="flex min-h-14 shrink-0 flex-wrap items-center gap-2 bg-muted/30 px-3 py-2 shadow-[0_3px_12px_rgba(0,0,0,0.055)] sm:px-4 md:px-6">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold" title={documentName}>
            {documentName}
          </h1>
        </div>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
          {saveStatus !== "saved" ? (
            <p
              className={
                saveStatus === "error"
                  ? "text-xs text-destructive"
                  : "text-xs text-muted-foreground"
              }
            >
              {saveStatus === "saving"
                ? "Saving..."
                : saveStatus === "error"
                  ? "Save failed"
                  : null}
            </p>
          ) : null}

          {isTemplate && document.source_viral_video_id ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setAnalysisOpen(true)}
            >
              <SparklesIcon className="size-4" />
              Source Analysis
            </Button>
          ) : null}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setSettingsOpen(true)}
            aria-label={isTemplate ? "Template settings" : "Project settings"}
          >
            <SettingsIcon className="size-4" />
            Settings
          </Button>

          {!isTemplate ? <ExportControls className="flex items-center gap-2" /> : null}

          {isTemplate ? (
            <Button type="button" size="sm" onClick={() => setUseOpen(true)}>
              <PlayIcon className="size-4" />
              Use Template
            </Button>
          ) : null}
        </div>
      </nav>

      <EditorSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <ViralVideoModal
        videoId={analysisOpen ? document.source_viral_video_id ?? null : null}
        templateId={analysisOpen ? document.id : null}
        onOpenChange={(open) => !open && setAnalysisOpen(false)}
      />

      <Dialog open={useOpen} onOpenChange={(open) => !open && setUseOpen(false)}>
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Name Your Project</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-4">
              {useError ? (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                >
                  <AlertCircleIcon className="mt-0.5 size-4 shrink-0" />
                  <span>{useError}</span>
                </div>
              ) : null}
              <div className="grid gap-2">
                <Label htmlFor="slot-use-name">Project name</Label>
                <Input
                  id="slot-use-name"
                  value={projectName}
                  onChange={(event) => setProjectName(event.target.value)}
                  onKeyDown={(event) => {
                    if (
                      event.key === "Enter" &&
                      projectName.trim() &&
                      !usingTemplate
                    ) {
                      void handleUseTemplate()
                    }
                  }}
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter variant="plain">
            <Button
              type="button"
              variant="outline"
              disabled={usingTemplate}
              onClick={() => setUseOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              disabled={usingTemplate || !projectName.trim()}
              onClick={handleUseTemplate}
            >
              {usingTemplate ? (
                <Loader2Icon className="size-4 animate-spin" />
              ) : null}
              {usingTemplate ? "Creating" : "Create Project"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function SlotWorkflowPanel({
  mode,
}: {
  mode: Exclude<EditorMode, "regular">
}) {
  const [activeTab, setActiveTab] = React.useState("slots")
  const panelTitle =
    activeTab === "media"
      ? "Media"
      : activeTab === "elements"
        ? "Elements"
        : mode === "template-builder"
          ? "Slots"
          : "Template Slots"

  return (
    <section className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl bg-muted/60">
      <Tabs
        value={activeTab}
        onValueChange={setActiveTab}
        className="min-h-0 flex-1 gap-0"
      >
        <div className="flex shrink-0 items-center justify-between gap-2 p-3 pb-2">
          <h2 className="truncate text-sm font-semibold">{panelTitle}</h2>
          <TabsList>
            <TabsTrigger value="slots">Slots</TabsTrigger>
            <TabsTrigger value="media">Media</TabsTrigger>
            <TabsTrigger value="elements">Elements</TabsTrigger>
          </TabsList>
        </div>
        <TabsContent value="slots" className="min-h-0 flex-1">
          <SlotList mode={mode} />
        </TabsContent>
        <TabsContent value="media" className="min-h-0 flex-1">
          <EditorMediaPanel embedded />
        </TabsContent>
        <TabsContent value="elements" className="min-h-0 overflow-y-auto p-3">
          <ElementsPanel />
        </TabsContent>
      </Tabs>
    </section>
  )
}

function getSlotClips(tracks: EditorTrack[]) {
  return tracks
    .flatMap((track) => track.clips)
    .filter((clip) => clip.replaceable)
    .sort((a, b) => a.startMs - b.startMs)
}

function SlotList({ mode }: { mode: Exclude<EditorMode, "regular"> }) {
  const { state, dispatch, clock } = useEditor()
  const slots = getSlotClips(state.tracks)
  const [replaceClip, setReplaceClip] = React.useState<EditorClip | null>(null)

  function selectSlot(slot: EditorClip) {
    dispatch({ type: "SELECT_CLIP", clipId: slot.id })
    clock.seek(slot.startMs)
  }

  function handleReplace(media: ReplacementMedia) {
    if (!replaceClip) return
    dispatch({ type: "REPLACE_CLIP_MEDIA", clipId: replaceClip.id, media })
    setReplaceClip(null)
  }

  if (!slots.length) {
    return (
      <div className="grid h-full min-h-48 place-items-center p-4 text-center text-sm text-muted-foreground">
        <div>
          <FileVideoIcon className="mx-auto mb-2 size-8" />
          <p>No replaceable slots yet.</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <ScrollArea className="h-full">
        <div className="space-y-2 p-3 pt-1">
          {slots.map((slot) => (
            <div
              key={slot.id}
              className={
                state.selectedClipId === slot.id
                  ? "grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 overflow-hidden rounded-md border border-primary bg-background p-3"
                  : "grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 overflow-hidden rounded-md border bg-background p-3 hover:bg-muted"
              }
            >
              <button
                type="button"
                className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-3 text-left"
                onClick={() => selectSlot(slot)}
              >
                <SlotThumbnail slot={slot} />
                <div className="min-w-0 overflow-hidden">
                  <div className="truncate text-sm font-medium">
                    {slot.segmentLabel || slot.name}
                  </div>
                  <div className="truncate text-xs tabular-nums text-muted-foreground">
                    {formatTimecode(slot.startMs)} ·{" "}
                    {Math.round(slot.durationMs / 100) / 10}s
                  </div>
                </div>
              </button>
              {slot.kind !== "text" ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setReplaceClip(slot)}
                  className="shrink-0"
                >
                  <ReplaceIcon className="size-3.5" />
                  {mode === "template-builder" ? "Default" : "Replace"}
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      </ScrollArea>
      {replaceClip && replaceClip.kind !== "text" ? (
        <ReplaceMediaDialog
          clipKind={replaceClip.kind}
          open={!!replaceClip}
          onOpenChange={(open) => !open && setReplaceClip(null)}
          onReplace={handleReplace}
        />
      ) : null}
    </>
  )
}

function SlotThumbnail({ slot }: { slot: EditorClip }) {
  const frameKey =
    slot.kind === "video" && slot.mediaId
      ? `${slot.mediaId}:${slot.trimStartMs}:${slot.durationMs}`
      : null
  const [frame, setFrame] = React.useState<{
    key: string
    src: string | null
  } | null>(null)

  React.useEffect(() => {
    if (!frameKey || !slot.mediaId) return
    let active = true
    getVideoFilmstrip(slot.mediaId, {
      startMs: slot.trimStartMs,
      durationMs: slot.durationMs,
    })
      .then((frames) => {
        if (active) setFrame({ key: frameKey, src: frames[0] ?? null })
      })
      .catch(() => {
        if (active) setFrame({ key: frameKey, src: null })
      })
    return () => {
      active = false
    }
  }, [frameKey, slot.mediaId, slot.trimStartMs, slot.durationMs])

  const frameSrc = frame?.key === frameKey ? frame.src : null

  return (
    <div className="grid h-14 w-10 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted">
      {slot.kind === "image" && slot.url ? (
        <img
          src={slot.url}
          alt=""
          className="size-full object-cover"
          draggable={false}
        />
      ) : slot.kind === "video" && frameSrc ? (
        <img
          src={frameSrc}
          alt=""
          className="size-full object-cover"
          draggable={false}
        />
      ) : slot.kind === "audio" ? (
        <MusicIcon className="size-4 text-muted-foreground" />
      ) : slot.kind === "text" ? (
        <TypeIcon className="size-4 text-muted-foreground" />
      ) : (
        <ImageIcon className="size-4 text-muted-foreground" />
      )}
    </div>
  )
}

function SlotInspector({
  mode,
  clip,
}: {
  mode: Exclude<EditorMode, "regular">
  clip: EditorClip | null
}) {
  const { dispatch } = useEditor()
  const [replaceOpen, setReplaceOpen] = React.useState(false)
  const {
    previewingId: previewingSoundClipId,
    stopPreview: stopSoundPreview,
    togglePreview: toggleSoundPreview,
  } = useAudioPreview()
  const canReplaceMedia = !!clip && clip.kind !== "text"

  function patch(value: Partial<EditorClip>) {
    if (!clip) return
    dispatch({
      type: "UPDATE_CLIP",
      clipId: clip.id,
      patch: value,
      transient: true,
    })
  }

  function handleReplace(media: ReplacementMedia) {
    if (!clip) return
    stopSoundPreview()
    dispatch({ type: "REPLACE_CLIP_MEDIA", clipId: clip.id, media })
    setReplaceOpen(false)
  }

  function handleSoundPreview() {
    if (!clip?.url) return
    toggleSoundPreview(clip.id, clip.url)
  }

  function handleRemoveSoundEffect() {
    if (!clip) return
    stopSoundPreview()
    dispatch({ type: "DELETE_CLIP", clipId: clip.id })
  }

  return (
    <section className="flex h-full min-w-0 flex-col overflow-hidden rounded-xl bg-muted/60">
      <div className="flex shrink-0 items-center justify-between gap-2 p-3 pb-1">
        <h2 className="truncate text-sm font-semibold">
          {clip
            ? mode === "template-builder"
              ? "Slot Inspector"
              : "Slot Details"
            : "Inspector"}
        </h2>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-4">
          {!clip ? (
            <p className="text-sm text-muted-foreground">
              Select a slot to edit label, replacement, media, and timing.
            </p>
          ) : (
            <>
              <div className="rounded-md border bg-background p-3">
                <Label htmlFor="slot-label">Slot label</Label>
                <Input
                  id="slot-label"
                  className="mt-2"
                  value={clip.segmentLabel ?? clip.name}
                  onChange={(event) =>
                    patch({
                      segmentLabel: event.target.value,
                      name: event.target.value || clip.name,
                    })
                  }
                />
              </div>
              <div className="flex items-center justify-between rounded-md border bg-background p-3">
                <div className="space-y-1">
                  <Label htmlFor="slot-replaceable">Replaceable</Label>
                  <p className="text-xs text-muted-foreground">
                    Shows this clip as a template slot.
                  </p>
                </div>
                <Switch
                  id="slot-replaceable"
                  checked={!!clip.replaceable}
                  onCheckedChange={(checked) =>
                    patch({ replaceable: checked })
                  }
                />
              </div>
              <div className="rounded-md border bg-background p-3">
                <Label htmlFor="slot-duration">Duration seconds</Label>
                <Input
                  id="slot-duration"
                  className="mt-2"
                  type="number"
                  min="0.1"
                  step="0.1"
                  value={Math.round(clip.durationMs / 100) / 10}
                  onChange={(event) => {
                    const seconds = Number(event.target.value)
                    if (Number.isFinite(seconds) && seconds > 0) {
                      patch({ durationMs: seconds * 1000 })
                    }
                  }}
                />
              </div>
              <div className="rounded-md border bg-background p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {clip.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {clip.kind} · {formatTimecode(clip.startMs)}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {clip.soundEffectId && clip.url ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleSoundPreview}
                      >
                        {previewingSoundClipId === clip.id ? (
                          <PauseIcon className="size-4" />
                        ) : (
                          <PlayIcon className="size-4" />
                        )}
                        {previewingSoundClipId === clip.id
                          ? "Stop"
                          : "Preview"}
                      </Button>
                    ) : null}
                    {clip.replaceable ? (
                      <Badge variant="secondary">Slot</Badge>
                    ) : null}
                  </div>
                </div>
                {canReplaceMedia ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-1"
                    onClick={() => setReplaceOpen(true)}
                  >
                    <ReplaceIcon className="size-4" />
                    {mode === "template-builder"
                      ? "Set Default Media"
                      : "Replace Media"}
                  </Button>
                ) : null}
                {clip.soundEffectId ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    className="mt-1"
                    onClick={handleRemoveSoundEffect}
                  >
                    <Trash2Icon className="size-4" />
                    Remove Sound Effect
                  </Button>
                ) : null}
              </div>
              <TextClipSettings clip={clip} />
            </>
          )}
        </div>
      </ScrollArea>

      {canReplaceMedia ? (
        <ReplaceMediaDialog
          clipKind={clip.kind}
          open={replaceOpen}
          onOpenChange={setReplaceOpen}
          onReplace={handleReplace}
        />
      ) : null}
    </section>
  )
}
