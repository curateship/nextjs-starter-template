import * as React from "react"
import { Link } from "@tanstack/react-router"
import type { PanelImperativeHandle } from "react-resizable-panels"
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  BlendIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  EyeIcon,
  ImageIcon,
  LayersIcon,
  LayoutGridIcon,
  ListIcon,
  Loader2Icon,
  Maximize2Icon,
  MinusIcon,
  PlusIcon,
  Redo2Icon,
  RotateCcwIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  Trash2Icon,
  TypeIcon,
  Undo2Icon,
  UploadIcon,
} from "lucide-react"

import { useShellRuntime } from "@/components/shell/shell-layout"
import { WorkspacePanelHeader } from "@/components/shared/workspace-panel-header"
import {
  InspectorCard,
  SliderField,
} from "@/components/broadcasts/inspector-fields"
import {
  PanelReopenTab,
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
  WorkspacePanel,
} from "@/components/ui/resizable"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { FieldLabel } from "@/components/ui/field-label"
import { ErrorBanner } from "@/components/ui/error-banner"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  getCarouselErrorMessage,
  polishCarouselText,
  saveCarousel,
  type CarouselDetail,
  type CarouselFormat,
  type CarouselGradientShadowItem,
  type CarouselMediaFit,
  type CarouselMediaItem,
  type CarouselSlide,
  type CarouselSlideItem,
  type CarouselTextAlign,
  type CarouselTextItem,
} from "@/lib/api/video/carousels"
import {
  getMediaErrorMessage,
  uploadMedia,
  type MediaItem,
} from "@/lib/api/media/media"
import {
  attachEditorMedia,
  listVideoMedia,
} from "@/lib/api/video/media"
import type { CarouselShadowDirection } from "@/lib/video/carousel-schema"
import {
  CAROUSEL_CONFLICT_MESSAGE,
  CAROUSEL_ITEM_LIMIT_MESSAGE,
  CAROUSEL_ITEM_MAX,
} from "@/lib/video/carousel-schema"
import {
  DEFAULT_TEXT_FONT_ID,
  requireTextFont,
  TEXT_FONTS,
  type TextFontId,
} from "@/lib/video/text-fonts"
import { cn } from "@/lib/utils"
import { showErrorToast } from "@/lib/toast/error-toast"
import {
  useBlankSpaceDoubleClick,
  usePanelToggle,
} from "@/lib/layout/panel-collapse"
import { useRememberedPanelLayout } from "@/lib/layout/panel-layout"
import { exportCarouselZip } from "@/components/carousel-studio/carousel-export"
import "@/components/video-editor/studio.css"

export type Snapshot = {
  slides: CarouselSlide[]
  caption: string
  format: CarouselFormat
}

export type BuilderState = Snapshot & {
  selectedSlideId: string
  selectedItemId: string | null
  past: Snapshot[]
  future: Snapshot[]
}

export type BuilderAction =
  | { type: "SELECT_SLIDE"; slideId: string }
  | { type: "SELECT_ITEM"; itemId: string | null }
  | { type: "UPDATE_CAPTION"; caption: string }
  | { type: "UPDATE_FORMAT"; format: CarouselFormat }
  | { type: "UPDATE_SLIDE"; slideId: string; patch: Partial<CarouselSlide> }
  | {
      type: "UPDATE_ITEM"
      slideId: string
      itemId: string
      patch: Partial<CarouselSlideItem>
      transient?: boolean
    }
  | { type: "COMMIT_HISTORY"; before: Snapshot }
  | { type: "ADD_SLIDE" }
  | { type: "DUPLICATE_SLIDE"; slideId: string }
  | { type: "DELETE_SLIDE"; slideId: string }
  | { type: "ADD_ITEM"; slideId: string; item: CarouselSlideItem }
  | { type: "DELETE_ITEM"; slideId: string; itemId: string }
  | { type: "MOVE_LAYER"; slideId: string; itemId: string; direction: 1 | -1 }
  | { type: "RESET_DEFAULTS" }
  | { type: "UNDO" }
  | { type: "REDO" }

type StudioPanel = "slides" | "text" | "image" | "shadow"

const LAYOUT_KEY = "video-carousel-studio-horizontal"

const AUTOSAVE_DEBOUNCE_MS = 1200
const UNDO_LIMIT = 50
const MIN_ITEM_SIZE = 0.06
const DEFAULT_BACKGROUND = "#f8fafc"
const DEFAULT_FIRST_SLIDE_BACKGROUND = "#111827"
const DEFAULT_GRADIENT_SHADOW_COLOR = "#000000"
const DEFAULT_GRADIENT_SHADOW_OPACITY = 70
const DEFAULT_GRADIENT_SHADOW_HEIGHT = 0.42
const DEFAULT_IMAGE_Z_INDEX = 0
const DEFAULT_GRADIENT_SHADOW_Z_INDEX = 1
const DEFAULT_TEXT_Z_INDEX = 10
const DEFAULT_TITLE_TEXT_Y = 0.56
const DEFAULT_TITLE_TEXT_HEIGHT = 0.14
const DEFAULT_BODY_TEXT_Y = 0.74
const DEFAULT_BODY_TEXT_HEIGHT = 0.16
const DEFAULT_EXTRA_TEXT_Y = 0.72

const ZOOM_MIN = 0.1
const ZOOM_MAX = 4
const ZOOM_FACTOR = 1.2
const DEFAULT_ZOOM = 0.74

const FORMAT_RATIOS: Record<CarouselFormat, number> = {
  "4:5": 4 / 5,
  "1:1": 1,
  "9:16": 9 / 16,
}

// Text style presets — each drops a pre-styled text layer. Mirrors the video
// editor's Text panel (Styles list) but tuned for carousel copy.
const TEXT_PRESETS: {
  label: string
  fontId: TextFontId
  fontSize: number
  align: CarouselTextAlign
  y: number
  height: number
  preview: React.CSSProperties
}[] = [
  {
    label: "Headline",
    fontId: "inter",
    fontSize: 96,
    align: "left",
    y: 0.12,
    height: 0.2,
    preview: {
      fontFamily: "var(--app-font-sans)",
      fontWeight: 800,
      fontSize: 19,
    },
  },
  {
    label: "Title",
    fontId: "inter",
    fontSize: 68,
    align: "left",
    y: 0.3,
    height: 0.16,
    preview: { fontWeight: 800, fontSize: 16 },
  },
  {
    label: "Subheading",
    fontId: "inter",
    fontSize: 46,
    align: "left",
    y: 0.5,
    height: 0.12,
    preview: { fontWeight: 600, fontSize: 14 },
  },
  {
    label: "Body copy",
    fontId: "inter",
    fontSize: 32,
    align: "left",
    y: 0.64,
    height: 0.18,
    preview: { fontWeight: 500, fontSize: 13, color: "var(--ink2)" },
  },
  {
    label: "Pull quote",
    fontId: "inter",
    fontSize: 52,
    align: "center",
    y: 0.4,
    height: 0.2,
    preview: {
      fontFamily: "var(--app-font-sans)",
      fontStyle: "italic",
      fontSize: 16,
    },
  },
]

const STICKERS = ["🔥", "✨", "👀", "💯", "➡️", "❤️", "⭐", "📈"]

// Scrim presets — each adds a gradient-shadow with a fade direction + placement.
// `direction` is honoured by gradientShadowBackground (canvas) and the exporter.
const SHADOW_PRESETS: {
  label: string
  direction: CarouselShadowDirection
  box: [number, number, number, number]
}[] = [
  { label: "Bottom fade", direction: "up", box: [0, 0.58, 1, 0.42] },
  { label: "Top fade", direction: "down", box: [0, 0, 1, 0.42] },
  { label: "Full scrim", direction: "solid", box: [0, 0, 1, 1] },
  { label: "Vignette", direction: "radial", box: [0, 0, 1, 1] },
  { label: "Left fade", direction: "right", box: [0, 0, 0.5, 1] },
  { label: "Right fade", direction: "left", box: [0.5, 0, 0.5, 1] },
]

const TEXT_SWATCHES = [
  "#ffffff",
  "#111827",
  "#ffe27a",
  "#4f46e5",
  "#ff5a5a",
  "#10b981",
]
const BACKGROUND_SWATCHES = [
  "#ffffff",
  "#f8fafc",
  "#111827",
  "#0f172a",
  "#4f46e5",
  "#f97316",
]
const SHADOW_SWATCHES = ["#000000", "#ffffff", "#111827", "#1e3a8a"]

type SaveStatus = "saved" | "saving" | "error"

