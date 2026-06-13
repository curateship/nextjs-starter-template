import * as React from "react"
import {
  ChevronsDownIcon,
  ChevronsUpIcon,
  ExpandIcon,
  Loader2Icon,
  MonitorIcon,
  PauseIcon,
  PlayIcon,
  Redo2Icon,
  ScissorsIcon,
  SkipBackIcon,
  SkipForwardIcon,
  Undo2Icon,
  UploadIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import {
  getProjectErrorMessage,
  getProjectRender,
  startProjectRender,
  type RenderQuality,
} from "@/lib/api/video-projects"
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  useEditor,
  type AspectRatio,
} from "@/pages/video-editor/editor-store"
import {
  PlaybackClock,
  usePlaybackPlaying,
  usePlaybackRate,
} from "@/pages/video-editor/playback-clock"
import { TimelineTrackRow } from "@/pages/video-editor/editor-timeline-track"
import {
  formatTimecode,
  MAX_PX_PER_SECOND,
  MIN_PX_PER_SECOND,
  msToPx,
  pxToMs,
  TIMELINE_GUTTER_PX,
} from "@/pages/video-editor/timeline-utils"

// Extra lane width past the final clip so edits have room to grow.
const TIMELINE_TAIL_MS = 1_000

// Window fitted to the visible width when an empty project mounts (no content
// to derive a zoom from).
const EMPTY_FIT_MS = 60_000

// Playback speeds the "1x" button cycles through.
const PLAYBACK_RATES = [1, 1.5, 2, 0.5]

// One video frame at 30fps, used by the frame-step buttons.
const FRAME_MS = 1000 / 30