export function CarouselBuilderPage({
  document,
  brandColors,
}: {
  document: CarouselDetail
  brandColors: string[]
}) {
  const [state, dispatch] = React.useReducer(
    builderReducer,
    document,
    createInitialBuilderState
  )
  const { reportSaveStatus } = useShellRuntime()
  const [panel, setPanel] = React.useState<StudioPanel>("slides")
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("saved")
  const [statusError, setStatusError] = React.useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = React.useState(false)
  const [exportOpen, setExportOpen] = React.useState(false)
  const [exporting, setExporting] = React.useState(false)
  const [exportError, setExportError] = React.useState<string | null>(null)
  const [polishing, setPolishing] = React.useState(false)
  const horizontalLayout = useRememberedPanelLayout(LAYOUT_KEY)
  const panelRef = React.useRef<PanelImperativeHandle>(null)
  const inspectorRef = React.useRef<PanelImperativeHandle>(null)
  const [panelCollapsed, setPanelCollapsed] = React.useState(false)
  const [inspectorCollapsed, setInspectorCollapsed] = React.useState(false)
  const togglePanel = usePanelToggle(panelRef)
  const toggleInspector = usePanelToggle(inspectorRef)
  const panelDoubleClick = useBlankSpaceDoubleClick(togglePanel)
  const inspectorDoubleClick = useBlankSpaceDoubleClick(toggleInspector)
  const pendingRef = React.useRef<Snapshot | null>(null)
  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeSaveRef = React.useRef<Promise<void> | null>(null)
  const versionRef = React.useRef(document.version)
  const saveQueueRef = React.useRef(Promise.resolve())
  const conflictRef = React.useRef(false)
  const [hasConflict, setHasConflict] = React.useState(false)
  const textSwatches = React.useMemo(
    () => Array.from(new Set([...brandColors, ...TEXT_SWATCHES])),
    [brandColors]
  )
  const backgroundSwatches = React.useMemo(
    () => Array.from(new Set([...brandColors, ...BACKGROUND_SWATCHES])),
    [brandColors]
  )

  const snapshot = React.useMemo(
    () => ({
      slides: state.slides,
      caption: state.caption,
      format: state.format,
    }),
    [state.slides, state.caption, state.format]
  )

  const selectedSlide =
    state.slides.find((slide) => slide.id === state.selectedSlideId) ??
    state.slides[0]
  const selectedSlideId = selectedSlide?.id ?? null
  const selectedItem =
    selectedSlide?.items.find((item) => item.id === state.selectedItemId) ??
    null

  const persist = React.useCallback(
    async (next: Snapshot) => {
      const save = saveQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          if (conflictRef.current) throw new Error(CAROUSEL_CONFLICT_MESSAGE)
          const saved = await saveCarousel(document.id, {
            caption: next.caption,
            format: next.format,
            slides: next.slides,
            version: versionRef.current,
          })
          versionRef.current = saved.version
        })
      saveQueueRef.current = save.then(
        () => undefined,
        () => undefined
      )
      try {
        await save
      } catch (error) {
        if (getCarouselErrorMessage(error) === CAROUSEL_CONFLICT_MESSAGE) {
          conflictRef.current = true
          setHasConflict(true)
        }
        throw error
      }
    },
    [document.id]
  )

  React.useEffect(() => {
    // React runs effects twice while developing. The opening document is not
    // an edit, so it must never increase the version simply by being viewed.
    if (
      snapshot.slides === document.slides &&
      snapshot.caption === document.caption &&
      snapshot.format === document.format
    ) {
      return
    }
    if (conflictRef.current) return

    pendingRef.current = snapshot
    const timer = setTimeout(() => {
      if (saveTimerRef.current === timer) saveTimerRef.current = null
      pendingRef.current = null
      setSaveStatus("saving")
      setStatusError(null)
      const save = persist(snapshot)
      activeSaveRef.current = save
      save
        .then(() => setSaveStatus("saved"))
        .catch((error) => {
          setSaveStatus("error")
          setStatusError(getCarouselErrorMessage(error))
          pendingRef.current ??= snapshot
        })
        .finally(() => {
          if (activeSaveRef.current === save) activeSaveRef.current = null
        })
    }, AUTOSAVE_DEBOUNCE_MS)
    saveTimerRef.current = timer

    return () => {
      clearTimeout(timer)
      if (saveTimerRef.current === timer) saveTimerRef.current = null
    }
  }, [document.caption, document.format, document.slides, persist, snapshot])

  React.useEffect(() => {
    reportSaveStatus(
      saveStatus === "saving"
        ? "saving"
        : saveStatus === "saved"
          ? "saved"
          : "idle"
    )
  }, [reportSaveStatus, saveStatus])
  React.useEffect(() => () => reportSaveStatus(null), [reportSaveStatus])

  React.useEffect(() => {
    return () => {
      const pending = pendingRef.current
      if (pending) void persist(pending).catch(() => undefined)
    }
  }, [persist])

  async function flushSave() {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    if (activeSaveRef.current) await activeSaveRef.current
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }

    const pending = pendingRef.current
    if (!pending) return
    pendingRef.current = null
    setSaveStatus("saving")
    setStatusError(null)
    const save = persist(pending)
    activeSaveRef.current = save
    try {
      await save
      setSaveStatus("saved")
    } catch (error) {
      setSaveStatus("error")
      setStatusError(getCarouselErrorMessage(error))
      pendingRef.current ??= pending
      throw error
    } finally {
      if (activeSaveRef.current === save) activeSaveRef.current = null
    }
  }

  async function handleExport() {
    setExporting(true)
    setExportError(null)
    try {
      await flushSave()
      await exportCarouselZip({
        carouselId: document.id,
        name: document.name,
        slideCount: state.slides.length,
        caption: state.caption,
      })
      setExportOpen(false)
    } catch (error) {
      setExportError(
        error instanceof Error ? error.message : "Carousel export failed."
      )
    } finally {
      setExporting(false)
    }
  }

  function addItem(item: CarouselSlideItem) {
    if (!selectedSlide) return
    if (selectedSlide.items.length >= CAROUSEL_ITEM_MAX) {
      showErrorToast(CAROUSEL_ITEM_LIMIT_MESSAGE)
      return
    }
    dispatch({ type: "ADD_ITEM", slideId: selectedSlide.id, item })
  }

  function addSlide() {
    if (state.slides.length >= 20) {
      showErrorToast("A carousel can have at most 20 slides.")
      return
    }
    dispatch({ type: "ADD_SLIDE" })
  }

  function duplicateSlide(slideId: string) {
    if (state.slides.length >= 20) {
      showErrorToast("A carousel can have at most 20 slides.")
      return
    }
    dispatch({ type: "DUPLICATE_SLIDE", slideId })
  }

  async function polishSelectedText() {
    if (!selectedSlide || selectedItem?.type !== "text") {
      showErrorToast("Select a text layer first.")
      return
    }
    setPolishing(true)
    try {
      await flushSave()
      const text = await polishCarouselText(
        document.id,
        selectedSlide.id,
        selectedItem.id
      )
      dispatch({
        type: "UPDATE_ITEM",
        slideId: selectedSlide.id,
        itemId: selectedItem.id,
        patch: { text },
      })
    } catch (error) {
      showErrorToast(getCarouselErrorMessage(error))
    } finally {
      setPolishing(false)
    }
  }

  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.defaultPrevented ||
        (event.key !== "Backspace" && event.key !== "Delete")
      ) {
        return
      }
      if (event.altKey || event.ctrlKey || event.metaKey) return
      if (previewOpen || exportOpen) return
      if (!selectedSlideId || !state.selectedItemId) return
      if (isTextEntryTarget(event.target)) return

      event.preventDefault()
      dispatch({
        type: "DELETE_ITEM",
        slideId: selectedSlideId,
        itemId: state.selectedItemId,
      })
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [exportOpen, previewOpen, selectedSlideId, state.selectedItemId])

  const slideIndex = state.slides.findIndex((s) => s.id === selectedSlideId)

  const contextPanel = (
    <div data-screen-label="Panel" className="flex h-full min-h-0">
      <IconRail panel={panel} onSelect={setPanel} />
      <div className="flex min-w-0 flex-1 flex-col">
        <CarouselContextPanel
          carouselId={document.id}
          panel={panel}
          slides={state.slides}
          format={state.format}
          selectedSlideId={state.selectedSlideId}
          onSelectSlide={(slideId) =>
            dispatch({ type: "SELECT_SLIDE", slideId })
          }
          onAddSlide={addSlide}
          onDuplicateSlide={duplicateSlide}
          onDeleteSlide={(slideId) =>
            dispatch({ type: "DELETE_SLIDE", slideId })
          }
          onAddItem={addItem}
        />
      </div>
    </div>
  )

  const stage = (
    <WorkspacePanel className="flex flex-col">
      <CarouselStageHeader
        name={document.name}
        canUndo={state.past.length > 0}
        canRedo={state.future.length > 0}
        onUndo={() => dispatch({ type: "UNDO" })}
        onRedo={() => dispatch({ type: "REDO" })}
        onReset={() => dispatch({ type: "RESET_DEFAULTS" })}
        polishing={polishing}
        canPolish={selectedItem?.type === "text"}
        onPolish={() => void polishSelectedText()}
        onPreview={() => setPreviewOpen(true)}
        onExport={() => {
          setExportError(null)
          setExportOpen(true)
        }}
      />
      <div className="relative flex min-h-0 flex-1">
        {selectedSlide ? (
          <CanvasStage
            slide={selectedSlide}
            slides={state.slides}
            slideIndex={slideIndex}
            format={state.format}
            selectedItemId={state.selectedItemId}
            onSelectItem={(itemId) => dispatch({ type: "SELECT_ITEM", itemId })}
            onSelectSlide={(slideId) =>
              dispatch({ type: "SELECT_SLIDE", slideId })
            }
            onUpdateItem={(itemId, patch, transient) =>
              dispatch({
                type: "UPDATE_ITEM",
                slideId: selectedSlide.id,
                itemId,
                patch,
                transient,
              })
            }
            onCommitHistory={(before) =>
              dispatch({ type: "COMMIT_HISTORY", before })
            }
            getSnapshot={() => currentSnapshot(state)}
          />
        ) : null}
        {panelCollapsed ? (
          <PanelReopenTab
            side="left"
            label="Show the carousel panel"
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

  const workspace = (
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
          {selectedSlide ? (
            <CarouselInspector
              slide={selectedSlide}
              selectedItem={selectedItem}
              format={state.format}
              textSwatches={textSwatches}
              backgroundSwatches={backgroundSwatches}
              onUpdateFormat={(format) =>
                dispatch({ type: "UPDATE_FORMAT", format })
              }
              onUpdateSlide={(patch) =>
                dispatch({
                  type: "UPDATE_SLIDE",
                  slideId: selectedSlide.id,
                  patch,
                })
              }
              onUpdateItem={(itemId, patch) =>
                dispatch({
                  type: "UPDATE_ITEM",
                  slideId: selectedSlide.id,
                  itemId,
                  patch,
                })
              }
              onDeleteItem={(itemId) =>
                dispatch({
                  type: "DELETE_ITEM",
                  slideId: selectedSlide.id,
                  itemId,
                })
              }
              onMoveLayer={(itemId, direction) =>
                dispatch({
                  type: "MOVE_LAYER",
                  slideId: selectedSlide.id,
                  itemId,
                  direction,
                })
              }
            />
          ) : null}
        </WorkspacePanel>
      </ResizablePanel>
    </ResizablePanelGroup>
  )

  return (
    <div className="studio-root carousel-studio flex min-h-0 flex-1 flex-col gap-[var(--shell-gutter,0.75rem)]">
      {hasConflict ? (
        <ErrorBanner
          message="This carousel changed somewhere else, so this window has stopped saving. Reload to use the newer version."
          onRetry={() => window.location.reload()}
        />
      ) : statusError ? (
        <ErrorBanner message={statusError} />
      ) : null}

      <div className="flex h-full min-h-0">{workspace}</div>

      <PreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        slides={state.slides}
        caption={state.caption}
        format={state.format}
      />
      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        slideCount={state.slides.length}
        caption={state.caption}
        exporting={exporting}
        error={exportError}
        onUpdateCaption={(caption) =>
          dispatch({ type: "UPDATE_CAPTION", caption })
        }
        onExport={() => void handleExport()}
      />
    </div>
  )
}

// ------------------------------------------------------------- Top bar ------

function CarouselStageHeader({
  name,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onReset,
  polishing,
  canPolish,
  onPolish,
  onPreview,
  onExport,
}: {
  name: string
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onReset: () => void
  polishing: boolean
  canPolish: boolean
  onPolish: () => void
  onPreview: () => void
  onExport: () => void
}) {
  return (
    <div className="grid h-[3.15rem] shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-2 border-b px-4 sm:px-5">
      <div className="flex min-w-0 items-center gap-2.5">
        <Button asChild variant="ghost" size="icon">
          <Link
            to="/admin/video-carousels"
            search={{
              q: undefined,
              sort: undefined,
              direction: undefined,
              page: undefined,
              account: undefined,
            }}
            aria-label="Back to carousels"
            title="Back to carousels"
          >
            <ArrowLeftIcon />
          </Link>
        </Button>
        <span
          className="font-heading min-w-0 truncate text-[0.99rem] leading-snug font-medium"
          title={name}
        >
          {name}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={!canUndo}
          onClick={onUndo}
          aria-label="Undo"
          title="Undo"
        >
          <Undo2Icon />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={!canRedo}
          onClick={onRedo}
          aria-label="Redo"
          title="Redo"
        >
          <Redo2Icon />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onReset}
          aria-label="Reset slide to defaults"
          title="Reset slide to defaults"
        >
          <RotateCcwIcon />
        </Button>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={!canPolish || polishing}
          onClick={onPolish}
          aria-label="Polish selected text"
          title="Polish selected text"
        >
          {polishing ? (
            <Loader2Icon className="animate-spin" />
          ) : (
            <SparklesIcon />
          )}
        </Button>
        <Button type="button" variant="outline" onClick={onPreview}>
          <EyeIcon />
          Preview
        </Button>
        <Button type="button" onClick={onExport}>
          <DownloadIcon />
          Export
        </Button>
      </div>
    </div>
  )
}

// -------------------------------------------------------------- Rail --------

const RAIL: { id: StudioPanel; label: string; Icon: typeof TypeIcon }[] = [
  { id: "slides", label: "Slides", Icon: LayersIcon },
  { id: "text", label: "Text", Icon: TypeIcon },
  { id: "image", label: "Image", Icon: ImageIcon },
  { id: "shadow", label: "Shadow", Icon: BlendIcon },
]

function IconRail({
  panel,
  onSelect,
}: {
  panel: StudioPanel
  onSelect: (panel: StudioPanel) => void
}) {
  return (
    <nav
      data-screen-label="Tool rail"
      aria-label="Carousel panels"
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

// --------------------------------------------------------- Context panel ----

function CarouselContextPanel({
  carouselId,
  panel,
  slides,
  format,
  selectedSlideId,
  onSelectSlide,
  onAddSlide,
  onDuplicateSlide,
  onDeleteSlide,
  onAddItem,
}: {
  carouselId: string
  panel: StudioPanel
  slides: CarouselSlide[]
  format: CarouselFormat
  selectedSlideId: string
  onSelectSlide: (slideId: string) => void
  onAddSlide: () => void
  onDuplicateSlide: (slideId: string) => void
  onDeleteSlide: (slideId: string) => void
  onAddItem: (item: CarouselSlideItem) => void
}) {
  const [slidesView, setSlidesView] = React.useState<"list" | "grid">("list")
  const currentPanel = RAIL.find((item) => item.id === panel) ?? RAIL[0]
  const PanelIcon = currentPanel.Icon

  return (
    <div className="flex h-full min-h-0 flex-col">
      <WorkspacePanelHeader
        icon={<PanelIcon className="size-4" />}
        title={currentPanel.label}
        meta={panel === "slides" ? `${slides.length} slides` : undefined}
        action={
          panel === "slides" ? (
            <SlidesViewToggle view={slidesView} onChange={setSlidesView} />
          ) : undefined
        }
      />

      <ScrollArea className="min-h-0 flex-1">
        <div className="p-4">
          {panel === "slides" ? (
            <SlidesPanelBody
              view={slidesView}
              slides={slides}
              format={format}
              selectedSlideId={selectedSlideId}
              onSelectSlide={onSelectSlide}
              onAddSlide={onAddSlide}
              onDuplicateSlide={onDuplicateSlide}
              onDeleteSlide={onDeleteSlide}
            />
          ) : panel === "text" ? (
            <TextPanelBody onAddItem={onAddItem} />
          ) : panel === "image" ? (
            <ImagePanelBody
              carouselId={carouselId}
              format={format}
              onAddItem={onAddItem}
            />
          ) : (
            <ShadowPanelBody onAddItem={onAddItem} />
          )}
        </div>
      </ScrollArea>
    </div>
  )
}

function StudioLabel({
  children,
  style,
}: {
  children: React.ReactNode
  style?: React.CSSProperties
}) {
  return (
    <div className="st-lbl" style={{ marginBottom: 10, ...style }}>
      {children}
    </div>
  )
}

// ------------------------------------------------------- Slides panel -------

function SlidesViewToggle({
  view,
  onChange,
}: {
  view: "list" | "grid"
  onChange: (view: "list" | "grid") => void
}) {
  return (
    <div className="flex items-center gap-1">
      {(
        [
          ["list", ListIcon, "List view"],
          ["grid", LayoutGridIcon, "Thumbnail view"],
        ] as const
      ).map(([id, Icon, label]) => {
        const on = view === id
        return (
          <Button
            key={id}
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => onChange(id)}
            aria-label={label}
            aria-pressed={on}
            title={label}
            className={on ? "bg-muted text-foreground" : undefined}
          >
            <Icon />
          </Button>
        )
      })}
    </div>
  )
}

function SlidesPanelBody({
  view,
  slides,
  format,
  selectedSlideId,
  onSelectSlide,
  onAddSlide,
  onDuplicateSlide,
  onDeleteSlide,
}: {
  view: "list" | "grid"
  slides: CarouselSlide[]
  format: CarouselFormat
  selectedSlideId: string
  onSelectSlide: (slideId: string) => void
  onAddSlide: () => void
  onDuplicateSlide: (slideId: string) => void
  onDeleteSlide: (slideId: string) => void
}) {
  const canDelete = slides.length > 1

  const addButton = (
    <Button
      type="button"
      variant="outline"
      className="mt-2 w-full border-dashed"
      disabled={slides.length >= 20}
      onClick={onAddSlide}
    >
      <PlusIcon />
      Add slide
    </Button>
  )

  return (
    <div>
      {view === "list" ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr)",
            gap: 9,
          }}
        >
          {slides.map((slide, index) => (
            <SlideListRow
              key={slide.id}
              slide={slide}
              index={index}
              format={format}
              selected={slide.id === selectedSlideId}
              canDelete={canDelete}
              onSelect={() => onSelectSlide(slide.id)}
              onDuplicate={() => onDuplicateSlide(slide.id)}
              onDelete={() => onDeleteSlide(slide.id)}
            />
          ))}
        </div>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr)",
            gap: 10,
          }}
        >
          {slides.map((slide, index) => (
            <SlideGridCard
              key={slide.id}
              slide={slide}
              index={index}
              format={format}
              selected={slide.id === selectedSlideId}
              canDelete={canDelete}
              onSelect={() => onSelectSlide(slide.id)}
              onDuplicate={() => onDuplicateSlide(slide.id)}
              onDelete={() => onDeleteSlide(slide.id)}
            />
          ))}
        </div>
      )}

      {addButton}
    </div>
  )
}

function SlideListRow({
  slide,
  index,
  format,
  selected,
  canDelete,
  onSelect,
  onDuplicate,
  onDelete,
}: {
  slide: CarouselSlide
  index: number
  format: CarouselFormat
  selected: boolean
  canDelete: boolean
  onSelect: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const thumbWidth = 46
  const thumbHeight = Math.round(thumbWidth / FORMAT_RATIOS[format])

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: 8,
        minWidth: 0,
        background: "var(--panel2)",
        border: `1px solid ${selected ? "var(--acc)" : "var(--line)"}`,
        borderRadius: 12,
        boxShadow: selected ? "0 0 0 2px var(--acc-soft)" : "none",
      }}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-label={`Select slide ${index + 1}`}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flex: 1,
          minWidth: 0,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          padding: 0,
        }}
      >
        <div
          style={{
            width: thumbWidth,
            height: thumbHeight,
            flex: "none",
            borderRadius: 8,
            overflow: "hidden",
            border: "1px solid var(--line)",
          }}
        >
          <StaticSlidePreview slide={slide} format={format} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--mut)" }}>
            {String(index + 1).padStart(2, "0")}
          </div>
          <div style={rowTitle}>{slide.title || "Untitled"}</div>
        </div>
      </button>
      <div style={{ display: "flex", flex: "none", gap: 2 }}>
        <button
          type="button"
          className="st-hovbg"
          onClick={onDuplicate}
          aria-label="Duplicate slide"
          title="Duplicate slide"
          style={slideRowIconBtn}
        >
          <CopyIcon size={14} />
        </button>
        <button
          type="button"
          className="st-hovbg"
          onClick={onDelete}
          disabled={!canDelete}
          aria-label="Delete slide"
          title="Delete slide"
          style={{
            ...slideRowIconBtn,
            opacity: canDelete ? 1 : 0.35,
            cursor: canDelete ? "pointer" : "default",
          }}
        >
          <Trash2Icon size={14} />
        </button>
      </div>
    </div>
  )
}

function SlideGridCard({
  slide,
  index,
  format,
  selected,
  canDelete,
  onSelect,
  onDuplicate,
  onDelete,
}: {
  slide: CarouselSlide
  index: number
  format: CarouselFormat
  selected: boolean
  canDelete: boolean
  onSelect: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  return (
    <div className="group relative">
      <button
        type="button"
        onClick={onSelect}
        aria-label={`Select slide ${index + 1}`}
        style={{
          display: "block",
          width: "100%",
          padding: 0,
          border: `1px solid ${selected ? "var(--acc)" : "var(--line)"}`,
          borderRadius: 10,
          overflow: "hidden",
          cursor: "pointer",
          background: "var(--panel2)",
          boxShadow: selected ? "0 0 0 2px var(--acc-soft)" : "none",
        }}
      >
        <StaticSlidePreview slide={slide} format={format} />
      </button>
      <span
        style={{
          position: "absolute",
          top: 6,
          left: 6,
          padding: "1px 6px",
          borderRadius: 6,
          fontSize: 10,
          fontWeight: 700,
          background: "rgba(0,0,0,.55)",
          color: "#fff",
          pointerEvents: "none",
        }}
      >
        {String(index + 1).padStart(2, "0")}
      </span>
      <div className="absolute top-[5px] right-[5px] flex gap-[3px] opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <button
          type="button"
          className="st-hovbright"
          onClick={onDuplicate}
          aria-label="Duplicate slide"
          title="Duplicate slide"
          style={gridCardIconBtn}
        >
          <CopyIcon size={12} />
        </button>
        <button
          type="button"
          className="st-hovbright"
          onClick={onDelete}
          disabled={!canDelete}
          aria-label="Delete slide"
          title="Delete slide"
          style={{
            ...gridCardIconBtn,
            opacity: canDelete ? 1 : 0.4,
            cursor: canDelete ? "pointer" : "default",
          }}
        >
          <Trash2Icon size={12} />
        </button>
      </div>
    </div>
  )
}

const slideRowIconBtn: React.CSSProperties = {
  height: 30,
  width: 30,
  display: "grid",
  placeItems: "center",
  border: "none",
  background: "transparent",
  borderRadius: 8,
  color: "var(--mut)",
  cursor: "pointer",
}

const gridCardIconBtn: React.CSSProperties = {
  height: 22,
  width: 22,
  display: "grid",
  placeItems: "center",
  border: "none",
  background: "rgba(0,0,0,.55)",
  borderRadius: 6,
  color: "#fff",
  cursor: "pointer",
}

// --------------------------------------------------------- Text panel -------

function TextPanelBody({
  onAddItem,
}: {
  onAddItem: (item: CarouselSlideItem) => void
}) {
  return (
    <div>
      <StudioLabel>Styles</StudioLabel>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr)",
          gap: 9,
          marginBottom: 20,
        }}
      >
        {TEXT_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className="st-hovcard"
            onClick={() => onAddItem(createTextPresetItem(preset))}
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "14px 15px",
              background: "var(--panel2)",
              border: "1px solid var(--line)",
              borderRadius: 12,
              cursor: "pointer",
            }}
          >
            <span style={preset.preview}>{preset.label}</span>
            <PlusIcon size={14} style={{ color: "var(--mut)", flex: "none" }} />
          </button>
        ))}
      </div>

      <StudioLabel>Fonts</StudioLabel>
      <div
        style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}
      >
        {TEXT_FONTS.map((font) => (
          <button
            key={font.id}
            type="button"
            className="st-hovcard"
            onClick={() =>
              onAddItem({
                ...createTextItem(),
                fontId: font.id,
                text: font.label,
              })
            }
            title={`Add ${font.label} text`}
            style={{
              padding: "8px 13px",
              border: "1px solid var(--line)",
              borderRadius: 999,
              background: "var(--panel2)",
              color: "var(--ink)",
              fontSize: 12.5,
              cursor: "pointer",
              fontFamily: font.family,
              fontWeight: font.weight,
            }}
          >
            {font.label}
          </button>
        ))}
      </div>

      <StudioLabel>Stickers</StudioLabel>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4,1fr)",
          gap: 9,
        }}
      >
        {STICKERS.map((sticker) => (
          <button
            key={sticker}
            type="button"
            className="st-hovcard"
            onClick={() =>
              onAddItem({
                ...createTextItem(),
                text: sticker,
                fontSize: 90,
                align: "center",
                y: 0.4,
                height: 0.2,
              })
            }
            style={{
              aspectRatio: "1",
              display: "grid",
              placeItems: "center",
              fontSize: 22,
              background: "var(--panel2)",
              border: "1px solid var(--line)",
              borderRadius: 12,
              cursor: "pointer",
            }}
          >
            {sticker}
          </button>
        ))}
      </div>
    </div>
  )
}