// Bottom strip: transport toolbar over a single scroll container holding the
// ruler (sticky top), the track lanes, and the live playhead. Clicking or
// dragging on empty timeline space scrubs the playhead.
export function EditorTimeline({
  onToggleCollapse,
  collapsed,
}: {
  onToggleCollapse: () => void
  collapsed: boolean
}) {
  const { state, dispatch, clock, durationMs } = useEditor()
  const scrollRef = React.useRef<HTMLDivElement>(null)
  const contentRef = React.useRef<HTMLDivElement>(null)
  const scrubbing = React.useRef(false)
  // Content-box left edge, captured once per scrub gesture so pointermoves
  // don't force a layout (getBoundingClientRect) per event.
  const scrubLeft = React.useRef(0)

  // Track the panel width so short projects still get ruler ticks and scrub
  // space wall-to-wall — without forcing a scroll range past the content.
  const [scrollerWidth, setScrollerWidth] = React.useState(0)
  React.useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller) return
    const observer = new ResizeObserver(() =>
      setScrollerWidth(scroller.clientWidth)
    )
    observer.observe(scroller)
    return () => observer.disconnect()
  }, [])

  // Scrollable span: the content plus a small tail, padded up to (but never
  // past) whatever fills the visible panel at the current zoom.
  const fillMs = pxToMs(
    Math.max(0, scrollerWidth - TIMELINE_GUTTER_PX),
    state.pxPerSecond
  )
  const visibleMs = Math.max(durationMs + TIMELINE_TAIL_MS, fillMs)
  const contentWidth =
    TIMELINE_GUTTER_PX + msToPx(visibleMs, state.pxPerSecond)

  // --- Scrub by pointer on ruler / empty lane space -----------------------
  function seekAtPointer(e: React.PointerEvent) {
    const x = e.clientX - scrubLeft.current - TIMELINE_GUTTER_PX
    clock.seek(pxToMs(Math.max(0, x), state.pxPerSecond))
  }

  function handlePointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return
    const target = e.target as HTMLElement
    // Clips own their pointer interactions (drag/trim/select/cut).
    if (target.closest("[data-clip]")) return
    // Only lane space and the ruler scrub. Anything else (track gutter
    // buttons, grips) must keep its own clicks — capturing here would
    // swallow them.
    if (!target.closest("[data-track-lane], [data-ruler]")) return
    // With the cut tool active, only the ruler scrubs — clicking lane space
    // shouldn't jump the playhead mid-cutting.
    if (state.cutMode && !target.closest("[data-ruler]")) return
    dispatch({ type: "SELECT_CLIP", clipId: null })
    scrubbing.current = true
    scrubLeft.current =
      contentRef.current?.getBoundingClientRect().left ?? 0
    contentRef.current?.setPointerCapture(e.pointerId)
    seekAtPointer(e)
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (scrubbing.current) seekAtPointer(e)
  }

  function handlePointerUp(e: React.PointerEvent) {
    if (!scrubbing.current) return
    scrubbing.current = false
    contentRef.current?.releasePointerCapture(e.pointerId)
  }

  // Zoom so the given span of timeline fits the visible lane width.
  const fitZoomTo = React.useCallback(
    (ms: number) => {
      const scroller = scrollRef.current
      if (!scroller || ms <= 0) return
      const lanePx = scroller.clientWidth - TIMELINE_GUTTER_PX - 24
      dispatch({
        type: "SET_ZOOM",
        pxPerSecond: Math.min(
          Math.max(lanePx / (ms / 1000), MIN_PX_PER_SECOND),
          MAX_PX_PER_SECOND
        ),
      })
    },
    [dispatch]
  )

  // --- Fit the project to the visible width once on mount -----------------
  // (so the timeline loads without a horizontal scrollbar at any size)
  // didFit flips inside the frame callback (not before): a durationMs change
  // re-runs the effect and cancels a still-pending frame, and flipping early
  // would leave the timeline never fitted at all.
  const didFitRef = React.useRef(false)
  React.useEffect(() => {
    if (didFitRef.current) return
    const target =
      durationMs > 0 ? durationMs + TIMELINE_TAIL_MS : EMPTY_FIT_MS
    const id = requestAnimationFrame(() => {
      didFitRef.current = true
      fitZoomTo(target)
    })
    return () => cancelAnimationFrame(id)
  }, [fitZoomTo, durationMs])

  // --- Keep the playhead in view while playing ----------------------------
  const pxPerSecondRef = React.useRef(state.pxPerSecond)
  React.useEffect(() => {
    pxPerSecondRef.current = state.pxPerSecond
  }, [state.pxPerSecond])

  React.useEffect(
    () =>
      clock.subscribe(() => {
        if (!clock.playing) return
        const scroller = scrollRef.current
        if (!scroller) return
        const px =
          TIMELINE_GUTTER_PX + msToPx(clock.getTime(), pxPerSecondRef.current)
        const viewStart = scroller.scrollLeft + TIMELINE_GUTTER_PX
        const viewEnd = scroller.scrollLeft + scroller.clientWidth - 60
        if (px < viewStart || px > viewEnd) {
          scroller.scrollLeft = Math.max(0, px - TIMELINE_GUTTER_PX - 16)
        }
      }),
    [clock]
  )

  // --- Keyboard: space toggles playback, delete removes the selection -----
  const selectedRef = React.useRef(state.selectedClipId)
  React.useEffect(() => {
    selectedRef.current = state.selectedClipId
  }, [state.selectedClipId])

  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.tagName === "BUTTON" ||
          target.isContentEditable)
      ) {
        return
      }
      if (e.code === "Space") {
        e.preventDefault()
        clock.toggle()
      } else if (
        (e.key === "Delete" || e.key === "Backspace") &&
        selectedRef.current
      ) {
        e.preventDefault()
        dispatch({ type: "DELETE_CLIP", clipId: selectedRef.current })
      } else if (e.key === "Escape") {
        // Escape drops back to the normal pointer tool and clears selection.
        dispatch({ type: "SET_CUT_MODE", on: false })
        dispatch({ type: "SELECT_CLIP", clipId: null })
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [clock, dispatch])

  // Zoom so the whole project fits the visible lane width.
  function fitToView() {
    if (durationMs === 0) return
    fitZoomTo(durationMs)
    if (scrollRef.current) scrollRef.current.scrollLeft = 0
  }

  return (
    <div className="flex h-full flex-col bg-background">
      <TimelineToolbar
        onFit={fitToView}
        onToggleCollapse={onToggleCollapse}
        collapsed={collapsed}
      />

      {/* One shared x/y scroll container so ruler and tracks stay aligned */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-auto">
        <div
          ref={contentRef}
          className="relative"
          style={{ width: contentWidth, minWidth: "100%" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {/* Ruler row: sticks to the top during vertical scroll; stays
              above everything, including dragged clips (z-35) */}
          <div
            data-ruler
            className="sticky top-0 z-40 flex h-8 cursor-pointer border-b bg-background"
          >
            <div className="sticky left-0 z-50 w-24 shrink-0 border-r bg-background" />
            {/* overflow-hidden: the last tick label must not extend the
                scrollable width past the fitted content */}
            <div className="relative min-w-0 flex-1 overflow-hidden">
              <RulerTicks
                visibleMs={visibleMs}
                pxPerSecond={state.pxPerSecond}
              />
              <RulerPlayheadFlag clock={clock} pxPerSecond={state.pxPerSecond} />
            </div>
          </div>

          {state.tracks.map((track, trackIndex) => (
            <TimelineTrackRow
              key={track.id}
              track={track}
              trackIndex={trackIndex}
            />
          ))}

          <PlayheadLine clock={clock} pxPerSecond={state.pxPerSecond} />
        </div>
      </div>
    </div>
  )
}

// Vertical red line dropping through the tracks at the current time.
function PlayheadLine({
  clock,
  pxPerSecond,
}: {
  clock: PlaybackClock
  pxPerSecond: number
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  // Move the line imperatively on each clock tick so playback never re-renders.
  React.useEffect(() => {
    function update() {
      const el = ref.current
      if (el) {
        el.style.left = `${TIMELINE_GUTTER_PX + msToPx(clock.getTime(), pxPerSecond)}px`
      }
    }
    update()
    return clock.subscribe(update)
  }, [clock, pxPerSecond])
  return (
    <div className="pointer-events-none absolute inset-y-0 z-20 w-px bg-red-500" ref={ref} />
  )
}

// Small red marker inside the ruler at the current time.
function RulerPlayheadFlag({
  clock,
  pxPerSecond,
}: {
  clock: PlaybackClock
  pxPerSecond: number
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    function update() {
      const el = ref.current
      if (el) el.style.left = `${msToPx(clock.getTime(), pxPerSecond)}px`
    }
    update()
    return clock.subscribe(update)
  }, [clock, pxPerSecond])
  return (
    <div
      className="pointer-events-none absolute bottom-0 h-3.5 w-2.5 -translate-x-1/2 rounded-[3px] bg-red-500"
      ref={ref}
    />
  )
}

// Tick marks with zoom-adaptive density and second labels. Memoized: the
// timeline re-renders on every store change, but ticks only depend on zoom
// and visible length.
const RulerTicks = React.memo(function RulerTicks({
  visibleMs,
  pxPerSecond,
}: {
  visibleMs: number
  pxPerSecond: number
}) {
  const labelStepS =
    pxPerSecond >= 80 ? 1 : pxPerSecond >= 30 ? 5 : pxPerSecond >= 12 ? 10 : 30
  const tickStepS = Math.max(1, Math.round(labelStepS / 5))
  const lastSecond = Math.ceil(visibleMs / 1000)

  const ticks: React.ReactNode[] = []
  for (let second = 0; second <= lastSecond; second += tickStepS) {
    const isMajor = second % labelStepS === 0
    const left = msToPx(second * 1000, pxPerSecond)
    ticks.push(
      <React.Fragment key={second}>
        <div
          className={
            isMajor
              ? "absolute bottom-0 h-3 w-px bg-border"
              : "absolute bottom-0 h-2 w-px bg-border/70"
          }
          style={{ left }}
        />
        {isMajor && (
          <span
            className="absolute top-1 text-xs text-muted-foreground"
            style={{ left: left + 5 }}
          >
            {second}s
          </span>
        )}
      </React.Fragment>
    )
  }
  return <>{ticks}</>
})

// Transport + view controls, all wired to the store/clock.
function TimelineToolbar({
  onFit,
  onToggleCollapse,
  collapsed,
}: {
  onFit: () => void
  onToggleCollapse: () => void
  collapsed: boolean
}) {
  const { state, dispatch, clock, durationMs, saveStatus, kind } = useEditor()
  const playing = usePlaybackPlaying(clock)
  const rate = usePlaybackRate(clock)

  function cycleRate() {
    const index = PLAYBACK_RATES.indexOf(rate)
    clock.setRate(PLAYBACK_RATES[(index + 1) % PLAYBACK_RATES.length])
  }

  return (
    <div className="flex h-12 shrink-0 items-center gap-1 border-b bg-background px-2.5">
      <ToolbarIconButton
        label="Undo"
        disabled={state.past.length === 0}
        onClick={() => dispatch({ type: "UNDO" })}
      >
        <Undo2Icon />
      </ToolbarIconButton>
      <ToolbarIconButton
        label="Redo"
        disabled={state.future.length === 0}
        onClick={() => dispatch({ type: "REDO" })}
      >
        <Redo2Icon />
      </ToolbarIconButton>
      {/* Toggles the razor: while active, clicking a clip cuts it there */}
      <ToolbarIconButton
        label={state.cutMode ? "Exit cut tool (Esc)" : "Cut tool"}
        active={state.cutMode}
        onClick={() =>
          dispatch({ type: "SET_CUT_MODE", on: !state.cutMode })
        }
      >
        <ScissorsIcon />
      </ToolbarIconButton>

      {/* Centered transport cluster */}
      <div className="flex min-w-0 flex-1 items-center justify-center gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              className="text-sm tabular-nums"
              onClick={cycleRate}
            >
              {rate}x
            </Button>
          </TooltipTrigger>
          <TooltipContent>Playback speed</TooltipContent>
        </Tooltip>
        <ToolbarIconButton
          label="Previous frame"
          onClick={() => clock.seek(clock.getTime() - FRAME_MS)}
        >
          <SkipBackIcon />
        </ToolbarIconButton>
        <ToolbarIconButton
          label={playing ? "Pause" : "Play"}
          onClick={() => clock.toggle()}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </ToolbarIconButton>
        <ToolbarIconButton
          label="Next frame"
          onClick={() => clock.seek(clock.getTime() + FRAME_MS)}
        >
          <SkipForwardIcon />
        </ToolbarIconButton>
        <TimeReadout clock={clock} durationMs={durationMs} />
      </div>

      {/* Autosave indicator — failures must be visible */}
      <span
        className={
          saveStatus === "error"
            ? "px-1.5 text-xs text-destructive"
            : "px-1.5 text-xs text-muted-foreground"
        }
      >
        {saveStatus === "saving"
          ? "Saving…"
          : saveStatus === "error"
            ? "Save failed"
            : "Saved"}
      </span>

      {/* Export is project-only — a template isn't a renderable output. */}
      {kind === "project" ? <ExportControls /> : null}

      {/* View controls: aspect ratio + zoom */}
      <Select
        value={state.aspect}
        onValueChange={(value) =>
          dispatch({ type: "SET_ASPECT", aspect: value as AspectRatio })
        }
      >
        {/* Borderless, styled like the ghost toolbar buttons around it */}
        <SelectTrigger
          className="w-auto border-transparent text-sm hover:bg-muted dark:bg-transparent dark:hover:bg-muted/50"
          aria-label="Aspect ratio"
        >
          <MonitorIcon className="size-4 text-muted-foreground" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          <SelectItem value="16:9">16:9</SelectItem>
          <SelectItem value="9:16">9:16</SelectItem>
          <SelectItem value="1:1">1:1</SelectItem>
          <SelectItem value="4:3">4:3</SelectItem>
        </SelectContent>
      </Select>
      <ToolbarIconButton
        label="Zoom out"
        onClick={() =>
          dispatch({
            type: "SET_ZOOM",
            pxPerSecond: Math.max(state.pxPerSecond - 10, MIN_PX_PER_SECOND),
          })
        }
      >
        <ZoomOutIcon />
      </ToolbarIconButton>
      <Slider
        value={[state.pxPerSecond]}
        min={MIN_PX_PER_SECOND}
        max={MAX_PX_PER_SECOND}
        step={1}
        onValueChange={(value) =>
          dispatch({ type: "SET_ZOOM", pxPerSecond: value[0] })
        }
        className="mx-1 w-28"
        aria-label="Timeline zoom"
      />
      <ToolbarIconButton
        label="Zoom in"
        onClick={() =>
          dispatch({
            type: "SET_ZOOM",
            pxPerSecond: Math.min(state.pxPerSecond + 10, MAX_PX_PER_SECOND),
          })
        }
      >
        <ZoomInIcon />
      </ToolbarIconButton>
      <ToolbarIconButton label="Fit timeline" onClick={onFit}>
        <ExpandIcon />
      </ToolbarIconButton>
      <ToolbarIconButton
        label={collapsed ? "Expand timeline" : "Collapse timeline"}
        onClick={onToggleCollapse}
      >
        {collapsed ? <ChevronsUpIcon /> : <ChevronsDownIcon />}
      </ToolbarIconButton>
    </div>
  )
}

// How often the toolbar checks on a running export, and how long it waits
// before assuming the server-side render died without writing a status.
const RENDER_POLL_MS = 2_000
const RENDER_POLL_GIVE_UP_MS = 12 * 60_000

const QUALITY_OPTIONS: { value: RenderQuality; label: string; hint: string }[] = [
  { value: "high", label: "High", hint: "1080p" },
  { value: "medium", label: "Medium", hint: "720p" },
  { value: "low", label: "Low", hint: "480p" },
]

// Programmatic download of a finished render with the user's chosen filename
// (the route reads ?filename= for the Content-Disposition name).
function downloadRender(projectId: string, filename: string) {
  const safe = filename.trim() || "export"
  const anchor = document.createElement("a")
  anchor.href = `/api/v1/projects/${projectId}/render?filename=${encodeURIComponent(safe)}`
  anchor.download = `${safe}.mp4`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
}

// Export modal launched from the toolbar: pick quality + filename, start the
// server-side render, and auto-download when it finishes. The render runs in
// the background, so closing the modal mid-render is fine — a toolbar
// indicator stays up and the file still downloads when ready.
function ExportControls() {
  // Export only mounts in project mode, so the document is a project here.
  const { documentId: projectId, documentName: projectName, flushSave } =
    useEditor()
  const [modalOpen, setModalOpen] = React.useState(false)
  const [quality, setQuality] = React.useState<RenderQuality>("high")
  const [filename, setFilename] = React.useState(projectName)
  const [status, setStatus] = React.useState<
    "idle" | "rendering" | "ready" | "error"
  >("idle")
  const [error, setError] = React.useState<string | null>(null)
  const [starting, setStarting] = React.useState(false)
  const [savedName, setSavedName] = React.useState<string | null>(null)
  // True while *this* session is waiting to auto-save the result; survives
  // closing the modal. Kept in a ref so the poll loop sees it without
  // re-subscribing. filenameRef likewise feeds the download from the poll.
  const autoPendingRef = React.useRef(false)
  const filenameRef = React.useRef(filename)
  React.useEffect(() => {
    filenameRef.current = filename
  }, [filename])

  // Pick up an export already running when the editor mounts (e.g. a refresh
  // mid-render). A prior session's finished render won't auto-download.
  React.useEffect(() => {
    let active = true
    getProjectRender(projectId)
      .then((info) => {
        if (!active) return
        setStatus(info.status)
        setError(info.error)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [projectId])

  // Poll while rendering; give up past the server's own render timeout so a
  // crashed render can't wedge the indicator. Auto-downloads on completion.
  React.useEffect(() => {
    if (status !== "rendering") return
    const startedAt = Date.now()
    const timer = setInterval(() => {
      if (Date.now() - startedAt > RENDER_POLL_GIVE_UP_MS) {
        setStatus("error")
        setError("Export timed out")
        return
      }
      getProjectRender(projectId)
        .then((info) => {
          setStatus(info.status)
          setError(info.error)
          if (info.status === "ready" && autoPendingRef.current) {
            autoPendingRef.current = false
            const name = filenameRef.current.trim() || projectName
            downloadRender(projectId, name)
            setSavedName(name)
          }
        })
        .catch(() => undefined)
    }, RENDER_POLL_MS)
    return () => clearInterval(timer)
  }, [projectId, status, projectName])

  async function handleStartExport() {
    setStarting(true)
    setError(null)
    setSavedName(null)
    try {
      // The render reads the saved timeline — persist any pending edits first.
      await flushSave()
      const info = await startProjectRender(projectId, quality)
      autoPendingRef.current = true
      setStatus(info.status)
    } catch (exportError) {
      setStatus("error")
      setError(getProjectErrorMessage(exportError))
    } finally {
      setStarting(false)
    }
  }

  const rendering = starting || status === "rendering"

  return (
    <>
      <div className="flex items-center gap-2 pl-1">
        {rendering ? (
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2Icon className="size-3.5 animate-spin" />
            Exporting…
          </span>
        ) : null}
        <Button type="button" size="sm" onClick={() => setModalOpen(true)}>
          <UploadIcon className="size-4" />
          Export
        </Button>
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent variant="admin">
          <DialogHeader>
            <DialogTitle>Export video</DialogTitle>
          </DialogHeader>
          <DialogBody>
            {rendering ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Loader2Icon className="size-4 animate-spin" />
                  Exporting your video…
                </div>
                <p className="text-sm text-muted-foreground">
                  You can close this window — the export keeps running and your
                  file downloads automatically when it&apos;s ready.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {savedName ? (
                  <div className="rounded-md border bg-muted/50 px-3 py-2 text-sm text-muted-foreground">
                    Saved “{savedName}.mp4” to your downloads.
                  </div>
                ) : null}
                {error ? (
                  <div role="alert" className="text-sm text-destructive">
                    {error}
                  </div>
                ) : null}
                <div className="space-y-1.5">
                  <Label htmlFor="export-name">File name</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="export-name"
                      value={filename}
                      onChange={(event) => setFilename(event.target.value)}
                      placeholder="my-video"
                    />
                    <span className="text-sm text-muted-foreground">.mp4</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="export-quality">Quality</Label>
                  <Select
                    value={quality}
                    onValueChange={(value) =>
                      setQuality(value as RenderQuality)
                    }
                  >
                    <SelectTrigger id="export-quality" className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {QUALITY_OPTIONS.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}{" "}
                          <span className="text-muted-foreground">
                            ({option.hint})
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </DialogBody>
          <DialogFooter variant="plain">
            {rendering ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => setModalOpen(false)}
              >
                Close
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setModalOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={starting}
                  onClick={handleStartExport}
                >
                  <UploadIcon className="size-4" />
                  Export File
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

// Current time / total duration readout (re-renders per clock tick).
function TimeReadout({
  clock,
  durationMs,
}: {
  clock: PlaybackClock
  durationMs: number
}) {
  const ref = React.useRef<HTMLSpanElement>(null)
  // Update the timecode text imperatively to avoid a per-frame re-render.
  React.useEffect(() => {
    function update() {
      const el = ref.current
      if (el) {
        el.textContent = `${formatTimecode(clock.getTime())} / ${formatTimecode(durationMs)}`
      }
    }
    update()
    return clock.subscribe(update)
  }, [clock, durationMs])
  return (
    <span
      className="pl-2.5 text-sm tabular-nums whitespace-nowrap text-muted-foreground"
      ref={ref}
    />
  )
}

// Ghost icon button with a tooltip, used across the toolbar.
function ToolbarIconButton({
  label,
  onClick,
  disabled,
  active,
  children,
}: {
  label: string
  onClick?: () => void
  disabled?: boolean
  active?: boolean
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          aria-pressed={active}
          onClick={onClick}
          disabled={disabled}
          className={cn(
            "[&_svg:not([class*='size-'])]:size-4.5",
            active && "bg-muted text-foreground"
          )}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