// -------------------------------------------------------- Image panel -------

function ImagePanelBody({
  carouselId,
  format,
  onAddItem,
}: {
  carouselId: string
  format: CarouselFormat
  onAddItem: (item: CarouselSlideItem) => void
}) {
  const [search, setSearch] = React.useState("")
  const [debounced, setDebounced] = React.useState("")
  const [items, setItems] = React.useState<MediaItem[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [refresh, setRefresh] = React.useState(0)
  const [uploading, setUploading] = React.useState(false)
  const fileRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 250)
    return () => clearTimeout(id)
  }, [search])

  React.useEffect(() => {
    let active = true
    listVideoMedia({
      scope: { type: "carousel", id: carouselId },
      pageSize: 30,
      fileType: "image",
      search: debounced || undefined,
    })
      .then((data) => {
        if (!active) return
        setItems(data.media)
        setError(null)
      })
      .catch((caught) => {
        if (!active) return
        setError(getMediaErrorMessage(caught))
      })
    return () => {
      active = false
    }
  }, [carouselId, debounced, refresh])

  async function handleUpload(files: FileList | null) {
    if (!files?.length) return
    setUploading(true)
    setError(null)
    try {
      for (const file of Array.from(files)) {
        const media = await uploadMedia(file)
        await attachEditorMedia({ type: "carousel", id: carouselId }, media.id)
      }
      setRefresh((c) => c + 1)
    } catch (caught) {
      setError(getMediaErrorMessage(caught))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            gap: 8,
            height: 34,
            padding: "0 11px",
            background: "var(--elev)",
            borderRadius: 9,
            minWidth: 0,
          }}
        >
          <SearchIcon size={14} style={{ color: "var(--mut)", flex: "none" }} />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search media"
            style={{
              flex: 1,
              minWidth: 0,
              background: "transparent",
              border: "none",
              outline: "none",
              fontSize: 12,
              color: "var(--ink)",
            }}
          />
        </div>
        <button
          type="button"
          className="st-hovbg"
          onClick={() => fileRef.current?.click()}
          title="Upload image"
          style={{
            height: 34,
            width: 34,
            display: "grid",
            placeItems: "center",
            background: "var(--elev)",
            border: "none",
            borderRadius: 9,
            color: "var(--ink)",
            cursor: "pointer",
            flex: "none",
          }}
        >
          <PlusIcon size={15} />
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            void handleUpload(e.target.files)
            e.target.value = ""
          }}
        />
      </div>

      <div
        className="st-hovcard"
        onClick={() => fileRef.current?.click()}
        style={{
          border: "1.5px dashed var(--line2)",
          borderRadius: 13,
          padding: "18px 12px",
          textAlign: "center",
          marginBottom: 18,
          background: "var(--panel2)",
          cursor: "pointer",
          transition: "background .13s",
        }}
      >
        <div
          style={{
            display: "grid",
            placeItems: "center",
            marginBottom: 6,
            color: "var(--mut)",
          }}
        >
          <UploadIcon size={22} />
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>
          {uploading ? "Uploading…" : "Drop or import media"}
        </div>
        <div style={{ fontSize: 11, color: "var(--mut)", marginTop: 2 }}>
          PNG · JPG · WEBP
        </div>
      </div>

      {error ? (
        <div
          style={{ fontSize: 11.5, color: "var(--coral)", marginBottom: 12 }}
        >
          {error}
        </div>
      ) : null}

      <StudioLabel>Your media · {items.length}</StudioLabel>
      {/* 2-col masonry so each thumbnail keeps its own aspect ratio (no crop). */}
      <div style={{ columnCount: 2, columnGap: 10 }}>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className="st-hovlift"
            onClick={(event) => {
              const img = event.currentTarget.querySelector("img")
              const box =
                img && img.naturalWidth && img.naturalHeight
                  ? fitImageBox(img.naturalWidth, img.naturalHeight, format)
                  : undefined
              onAddItem(
                createImageItem(item.url, item.original_name, item.id, box)
              )
            }}
            title={`Add ${item.original_name}`}
            style={{
              display: "block",
              width: "100%",
              marginBottom: 10,
              breakInside: "avoid",
              borderRadius: 12,
              overflow: "hidden",
              border: "1px solid var(--line)",
              cursor: "pointer",
              background: "var(--elev)",
              padding: 0,
            }}
          >
            <img
              src={item.url}
              alt=""
              draggable={false}
              style={{ display: "block", width: "100%", height: "auto" }}
            />
          </button>
        ))}
      </div>
      {!items.length && !error ? (
        <div style={{ fontSize: 12, color: "var(--mut)", padding: "8px 2px" }}>
          No images yet — import one to place it on the slide.
        </div>
      ) : null}
    </div>
  )
}

// ------------------------------------------------------- Shadow panel -------

function ShadowPanelBody({
  onAddItem,
}: {
  onAddItem: (item: CarouselSlideItem) => void
}) {
  const [tint, setTint] = React.useState<"dark" | "light">("dark")
  const [opacity, setOpacity] = React.useState(DEFAULT_GRADIENT_SHADOW_OPACITY)
  const color = tint === "dark" ? "#000000" : "#ffffff"

  return (
    <div>
      <StudioLabel>Scrim style</StudioLabel>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 9,
          marginBottom: 18,
        }}
      >
        {SHADOW_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className="st-hovlift"
            onClick={() =>
              onAddItem(createShadowPresetItem(preset, color, opacity))
            }
            style={{
              border: "1px solid var(--line)",
              borderRadius: 12,
              overflow: "hidden",
              cursor: "pointer",
              background: "var(--panel2)",
              padding: 0,
              textAlign: "left",
            }}
          >
            <div
              style={{
                height: 62,
                position: "relative",
                background: "#3a5675",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  background: shadowPreviewCss(preset.direction),
                }}
              />
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, padding: "7px 9px" }}>
              {preset.label}
            </div>
          </button>
        ))}
      </div>

      <StudioLabel>Tint</StudioLabel>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          marginBottom: 18,
        }}
      >
        {(["dark", "light"] as const).map((value) => {
          const on = tint === value
          return (
            <button
              key={value}
              type="button"
              onClick={() => setTint(value)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 12px",
                borderRadius: 11,
                fontSize: 12,
                cursor: "pointer",
                color: "var(--ink)",
                border: `1px solid ${on ? "var(--acc)" : "var(--line)"}`,
                background: on ? "var(--acc-soft)" : "var(--panel2)",
              }}
            >
              <span
                style={{
                  height: 16,
                  width: 16,
                  borderRadius: 5,
                  border: "1px solid var(--line2)",
                  background: value === "dark" ? "#000" : "#fff",
                }}
              />
              {value === "dark" ? "Dark" : "Light"}
            </button>
          )
        })}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 9,
        }}
      >
        <span className="st-lbl">Opacity</span>
        <span
          style={{
            fontSize: 11.5,
            color: "var(--ink2)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {Math.round(opacity)}%
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={opacity}
        onChange={(e) => setOpacity(Number(e.target.value))}
        aria-label="Scrim opacity"
        style={{ width: "100%", background: fillTrack(opacity, 0, 100) }}
      />

      <div
        style={{
          fontSize: 11,
          color: "var(--mut)",
          lineHeight: 1.5,
          marginTop: 14,
        }}
      >
        Scrims darken part of a photo so text stays readable. Pick a direction,
        tint and strength — it drops in as a layer you can resize on the canvas.
      </div>
    </div>
  )
}

// -------------------------------------------------------- Canvas stage ------

function CanvasStage({
  slide,
  slides,
  slideIndex,
  format,
  selectedItemId,
  onSelectItem,
  onSelectSlide,
  onUpdateItem,
  onCommitHistory,
  getSnapshot,
}: {
  slide: CarouselSlide
  slides: CarouselSlide[]
  slideIndex: number
  format: CarouselFormat
  selectedItemId: string | null
  onSelectItem: (itemId: string | null) => void
  onSelectSlide: (slideId: string) => void
  onUpdateItem: (
    itemId: string,
    patch: Partial<CarouselSlideItem>,
    transient?: boolean
  ) => void
  onCommitHistory: (before: Snapshot) => void
  getSnapshot: () => Snapshot
}) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const dragRef = React.useRef<{
    itemId: string
    mode: "move" | "resize"
    startX: number
    startY: number
    item: CarouselSlideItem
    before: Snapshot
  } | null>(null)
  const [box, setBox] = React.useState({ width: 0, height: 0 })
  // null = auto-fit; a number is a fixed scale relative to the 1080px artboard.
  // Opens at DEFAULT_ZOOM; the "Fit" button switches to auto-fit (null).
  const [zoom, setZoom] = React.useState<number | null>(DEFAULT_ZOOM)

  React.useEffect(() => {
    const node = containerRef.current
    if (!node) return
    const observer = new ResizeObserver(() =>
      setBox({ width: node.clientWidth, height: node.clientHeight })
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const ratio = FORMAT_RATIOS[format]
  // Base "fit" size: the largest artboard that fits the padded container.
  let fitWidth = box.width - 48
  let fitHeight = fitWidth / ratio
  if (fitHeight > box.height - 48) {
    fitHeight = box.height - 48
    fitWidth = fitHeight * ratio
  }
  fitWidth = Math.max(160, fitWidth)
  const fitScale = fitWidth / 1080
  const scale = zoom ?? fitScale
  const stageWidth = Math.max(120, 1080 * scale)
  const stageHeight = stageWidth / ratio
  const zoomPct = Math.max(1, Math.round(scale * 100))
  const overflowing =
    stageWidth > box.width - 40 || stageHeight > box.height - 40

  function zoomBy(factor: number) {
    const next = Math.min(
      ZOOM_MAX,
      Math.max(ZOOM_MIN, Math.round(scale * factor * 100) / 100)
    )
    setZoom(next)
  }

  function handlePointerDown(
    event: React.PointerEvent<HTMLElement>,
    item: CarouselSlideItem,
    mode: "move" | "resize"
  ) {
    if (event.button !== 0) return
    event.stopPropagation()
    onSelectItem(item.id)
    dragRef.current = {
      itemId: item.id,
      mode,
      startX: event.clientX,
      startY: event.clientY,
      item,
      before: getSnapshot(),
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: React.PointerEvent<HTMLElement>) {
    const drag = dragRef.current
    if (!drag) return
    const dx = (event.clientX - drag.startX) / stageWidth
    const dy = (event.clientY - drag.startY) / stageHeight
    if (drag.mode === "move") {
      onUpdateItem(
        drag.itemId,
        {
          x: clamp01(drag.item.x + dx, 1 - drag.item.width),
          y: clamp01(drag.item.y + dy, 1 - drag.item.height),
        },
        true
      )
      return
    }

    onUpdateItem(
      drag.itemId,
      {
        width: clampSize(drag.item.width + dx, 1 - drag.item.x),
        height: clampSize(drag.item.height + dy, 1 - drag.item.y),
      },
      true
    )
  }

  function handlePointerUp(event: React.PointerEvent<HTMLElement>) {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    onCommitHistory(drag.before)
  }

  return (
    <main
      ref={containerRef}
      style={{
        position: "relative",
        flex: 1,
        minWidth: 0,
        overflow: "hidden",
        background:
          "radial-gradient(130% 110% at 50% -5%,var(--panel),var(--paper) 70%)",
      }}
    >
      {/* Scrollable artboard area — the floating chrome below stays fixed. */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "safe center",
          padding: 24,
          overflow: overflowing ? "auto" : "hidden",
        }}
        onPointerDown={() => onSelectItem(null)}
      >
        <div
          style={{
            position: "relative",
            flex: "none",
            overflow: "hidden",
            borderRadius: 14,
            boxShadow: "var(--sh-lg), 0 0 0 1px rgba(0,0,0,.05)",
            width: stageWidth,
            height: stageHeight,
            backgroundColor: slide.backgroundColor,
          }}
          onPointerDown={(event) => {
            event.stopPropagation()
            onSelectItem(null)
          }}
        >
          {slide.items
            .slice()
            .sort((a, b) => a.zIndex - b.zIndex)
            .map((item) => (
              <CanvasItem
                key={item.id}
                item={item}
                selected={item.id === selectedItemId}
                scale={scale}
                onPointerDown={(event) =>
                  handlePointerDown(event, item, "move")
                }
                onResizeDown={(event) =>
                  handlePointerDown(event, item, "resize")
                }
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
              />
            ))}
        </div>
      </div>

      <div
        style={{
          position: "absolute",
          left: 20,
          top: 16,
          display: "flex",
          alignItems: "center",
          gap: 9,
          zIndex: 6,
          pointerEvents: "none",
          maxWidth: "calc(100% - 200px)",
        }}
      >
        <span
          style={{
            fontFamily: "var(--app-font-sans)",
            fontSize: 15,
            letterSpacing: ".04em",
            color: "var(--mut)",
            flex: "none",
          }}
        >
          SLIDE {String(slideIndex + 1).padStart(2, "0")}
        </span>
        <span
          style={{
            height: 4,
            width: 4,
            borderRadius: "50%",
            background: "var(--line2)",
            flex: "none",
          }}
        />
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: "var(--ink2)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {slide.title || "Untitled"}
        </span>
      </div>

      <ZoomControl
        pct={zoomPct}
        isFit={zoom === null}
        canZoomOut={scale > ZOOM_MIN}
        canZoomIn={scale < ZOOM_MAX}
        onZoomOut={() => zoomBy(1 / ZOOM_FACTOR)}
        onZoomIn={() => zoomBy(ZOOM_FACTOR)}
        onFit={() => setZoom(null)}
      />

      <SlidePager
        slides={slides}
        slideIndex={slideIndex}
        onSelect={onSelectSlide}
      />
    </main>
  )
}

function ZoomControl({
  pct,
  isFit,
  canZoomOut,
  canZoomIn,
  onZoomOut,
  onZoomIn,
  onFit,
}: {
  pct: number
  isFit: boolean
  canZoomOut: boolean
  canZoomIn: boolean
  onZoomOut: () => void
  onZoomIn: () => void
  onFit: () => void
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: 16,
        right: 20,
        display: "flex",
        alignItems: "center",
        gap: 2,
        padding: "4px 6px",
        background: "var(--panel)",
        border: "1px solid var(--line)",
        borderRadius: 13,
        boxShadow: "var(--sh)",
        zIndex: 10,
      }}
    >
      <button
        type="button"
        className={canZoomOut ? "st-hovbg" : undefined}
        onClick={onZoomOut}
        disabled={!canZoomOut}
        aria-label="Zoom out"
        style={{
          ...zoomIconBtn,
          opacity: canZoomOut ? 1 : 0.35,
          cursor: canZoomOut ? "pointer" : "default",
        }}
      >
        <MinusIcon size={15} />
      </button>
      <span
        style={{
          minWidth: 42,
          textAlign: "center",
          fontSize: 12,
          fontWeight: 600,
          color: "var(--ink2)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {pct}%
      </span>
      <button
        type="button"
        className={canZoomIn ? "st-hovbg" : undefined}
        onClick={onZoomIn}
        disabled={!canZoomIn}
        aria-label="Zoom in"
        style={{
          ...zoomIconBtn,
          opacity: canZoomIn ? 1 : 0.35,
          cursor: canZoomIn ? "pointer" : "default",
        }}
      >
        <PlusIcon size={15} />
      </button>
      <div
        style={{
          width: 1,
          height: 18,
          background: "var(--line)",
          margin: "0 4px",
        }}
      />
      <button
        type="button"
        className="st-hovbg"
        onClick={onFit}
        aria-label="Fit to view"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 5,
          height: 28,
          padding: "0 10px",
          border: "none",
          background: isFit ? "var(--elev2)" : "transparent",
          borderRadius: 8,
          color: "var(--ink)",
          fontSize: 12,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        <Maximize2Icon size={14} />
        Fit
      </button>
    </div>
  )
}

const zoomIconBtn: React.CSSProperties = {
  height: 28,
  width: 28,
  display: "grid",
  placeItems: "center",
  border: "none",
  background: "transparent",
  borderRadius: 8,
  color: "var(--ink2)",
}

function SlidePager({
  slides,
  slideIndex,
  onSelect,
}: {
  slides: CarouselSlide[]
  slideIndex: number
  onSelect: (slideId: string) => void
}) {
  const current = slideIndex < 0 ? 0 : slideIndex
  const MAX_DOTS = 9
  let start = 0
  if (slides.length > MAX_DOTS) {
    start = Math.min(
      Math.max(0, current - Math.floor(MAX_DOTS / 2)),
      slides.length - MAX_DOTS
    )
  }
  const windowed = slides.slice(start, start + MAX_DOTS)

  function step(delta: number) {
    const next = slides[current + delta]
    if (next) onSelect(next.id)
  }

  return (
    <div
      onPointerDown={(event) => event.stopPropagation()}
      style={{
        position: "absolute",
        left: "50%",
        bottom: 22,
        transform: "translateX(-50%)",
        display: "flex",
        alignItems: "center",
        gap: 4,
        padding: "6px 10px",
        background: "var(--panel)",
        border: "1px solid var(--line)",
        borderRadius: 15,
        boxShadow: "var(--sh)",
        zIndex: 10,
      }}
    >
      <button
        type="button"
        className={current <= 0 ? undefined : "st-hovbg"}
        onClick={() => step(-1)}
        disabled={current <= 0}
        aria-label="Previous slide"
        style={{
          ...pagerArrow,
          opacity: current <= 0 ? 0.35 : 1,
          cursor: current <= 0 ? "default" : "pointer",
        }}
      >
        <ChevronLeftIcon size={16} />
      </button>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          padding: "0 6px",
        }}
      >
        {windowed.map((slide, i) => {
          const realIndex = start + i
          const on = realIndex === current
          return (
            <button
              key={slide.id}
              type="button"
              onClick={() => onSelect(slide.id)}
              aria-label={`Go to slide ${realIndex + 1}`}
              style={{
                height: 7,
                width: on ? 20 : 7,
                padding: 0,
                border: "none",
                borderRadius: 999,
                cursor: "pointer",
                background: on ? "var(--acc)" : "var(--line2)",
                transition: "width .15s, background .15s",
              }}
            />
          )
        })}
      </div>
      <button
        type="button"
        className={current >= slides.length - 1 ? undefined : "st-hovbg"}
        onClick={() => step(1)}
        disabled={current >= slides.length - 1}
        aria-label="Next slide"
        style={{
          ...pagerArrow,
          opacity: current >= slides.length - 1 ? 0.35 : 1,
          cursor: current >= slides.length - 1 ? "default" : "pointer",
        }}
      >
        <ChevronRightIcon size={16} />
      </button>
      <span
        style={{
          fontSize: 12.5,
          fontWeight: 600,
          color: "var(--ink2)",
          marginLeft: 4,
          paddingLeft: 10,
          borderLeft: "1px solid var(--line)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {current + 1}{" "}
        <span style={{ color: "var(--mut)" }}>/ {slides.length}</span>
      </span>
    </div>
  )
}

const pagerArrow: React.CSSProperties = {
  height: 34,
  width: 34,
  display: "grid",
  placeItems: "center",
  border: "none",
  background: "transparent",
  borderRadius: "50%",
  color: "var(--ink2)",
}

function CanvasItem({
  item,
  selected,
  scale,
  onPointerDown,
  onResizeDown,
  onPointerMove,
  onPointerUp,
}: {
  item: CarouselSlideItem
  selected: boolean
  scale: number
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void
  onResizeDown: (event: React.PointerEvent<HTMLElement>) => void
  onPointerMove: (event: React.PointerEvent<HTMLElement>) => void
  onPointerUp: (event: React.PointerEvent<HTMLElement>) => void
}) {
  return (
    <div
      className="touch-none select-none"
      style={{
        position: "absolute",
        left: `${item.x * 100}%`,
        top: `${item.y * 100}%`,
        width: `${item.width * 100}%`,
        height: `${item.height * 100}%`,
        zIndex: item.zIndex,
        outline: selected ? "2px solid var(--acc)" : undefined,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {item.type === "text" ? (
        <CarouselTextLayer item={item} fontSize={item.fontSize * scale} />
      ) : item.type === "image" ? (
        <img
          src={item.url}
          alt={item.altText ?? ""}
          draggable={false}
          className={cn("h-full w-full rounded-sm", imageFitClass(item.fit))}
        />
      ) : item.type === "gradient-shadow" ? (
        <div
          className="h-full w-full rounded-sm"
          style={{ background: gradientShadowBackground(item) }}
        />
      ) : (
        <div className="grid h-full w-full place-items-center rounded-sm border bg-black text-white">
          <ImageIcon className="size-8" />
        </div>
      )}
      {selected ? (
        <button
          type="button"
          onPointerDown={onResizeDown}
          aria-label="Resize layer"
          style={{
            position: "absolute",
            right: -7,
            bottom: -7,
            height: 15,
            width: 15,
            borderRadius: "50%",
            border: "1px solid var(--line2)",
            background: "var(--panel)",
            boxShadow: "var(--sh-sm)",
            cursor: "nwse-resize",
          }}
        />
      ) : null}
    </div>
  )
}

function CarouselTextLayer({
  item,
  fontSize,
}: {
  item: CarouselTextItem
  fontSize: number | string
}) {
  const font = requireTextFont(item.fontId)

  return (
    <div
      className="h-full w-full break-words whitespace-pre-wrap"
      style={{
        color: item.color,
        fontFamily: font.family,
        fontSize,
        fontWeight: font.weight,
        lineHeight: 1.16,
        textAlign: item.align,
      }}
    >
      {item.text}
    </div>
  )
}

// --------------------------------------------------------- Inspector --------

function CarouselInspector({
  slide,
  selectedItem,
  format,
  textSwatches,
  backgroundSwatches,
  onUpdateFormat,
  onUpdateSlide,
  onUpdateItem,
  onDeleteItem,
  onMoveLayer,
}: {
  slide: CarouselSlide
  selectedItem: CarouselSlideItem | null
  format: CarouselFormat
  textSwatches: string[]
  backgroundSwatches: string[]
  onUpdateFormat: (format: CarouselFormat) => void
  onUpdateSlide: (patch: Partial<CarouselSlide>) => void
  onUpdateItem: (itemId: string, patch: Partial<CarouselSlideItem>) => void
  onDeleteItem: (itemId: string) => void
  onMoveLayer: (itemId: string, direction: 1 | -1) => void
}) {
  const title = getInspectorTitle(selectedItem)

  return (
    <aside
      data-screen-label="Inspector"
      className="flex h-full min-h-0 flex-col"
    >
      <WorkspacePanelHeader
        icon={<SlidersHorizontalIcon className="size-4" />}
        title={selectedItem ? title : "Inspector"}
        meta={slide.title || "Untitled slide"}
      />

      <ScrollArea className="min-h-0 flex-1">
        <div className="grid auto-rows-min gap-3 p-4">
          {selectedItem ? (
            selectedItem.type === "text" ? (
              <TextInspector
                item={selectedItem}
                swatches={textSwatches}
                onUpdate={(patch) => onUpdateItem(selectedItem.id, patch)}
              />
            ) : selectedItem.type === "gradient-shadow" ? (
              <GradientShadowInspector
                item={selectedItem}
                onUpdate={(patch) => onUpdateItem(selectedItem.id, patch)}
              />
            ) : (
              <MediaInspector
                item={selectedItem}
                onUpdate={(patch) => onUpdateItem(selectedItem.id, patch)}
              />
            )
          ) : (
            <SlideInspector
              slide={slide}
              format={format}
              swatches={backgroundSwatches}
              onUpdateFormat={onUpdateFormat}
              onUpdateSlide={onUpdateSlide}
            />
          )}

          {selectedItem ? (
            <LayerControls
              onBringForward={() => onMoveLayer(selectedItem.id, 1)}
              onSendBackward={() => onMoveLayer(selectedItem.id, -1)}
              onDelete={() => onDeleteItem(selectedItem.id)}
            />
          ) : null}
        </div>
      </ScrollArea>
    </aside>
  )
}

function getInspectorTitle(selectedItem: CarouselSlideItem | null) {
  if (!selectedItem) return "Slide"
  if (selectedItem.type === "text") return "Text"
  if (selectedItem.type === "image") return "Image"
  if (selectedItem.type === "gradient-shadow") return "Shadow"
  return "Media"
}

function SlideInspector({
  slide,
  format,
  swatches,
  onUpdateFormat,
  onUpdateSlide,
}: {
  slide: CarouselSlide
  format: CarouselFormat
  swatches: string[]
  onUpdateFormat: (format: CarouselFormat) => void
  onUpdateSlide: (patch: Partial<CarouselSlide>) => void
}) {
  return (
    <InspectorCard
      title="Slide"
      description="The name, shape and background for this slide."
    >
      <div className="grid gap-2">
        <FieldLabel htmlFor="carousel-slide-name">Slide name</FieldLabel>
        <Input
          id="carousel-slide-name"
          value={slide.title}
          maxLength={120}
          onChange={(event) => onUpdateSlide({ title: event.target.value })}
        />
      </div>

      <div className="grid gap-2">
        <FieldLabel>Format</FieldLabel>
        <SegRow
          columns={3}
          value={format}
          onChange={(value) => onUpdateFormat(value)}
          options={[
            { value: "4:5", label: "4:5" },
            { value: "1:1", label: "1:1" },
            { value: "9:16", label: "9:16" },
          ]}
        />
      </div>

      <div className="grid gap-2">
        <FieldLabel>Background</FieldLabel>
        <ColorField
          value={slide.backgroundColor}
          onChange={(backgroundColor) => onUpdateSlide({ backgroundColor })}
          swatches={swatches}
        />
      </div>
    </InspectorCard>
  )
}

function TextInspector({
  item,
  swatches,
  onUpdate,
}: {
  item: CarouselTextItem
  swatches: string[]
  onUpdate: (patch: Partial<CarouselTextItem>) => void
}) {
  return (
    <>
      <InspectorCard
        title="Text"
        description="The words and how they look on this slide."
      >
        <div className="grid gap-2">
          <FieldLabel htmlFor={`carousel-text-${item.id}`}>Content</FieldLabel>
          <Textarea
            id={`carousel-text-${item.id}`}
            value={item.text}
            maxLength={2_000}
            rows={1}
            onChange={(event) => onUpdate({ text: event.target.value })}
          />
        </div>

        <div className="grid gap-2">
          <FieldLabel>Font</FieldLabel>
          <div className="grid grid-cols-2 gap-2">
            {TEXT_FONTS.map((font) => {
              const on = item.fontId === font.id
              return (
                <Button
                  key={font.id}
                  type="button"
                  variant={on ? "secondary" : "outline"}
                  aria-pressed={on}
                  onClick={() => onUpdate({ fontId: font.id })}
                  style={{ fontFamily: font.family }}
                >
                  {font.label}
                </Button>
              )
            })}
          </div>
        </div>

        <SliderField
          id={`carousel-font-size-${item.id}`}
          label="Size"
          value={item.fontSize}
          min={12}
          max={180}
          onChange={(fontSize) => onUpdate({ fontSize })}
        />

        <div className="grid gap-2">
          <FieldLabel>Colour</FieldLabel>
          <ColorField
            value={item.color}
            onChange={(color) => onUpdate({ color })}
            swatches={swatches}
          />
        </div>

        <div className="grid gap-2">
          <FieldLabel>Alignment</FieldLabel>
          <SegRow
            columns={3}
            value={item.align}
            onChange={(align) => onUpdate({ align })}
            options={[
              {
                value: "left",
                label: <AlignLeftIcon size={16} />,
                title: "Align left",
              },
              {
                value: "center",
                label: <AlignCenterIcon size={16} />,
                title: "Align center",
              },
              {
                value: "right",
                label: <AlignRightIcon size={16} />,
                title: "Align right",
              },
            ]}
          />
        </div>
      </InspectorCard>
      <InspectorCard title="Position and size">
        <PositionFields item={item} onUpdate={onUpdate} />
      </InspectorCard>
    </>
  )
}

function MediaInspector({
  item,
  onUpdate,
}: {
  item: CarouselMediaItem
  onUpdate: (patch: Partial<CarouselMediaItem>) => void
}) {
  return (
    <>
      <InspectorCard title="Picture">
        {/* Preview shows the source image at its natural aspect ratio (full panel
          width, height follows the image) rather than a fixed cropped box. */}
        <div
          style={{
            borderRadius: 13,
            marginBottom: 14,
            overflow: "hidden",
            boxShadow: "var(--sh-sm)",
            border: "1px solid var(--line)",
            backgroundColor: "var(--elev)",
          }}
        >
          <img
            src={item.url}
            alt=""
            style={{ display: "block", width: "100%" }}
          />
        </div>
        <div className="grid gap-2">
          <FieldLabel>Fit</FieldLabel>
          <SegRow
            columns={3}
            value={item.fit}
            onChange={(value) => onUpdate(imageFitPatch(value))}
            options={[
              { value: "fill", label: "Fill" },
              { value: "cover", label: "Crop" },
              { value: "contain", label: "Fit" },
            ]}
          />
        </div>
      </InspectorCard>
      <InspectorCard title="Position and size">
        <PositionFields item={item} onUpdate={onUpdate} />
      </InspectorCard>
    </>
  )
}

function GradientShadowInspector({
  item,
  onUpdate,
}: {
  item: CarouselGradientShadowItem
  onUpdate: (patch: Partial<CarouselGradientShadowItem>) => void
}) {
  return (
    <>
      <InspectorCard title="Shadow">
        <div className="grid gap-2">
          <FieldLabel>Direction</FieldLabel>
          <SegRow
            columns={3}
            value={item.direction ?? "up"}
            onChange={(direction) => onUpdate({ direction })}
            options={SHADOW_PRESETS.map((preset) => ({
              value: preset.direction,
              label: preset.label.replace(" fade", "").replace(" scrim", ""),
            }))}
          />
        </div>

        <div className="grid gap-2">
          <FieldLabel>Colour</FieldLabel>
          <ColorField
            value={item.color}
            onChange={(color) => onUpdate({ color })}
            swatches={SHADOW_SWATCHES}
          />
        </div>

        <SliderField
          id={`carousel-shadow-opacity-${item.id}`}
          label="Opacity"
          value={item.opacity}
          min={0}
          max={100}
          unit="%"
          onChange={(opacity) => onUpdate({ opacity })}
        />
      </InspectorCard>
      <InspectorCard title="Position and size">
        <PositionFields item={item} onUpdate={onUpdate} />
      </InspectorCard>
    </>
  )
}

function PositionFields<T extends CarouselSlideItem>({
  item,
  onUpdate,
}: {
  item: T
  onUpdate: (patch: Partial<T>) => void
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
      {(
        [
          ["X", "x", item.x],
          ["Y", "y", item.y],
          ["W", "width", item.width],
          ["H", "height", item.height],
        ] as [string, PositionKey, number][]
      ).map(([label, key, value]) => (
        <PositionNumberField
          key={`${item.id}-${key}`}
          item={item}
          field={key}
          label={label}
          value={value}
          onUpdate={onUpdate}
        />
      ))}
    </div>
  )
}

function PositionNumberField<T extends CarouselSlideItem>({
  item,
  field,
  label,
  value,
  onUpdate,
}: {
  item: T
  field: PositionKey
  label: string
  value: number
  onUpdate: (patch: Partial<T>) => void
}) {
  const formattedValue = String(Math.round(value * 100))
  const [draft, setDraft] = React.useState<string | null>(null)
  const displayValue = draft ?? formattedValue
  const fieldId = `carousel-position-${item.id}-${field}`

  return (
    <div className="grid gap-2">
      <FieldLabel htmlFor={fieldId}>{label}</FieldLabel>
      <Input
        id={fieldId}
        type="number"
        min={0}
        max={100}
        value={displayValue}
        onBlur={() => setDraft(null)}
        onChange={(event) => {
          const nextDraft = event.target.value
          setDraft(nextDraft)
          if (nextDraft === "") return

          const nextValue = Number(nextDraft)
          if (!Number.isFinite(nextValue)) return

          onUpdate(positionPatch(item, field, nextValue / 100) as Partial<T>)
        }}
      />
    </div>
  )
}

function LayerControls({
  onBringForward,
  onSendBackward,
  onDelete,
}: {
  onBringForward: () => void
  onSendBackward: () => void
  onDelete: () => void
}) {
  return (
    <div className="flex gap-2">
      <Button
        type="button"
        variant="outline"
        className="flex-1"
        onClick={onBringForward}
      >
        <ArrowUpIcon />
        Forward
      </Button>
      <Button
        type="button"
        variant="outline"
        className="flex-1"
        onClick={onSendBackward}
      >
        <ArrowDownIcon />
        Back
      </Button>
      <Button
        type="button"
        variant="destructive"
        size="icon"
        onClick={onDelete}
        aria-label="Delete layer"
        title="Delete layer"
      >
        <Trash2Icon />
      </Button>
    </div>
  )
}

// --------------------------------------------------- Shared studio bits -----

const rowTitle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
}

function fillTrack(val: number, min: number, max: number) {
  const p = Math.round(((val - min) / (max - min)) * 100)
  return `linear-gradient(90deg,var(--acc) ${p}%,var(--line2) ${p}%)`
}

function SegRow<T extends string>({
  options,
  value,
  onChange,
  columns,
}: {
  options: { value: T; label: React.ReactNode; title?: string }[]
  value: T
  onChange: (value: T) => void
  columns?: number
}) {
  return (
    <Tabs value={value} onValueChange={(nextValue) => onChange(nextValue as T)}>
      <TabsList
        className="grid h-auto w-full"
        style={{
          gridTemplateColumns: `repeat(${columns ?? options.length},minmax(0,1fr))`,
        }}
      >
        {options.map((option) => (
          <TabsTrigger
            key={option.value}
            value={option.value}
            title={option.title}
            className="h-8 min-w-0"
          >
            {option.label}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  )
}

// Preset swatches + a native colour input for arbitrary hex values (the OS
// picker), styled to sit in the Studio panel.
function ColorField({
  value,
  onChange,
  swatches,
}: {
  value: string
  onChange: (color: string) => void
  swatches: string[]
}) {
  const normalized = value.toLowerCase()
  const known = swatches.some((swatch) => swatch.toLowerCase() === normalized)

  return (
    <div
      style={{
        display: "flex",
        gap: 9,
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      {swatches.map((swatch) => {
        const on = swatch.toLowerCase() === normalized
        return (
          <button
            key={swatch}
            type="button"
            aria-label={`Colour ${swatch}`}
            onClick={() => onChange(swatch)}
            style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              cursor: "pointer",
              background: swatch,
              border: `2px solid ${on ? "var(--acc2)" : "var(--line2)"}`,
              boxShadow: on ? "0 0 0 2px var(--acc-soft)" : "none",
            }}
          />
        )
      })}
      <label
        title="Custom colour"
        style={{
          position: "relative",
          width: 32,
          height: 32,
          borderRadius: 9,
          cursor: "pointer",
          overflow: "hidden",
          display: "grid",
          placeItems: "center",
          background: known ? "var(--panel2)" : value,
          border: `2px solid ${known ? "var(--line2)" : "var(--acc2)"}`,
          boxShadow: known ? "none" : "0 0 0 2px var(--acc-soft)",
          color: known ? "var(--mut)" : "transparent",
        }}
      >
        <PlusIcon size={14} />
        <input
          type="color"
          value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#000000"}
          onChange={(event) => onChange(event.target.value)}
          style={{
            position: "absolute",
            inset: 0,
            opacity: 0,
            cursor: "pointer",
          }}
        />
      </label>
    </div>
  )
}

// ----------------------------------------------------------- Dialogs --------

function PreviewDialog({
  open,
  onOpenChange,
  slides,
  caption,
  format,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  slides: CarouselSlide[]
  caption: string
  format: CarouselFormat
}) {
  const hasCaption = caption.trim().length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin" className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Preview</DialogTitle>
          <DialogDescription>
            {hasCaption
              ? "Review your slides and post caption before exporting."
              : "Review your slides before exporting."}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div
            className={cn(
              "grid gap-4",
              hasCaption && "md:grid-cols-[1fr_280px]"
            )}
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {slides.map((slide) => (
                <div
                  key={slide.id}
                  className="overflow-hidden rounded-md border bg-muted"
                >
                  <StaticSlidePreview slide={slide} format={format} />
                </div>
              ))}
            </div>
            {hasCaption ? (
              <Card size="sm">
                <CardHeader>
                  <CardTitle>Post caption</CardTitle>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="max-h-96">
                    <p className="text-sm whitespace-pre-wrap">{caption}</p>
                  </ScrollArea>
                </CardContent>
              </Card>
            ) : null}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
          >
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ExportDialog({
  open,
  onOpenChange,
  slideCount,
  caption,
  exporting,
  error,
  onUpdateCaption,
  onExport,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  slideCount: number
  caption: string
  exporting: boolean
  error: string | null
  onUpdateCaption: (caption: string) => void
  onExport: () => void
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!exporting) onOpenChange(nextOpen)
      }}
    >
      <DialogContent variant="admin" className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Export Carousel</DialogTitle>
          <DialogDescription>
            Download every slide as a full-size PNG in one ZIP file.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Format</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <p className="text-sm text-muted-foreground">
                {slideCount} PNG {slideCount === 1 ? "slide" : "slides"}, plus
                caption.txt.
              </p>
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Post caption</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <FieldLabel htmlFor="carousel-export-caption">
                  Optional text saved as caption.txt
                </FieldLabel>
                <Textarea
                  id="carousel-export-caption"
                  value={caption}
                  maxLength={2_200}
                  rows={1}
                  disabled={exporting}
                  onChange={(event) => onUpdateCaption(event.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={exporting}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={exporting} onClick={onExport}>
            {exporting ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <DownloadIcon className="size-4" />
            )}
            {exporting ? "Exporting" : "Export slides"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function StaticSlidePreview({
  slide,
  format,
}: {
  slide: CarouselSlide
  format: CarouselFormat
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [width, setWidth] = React.useState(0)

  React.useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new ResizeObserver(() => setWidth(node.clientWidth))
    observer.observe(node)
    setWidth(node.clientWidth)
    return () => observer.disconnect()
  }, [])

  // Scale text by the preview's real pixel width — identical to the 1080px
  // canvas (which uses fontSize * width/1080) so previews match exactly.
  const scale = width / 1080

  return (
    <div
      ref={ref}
      className="relative w-full overflow-hidden"
      style={{
        aspectRatio: String(FORMAT_RATIOS[format]),
        backgroundColor: slide.backgroundColor,
      }}
    >
      {slide.items
        .slice()
        .sort((a, b) => a.zIndex - b.zIndex)
        .map((item) => (
          <div
            key={item.id}
            className="absolute"
            style={{
              left: `${item.x * 100}%`,
              top: `${item.y * 100}%`,
              width: `${item.width * 100}%`,
              height: `${item.height * 100}%`,
              zIndex: item.zIndex,
            }}
          >
            {item.type === "text" ? (
              <CarouselTextLayer item={item} fontSize={item.fontSize * scale} />
            ) : item.type === "image" ? (
              <img
                src={item.url}
                alt={item.altText ?? ""}
                className={cn("h-full w-full", imageFitClass(item.fit))}
              />
            ) : item.type === "gradient-shadow" ? (
              <div
                className="h-full w-full"
                style={{ background: gradientShadowBackground(item) }}
              />
            ) : null}
          </div>
        ))}
    </div>
  )
}

// ------------------------------------------------------ State / model -------

function createInitialBuilderState(document: CarouselDetail): BuilderState {
  const slides = document.slides.length ? document.slides : [createBlankSlide()]
  return {
    slides,
    caption: document.caption,
    format: document.format,
    selectedSlideId: slides[0].id,
    selectedItemId: slides[0].items[0]?.id ?? null,
    past: [],
    future: [],
  }
}

// Exported so the full edit history can be tested without drawing the studio.
// eslint-disable-next-line react-refresh/only-export-components
export function builderReducer(
  state: BuilderState,
  action: BuilderAction
): BuilderState {
  switch (action.type) {
    case "SELECT_SLIDE": {
      const slide = state.slides.find((item) => item.id === action.slideId)
      if (!slide) return state
      return {
        ...state,
        selectedSlideId: slide.id,
        selectedItemId: slide.items[0]?.id ?? null,
      }
    }
    case "SELECT_ITEM":
      return { ...state, selectedItemId: action.itemId }
    case "UPDATE_CAPTION":
      return withHistory(state, { ...state, caption: action.caption })
    case "UPDATE_FORMAT":
      return withHistory(state, { ...state, format: action.format })
    case "UPDATE_SLIDE":
      return withHistory(state, {
        ...state,
        slides: state.slides.map((slide) =>
          slide.id === action.slideId ? { ...slide, ...action.patch } : slide
        ),
      })
    case "UPDATE_ITEM": {
      const next = {
        ...state,
        slides: state.slides.map((slide) =>
          slide.id === action.slideId
            ? {
                ...slide,
                items: slide.items.map((item) =>
                  item.id === action.itemId
                    ? ({ ...item, ...action.patch } as CarouselSlideItem)
                    : item
                ),
              }
            : slide
        ),
      }
      return action.transient ? next : withHistory(state, next)
    }
    case "COMMIT_HISTORY":
      return {
        ...state,
        past: [...state.past.slice(-UNDO_LIMIT + 1), action.before],
        future: [],
      }
    case "ADD_SLIDE": {
      if (state.slides.length >= 20) return state
      const slide = createBlankSlide()
      return withHistory(state, {
        ...state,
        slides: [...state.slides, slide],
        selectedSlideId: slide.id,
        selectedItemId: slide.items[0]?.id ?? null,
      })
    }
    case "DUPLICATE_SLIDE": {
      if (state.slides.length >= 20) return state
      const index = state.slides.findIndex(
        (slide) => slide.id === action.slideId
      )
      if (index === -1) return state
      const duplicate = cloneSlide(state.slides[index])
      const slides = [...state.slides]
      slides.splice(index + 1, 0, duplicate)
      return withHistory(state, {
        ...state,
        slides,
        selectedSlideId: duplicate.id,
        selectedItemId: duplicate.items[0]?.id ?? null,
      })
    }
    case "DELETE_SLIDE": {
      if (state.slides.length <= 1) return state
      const index = state.slides.findIndex(
        (slide) => slide.id === action.slideId
      )
      if (index === -1) return state
      const slides = state.slides.filter((slide) => slide.id !== action.slideId)
      const selectedSlide =
        state.selectedSlideId === action.slideId
          ? slides[Math.max(0, index - 1)]
          : (slides.find((slide) => slide.id === state.selectedSlideId) ??
            slides[0])
      return withHistory(state, {
        ...state,
        slides,
        selectedSlideId: selectedSlide.id,
        selectedItemId: selectedSlide.items[0]?.id ?? null,
      })
    }
    case "ADD_ITEM": {
      const slide = state.slides.find((item) => item.id === action.slideId)
      if (!slide || slide.items.length >= CAROUSEL_ITEM_MAX) return state
      return withHistory(state, {
        ...state,
        selectedItemId: action.item.id,
        slides: state.slides.map((slide) =>
          slide.id === action.slideId
            ? { ...slide, items: [...slide.items, action.item] }
            : slide
        ),
      })
    }
    case "DELETE_ITEM":
      return withHistory(state, {
        ...state,
        selectedItemId:
          state.selectedItemId === action.itemId ? null : state.selectedItemId,
        slides: state.slides.map((slide) =>
          slide.id === action.slideId
            ? {
                ...slide,
                items: slide.items.filter((item) => item.id !== action.itemId),
              }
            : slide
        ),
      })
    case "MOVE_LAYER":
      return withHistory(state, {
        ...state,
        slides: state.slides.map((slide) =>
          slide.id === action.slideId
            ? moveLayer(slide, action.itemId, action.direction)
            : slide
        ),
      })
    case "RESET_DEFAULTS":
      return withHistory(state, {
        ...state,
        slides: resetSlidesToDefaults(state.slides, state.selectedSlideId),
      })
    case "UNDO": {
      const previous = state.past[state.past.length - 1]
      if (!previous) return state
      return {
        ...state,
        ...previous,
        past: state.past.slice(0, -1),
        future: [currentSnapshot(state), ...state.future],
        selectedSlideId: previous.slides[0]?.id ?? state.selectedSlideId,
        selectedItemId: null,
      }
    }
    case "REDO": {
      const next = state.future[0]
      if (!next) return state
      return {
        ...state,
        ...next,
        past: [...state.past, currentSnapshot(state)],
        future: state.future.slice(1),
        selectedSlideId: next.slides[0]?.id ?? state.selectedSlideId,
        selectedItemId: null,
      }
    }
  }
}

function withHistory(state: BuilderState, next: BuilderState): BuilderState {
  return {
    ...next,
    past: [...state.past.slice(-UNDO_LIMIT + 1), currentSnapshot(state)],
    future: [],
  }
}

function currentSnapshot(
  state: Pick<BuilderState, "slides" | "caption" | "format">
) {
  return {
    slides: state.slides,
    caption: state.caption,
    format: state.format,
  }
}

function createBlankSlide(): CarouselSlide {
  return {
    id: builderId(),
    title: "New slide",
    backgroundColor: DEFAULT_BACKGROUND,
    items: [createTextItem()],
  }
}

function resetSlidesToDefaults(
  slides: CarouselSlide[],
  selectedSlideId: string
): CarouselSlide[] {
  return slides.map((slide, slideIndex) => {
    if (slide.id !== selectedSlideId) return slide

    let textIndex = 0
    const firstMediaItem = slide.items.find(isMediaItem)
    const defaultMediaItem = firstMediaItem
      ? resetMediaItemDefaults(firstMediaItem)
      : null

    return {
      ...slide,
      backgroundColor:
        slideIndex === 0 ? DEFAULT_FIRST_SLIDE_BACKGROUND : DEFAULT_BACKGROUND,
      items: slide.items.map((item) => {
        if (item.type === "text") {
          const resetItem = resetTextItemDefaults(item, slideIndex, textIndex)
          textIndex += 1
          return resetItem
        }

        if (isMediaItem(item)) {
          return resetMediaItemDefaults(item)
        }

        if (item.type === "gradient-shadow") {
          return resetGradientShadowItemDefaults(item, defaultMediaItem)
        }

        return item
      }),
    }
  })
}

function resetTextItemDefaults(
  item: CarouselTextItem,
  slideIndex: number,
  textIndex: number
): CarouselTextItem {
  if (textIndex === 0) {
    return {
      ...item,
      x: 0.1,
      y: DEFAULT_TITLE_TEXT_Y,
      width: 0.8,
      height: DEFAULT_TITLE_TEXT_HEIGHT,
      zIndex: DEFAULT_TEXT_Z_INDEX,
      fontId: DEFAULT_TEXT_FONT_ID,
      fontSize: slideIndex === 0 ? 76 : 58,
      color: slideIndex === 0 ? "#ffffff" : "#111827",
      align: "left",
    }
  }

  if (textIndex === 1) {
    return {
      ...item,
      x: 0.1,
      y: DEFAULT_BODY_TEXT_Y,
      width: 0.8,
      height: DEFAULT_BODY_TEXT_HEIGHT,
      zIndex: DEFAULT_TEXT_Z_INDEX + 1,
      fontId: DEFAULT_TEXT_FONT_ID,
      fontSize: slideIndex === 0 ? 38 : 40,
      color: slideIndex === 0 ? "#e5e7eb" : "#374151",
      align: "left",
    }
  }

  return {
    ...item,
    x: 0.12,
    y: DEFAULT_EXTRA_TEXT_Y,
    width: 0.76,
    height: 0.2,
    zIndex: DEFAULT_TEXT_Z_INDEX + textIndex,
    fontId: DEFAULT_TEXT_FONT_ID,
    fontSize: 56,
    color: "#111827",
    align: "left",
  }
}

function resetMediaItemDefaults(item: CarouselMediaItem): CarouselMediaItem {
  return {
    ...item,
    x: 0,
    y: 0,
    width: 1,
    height: 1,
    zIndex: DEFAULT_IMAGE_Z_INDEX,
    fit: "fill",
  }
}

function resetGradientShadowItemDefaults(
  item: CarouselGradientShadowItem,
  reference: CarouselMediaItem | null
): CarouselGradientShadowItem {
  const defaults = createGradientShadowItem(reference)
  return {
    ...item,
    x: defaults.x,
    y: defaults.y,
    width: defaults.width,
    height: defaults.height,
    zIndex: DEFAULT_GRADIENT_SHADOW_Z_INDEX,
    color: DEFAULT_GRADIENT_SHADOW_COLOR,
    opacity: DEFAULT_GRADIENT_SHADOW_OPACITY,
    direction: item.direction ?? "up",
  }
}

function imageFitPatch(value: CarouselMediaFit): Partial<CarouselMediaItem> {
  if (value === "fill") {
    return {
      fit: "fill",
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    }
  }

  return { fit: value }
}

function imageFitClass(fit: CarouselMediaFit) {
  return fit === "contain" ? "object-contain" : "object-cover"
}

function createTextItem(): CarouselTextItem {
  return {
    id: builderId(),
    type: "text",
    text: "New text",
    x: 0.12,
    y: DEFAULT_EXTRA_TEXT_Y,
    width: 0.76,
    height: 0.2,
    zIndex: DEFAULT_TEXT_Z_INDEX,
    fontId: DEFAULT_TEXT_FONT_ID,
    fontSize: 56,
    color: "#111827",
    align: "left",
  }
}

function createTextPresetItem(
  preset: (typeof TEXT_PRESETS)[number]
): CarouselTextItem {
  return {
    id: builderId(),
    type: "text",
    text: preset.label,
    x: 0.1,
    y: preset.y,
    width: 0.8,
    height: preset.height,
    zIndex: DEFAULT_TEXT_Z_INDEX,
    fontId: preset.fontId,
    fontSize: preset.fontSize,
    color: "#111827",
    align: preset.align,
  }
}

function createImageItem(
  url: string,
  altText: string | undefined,
  mediaId: string,
  box?: { x: number; y: number; width: number; height: number }
): CarouselMediaItem {
  // Placed as a centred, medium image (not full-bleed) so it doesn't blanket
  // the slide's text. `box` (from the image's natural aspect) keeps portrait
  // images portrait; without it, fall back to a centred landscape box. Use the
  // Fit → Fill control to make it a full-bleed background.
  const placement = box ?? { x: 0.15, y: 0.275, width: 0.7, height: 0.45 }
  return {
    id: builderId(),
    type: "image",
    mediaId,
    url,
    altText,
    x: placement.x,
    y: placement.y,
    width: placement.width,
    height: placement.height,
    zIndex: DEFAULT_IMAGE_Z_INDEX,
    fit: "cover",
  }
}

// A centred box whose pixel aspect matches the image, so it isn't
// stretched/cropped (portrait stays portrait). Capped so it never blankets the
// slide's text.
function fitImageBox(
  naturalWidth: number,
  naturalHeight: number,
  format: CarouselFormat
): { x: number; y: number; width: number; height: number } {
  const formatRatio = FORMAT_RATIOS[format]
  const aspect = naturalWidth / naturalHeight
  const MAX = 0.72
  let width = MAX
  let height = (width * formatRatio) / aspect
  if (height > MAX) {
    height = MAX
    width = (height * aspect) / formatRatio
  }
  // Extreme aspect ratios (panoramas / tall strips) can drive a dimension below
  // the schema's 0.05 minimum, which would make autosave reject the slide.
  // Clamp so it still validates — the image just gets a min-size edge.
  width = Math.max(MIN_ITEM_SIZE, width)
  height = Math.max(MIN_ITEM_SIZE, height)
  return { x: (1 - width) / 2, y: (1 - height) / 2, width, height }
}

function createShadowPresetItem(
  preset: (typeof SHADOW_PRESETS)[number],
  color: string,
  opacity: number
): CarouselGradientShadowItem {
  const [x, y, width, height] = preset.box
  return {
    id: builderId(),
    type: "gradient-shadow",
    x,
    y,
    width,
    height,
    zIndex: DEFAULT_GRADIENT_SHADOW_Z_INDEX,
    color,
    opacity,
    direction: preset.direction,
  }
}

function createGradientShadowItem(
  reference: CarouselSlideItem | null
): CarouselGradientShadowItem {
  if (reference?.type === "image") {
    const height = clampSize(
      reference.height * DEFAULT_GRADIENT_SHADOW_HEIGHT,
      reference.height
    )
    return {
      id: builderId(),
      type: "gradient-shadow",
      x: reference.x,
      y: clamp01(reference.y + reference.height - height, 1 - height),
      width: reference.width,
      height,
      zIndex: DEFAULT_GRADIENT_SHADOW_Z_INDEX,
      color: DEFAULT_GRADIENT_SHADOW_COLOR,
      opacity: DEFAULT_GRADIENT_SHADOW_OPACITY,
    }
  }

  return {
    id: builderId(),
    type: "gradient-shadow",
    x: 0,
    y: 1 - DEFAULT_GRADIENT_SHADOW_HEIGHT,
    width: 1,
    height: DEFAULT_GRADIENT_SHADOW_HEIGHT,
    zIndex: DEFAULT_GRADIENT_SHADOW_Z_INDEX,
    color: DEFAULT_GRADIENT_SHADOW_COLOR,
    opacity: DEFAULT_GRADIENT_SHADOW_OPACITY,
  }
}

function cloneSlide(slide: CarouselSlide): CarouselSlide {
  return {
    ...slide,
    id: builderId(),
    title: `${slide.title} copy`.slice(0, 120),
    items: slide.items.map((item) => ({ ...item, id: builderId() })),
  }
}

function moveLayer(
  slide: CarouselSlide,
  itemId: string,
  direction: 1 | -1
): CarouselSlide {
  const item = slide.items.find((candidate) => candidate.id === itemId)
  if (!item) return slide
  return {
    ...slide,
    items: slide.items.map((candidate) =>
      candidate.id === itemId
        ? {
            ...candidate,
            zIndex: Math.max(0, Math.min(999, candidate.zIndex + direction)),
          }
        : candidate
    ),
  }
}

function isMediaItem(item: CarouselSlideItem): item is CarouselMediaItem {
  return item.type === "image" || item.type === "video"
}

function clamp01(value: number, max = 1) {
  return Math.min(Math.max(0, value), Math.max(0, max))
}

function clampSize(value: number, max = 1) {
  return Math.min(Math.max(MIN_ITEM_SIZE, max), Math.max(MIN_ITEM_SIZE, value))
}

function gradientShadowBackground(item: CarouselGradientShadowItem) {
  const strong = hexToRgba(item.color, item.opacity / 100)
  const clear = hexToRgba(item.color, 0)
  switch (item.direction ?? "up") {
    case "down":
      return `linear-gradient(to bottom, ${strong} 0%, ${clear} 100%)`
    case "left":
      return `linear-gradient(to left, ${strong} 0%, ${clear} 100%)`
    case "right":
      return `linear-gradient(to right, ${strong} 0%, ${clear} 100%)`
    case "radial":
      return `radial-gradient(circle at 50% 50%, ${clear} 0%, ${strong} 100%)`
    case "solid":
      return strong
    case "up":
    default:
      return `linear-gradient(to top, ${strong} 0%, ${clear} 100%)`
  }
}

// Mini gradient used on the Shadow panel preset cards (fixed black tint).
function shadowPreviewCss(direction: CarouselShadowDirection) {
  const strong = "rgba(0,0,0,.82)"
  const clear = "rgba(0,0,0,0)"
  switch (direction) {
    case "down":
      return `linear-gradient(to bottom, ${strong}, ${clear} 65%)`
    case "left":
      return `linear-gradient(to left, ${strong}, ${clear} 65%)`
    case "right":
      return `linear-gradient(to right, ${strong}, ${clear} 65%)`
    case "radial":
      return `radial-gradient(80% 80% at 50% 50%, ${clear} 40%, ${strong})`
    case "solid":
      return "rgba(0,0,0,.45)"
    case "up":
    default:
      return `linear-gradient(to top, ${strong}, ${clear} 65%)`
  }
}

function hexToRgba(hex: string, alpha: number) {
  const color = hex.replace("#", "")
  const red = Number.parseInt(color.slice(0, 2), 16)
  const green = Number.parseInt(color.slice(2, 4), 16)
  const blue = Number.parseInt(color.slice(4, 6), 16)

  return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

function isTextEntryTarget(target: EventTarget | null) {
  if (!(target instanceof Element)) return false
  if (target instanceof HTMLElement && target.isContentEditable) return true

  return (
    target.closest(
      "input, textarea, select, [contenteditable='true'], [contenteditable='plaintext-only']"
    ) !== null
  )
}

type PositionKey = "x" | "y" | "width" | "height"

function positionPatch(
  item: CarouselSlideItem,
  key: PositionKey,
  value: number
) {
  const normalized = Number.isFinite(value) ? value : 0
  if (key === "x") return { x: clamp01(normalized, 1 - item.width) }
  if (key === "y") return { y: clamp01(normalized, 1 - item.height) }
  if (key === "width") return { width: clampSize(normalized, 1 - item.x) }
  return { height: clampSize(normalized, 1 - item.y) }
}

function builderId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
}
