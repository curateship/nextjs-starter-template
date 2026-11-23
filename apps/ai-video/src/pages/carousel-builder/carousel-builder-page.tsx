import * as React from "react"
import { Link } from "@tanstack/react-router"
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
  FileArchiveIcon,
  FilmIcon,
  ImageIcon,
  LayersIcon,
  LayoutGridIcon,
  ListIcon,
  Loader2Icon,
  Maximize2Icon,
  MinusIcon,
  PlusIcon,
  Redo2Icon,
  ReplaceIcon,
  RotateCcwIcon,
  SearchIcon,
  Trash2Icon,
  TypeIcon,
  Undo2Icon,
  UploadIcon,
} from "lucide-react"

import { MediaPicker } from "@/components/media-picker"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Textarea } from "@/components/ui/textarea"
import {
  getCarouselErrorMessage,
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
} from "@/lib/api/carousels"
import {
  getMediaErrorMessage,
  listMedia,
  uploadMedia,
  type MediaItem,
} from "@/lib/api/media"
import type { CarouselShadowDirection } from "@/lib/carousel-schema"
import {
  DEFAULT_TEXT_FONT_ID,
  getTextFont,
  TEXT_FONTS,
  type TextFontId,
} from "@/lib/text-fonts"
import { cn } from "@/lib/utils"
import {
  canExportCarouselMp4,
  exportCarouselMp4,
  exportCarouselZip,
  type CarouselVideoExportProgress,
} from "@/pages/carousel-builder/carousel-export"
import "@/pages/video-editor/studio/studio.css"
import "@/pages/carousel-builder/carousel-studio.css"

type Snapshot = {
  slides: CarouselSlide[]
  caption: string
  format: CarouselFormat
}

type BuilderState = Snapshot & {
  selectedSlideId: string
  selectedItemId: string | null
  past: Snapshot[]
  future: Snapshot[]
}

type BuilderAction =
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

const PANEL_MIN = 220
const PANEL_MAX = 420
const INSPECTOR_MIN = 260
const INSPECTOR_MAX = 460
const ZOOM_MIN = 0.1
const ZOOM_MAX = 4
const ZOOM_FACTOR = 1.2
const DEFAULT_ZOOM = 0.74

const FORMAT_LABELS: Record<CarouselFormat, string> = {
  "4:5": "Portrait 4:5",
  "1:1": "Square 1:1",
  "9:16": "Story 9:16",
}

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
  { label: "Headline", fontId: "anton", fontSize: 96, align: "left", y: 0.12, height: 0.2, preview: { fontFamily: "'Anton'", fontSize: 19 } },
  { label: "Title", fontId: "inter", fontSize: 68, align: "left", y: 0.3, height: 0.16, preview: { fontWeight: 800, fontSize: 16 } },
  { label: "Subheading", fontId: "inter", fontSize: 46, align: "left", y: 0.5, height: 0.12, preview: { fontWeight: 600, fontSize: 14 } },
  { label: "Body copy", fontId: "inter", fontSize: 32, align: "left", y: 0.64, height: 0.18, preview: { fontWeight: 500, fontSize: 13, color: "var(--ink2)" } },
  { label: "Pull quote", fontId: "playfair-display", fontSize: 52, align: "center", y: 0.4, height: 0.2, preview: { fontFamily: "'Playfair Display'", fontStyle: "italic", fontSize: 16 } },
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

const TEXT_SWATCHES = ["#ffffff", "#111827", "#ffe27a", "#4f46e5", "#ff5a5a", "#10b981"]
const BACKGROUND_SWATCHES = ["#ffffff", "#f8fafc", "#111827", "#0f172a", "#4f46e5", "#f97316"]
const SHADOW_SWATCHES = ["#000000", "#ffffff", "#111827", "#1e3a8a"]

type SaveStatus = "saved" | "saving" | "error"
type CarouselExportMode = "zip" | "mp4"

export function CarouselBuilderPage({
  document,
}: {
  document: CarouselDetail
}) {
  const [state, dispatch] = React.useReducer(
    builderReducer,
    document,
    createInitialBuilderState
  )
  const [panel, setPanel] = React.useState<StudioPanel>("slides")
  const [panelW, setPanelW] = React.useState(272)
  const [inspectorW, setInspectorW] = React.useState(292)
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("saved")
  const [statusError, setStatusError] = React.useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = React.useState(false)
  const [exportOpen, setExportOpen] = React.useState(false)
  const [mediaOpen, setMediaOpen] = React.useState(false)
  const [exporting, setExporting] = React.useState(false)
  const [exportError, setExportError] = React.useState<string | null>(null)
  const [exportProgress, setExportProgress] =
    React.useState<CarouselVideoExportProgress | null>(null)
  const hydratedRef = React.useRef(false)
  const pendingRef = React.useRef<Snapshot | null>(null)

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
      await saveCarousel(document.id, {
        caption: next.caption,
        format: next.format,
        slides: next.slides,
      })
    },
    [document.id]
  )

  React.useEffect(() => {
    if (!hydratedRef.current) {
      hydratedRef.current = true
      return
    }

    pendingRef.current = snapshot
    const timer = setTimeout(() => {
      pendingRef.current = null
      setSaveStatus("saving")
      setStatusError(null)
      persist(snapshot)
        .then(() => setSaveStatus("saved"))
        .catch((error) => {
          setSaveStatus("error")
          setStatusError(getCarouselErrorMessage(error))
          pendingRef.current ??= snapshot
        })
    }, AUTOSAVE_DEBOUNCE_MS)

    return () => clearTimeout(timer)
  }, [persist, snapshot])

  React.useEffect(() => {
    return () => {
      const pending = pendingRef.current
      if (pending) void persist(pending).catch(() => undefined)
    }
  }, [persist])

  async function flushSave() {
    const pending = pendingRef.current
    if (!pending) return
    pendingRef.current = null
    setSaveStatus("saving")
    setStatusError(null)
    try {
      await persist(pending)
      setSaveStatus("saved")
    } catch (error) {
      setSaveStatus("error")
      setStatusError(getCarouselErrorMessage(error))
      pendingRef.current ??= pending
      throw error
    }
  }

  async function handleExport(
    mode: CarouselExportMode,
    options: { secondsPerSlide: number }
  ) {
    setExporting(true)
    setExportError(null)
    setExportProgress(null)
    try {
      await flushSave()
      if (mode === "zip") {
        await exportCarouselZip({
          name: document.name,
          slides: state.slides,
          caption: state.caption,
          format: state.format,
        })
      } else {
        await exportCarouselMp4({
          name: document.name,
          slides: state.slides,
          format: state.format,
          secondsPerSlide: options.secondsPerSlide,
          onProgress: setExportProgress,
        })
      }
      setExportOpen(false)
    } catch (error) {
      setExportError(
        error instanceof Error ? error.message : "Carousel export failed."
      )
    } finally {
      setExporting(false)
      setExportProgress(null)
    }
  }

  function addItem(item: CarouselSlideItem) {
    if (!selectedSlideId) return
    dispatch({ type: "ADD_ITEM", slideId: selectedSlideId, item })
  }

  function handleSelectMedia(url: string, altText?: string, media?: MediaItem) {
    if (!selectedSlide || selectedItem?.type !== "image") return
    dispatch({
      type: "UPDATE_ITEM",
      slideId: selectedSlide.id,
      itemId: selectedItem.id,
      patch: { url, altText, mediaId: media?.id },
    })
  }

  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.key !== "Backspace") return
      if (event.altKey || event.ctrlKey || event.metaKey) return
      if (previewOpen || exportOpen || mediaOpen) return
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
  }, [exportOpen, mediaOpen, previewOpen, selectedSlideId, state.selectedItemId])

  function startResize(
    kind: "panel" | "inspector"
  ): (event: React.PointerEvent) => void {
    return (event) => {
      event.preventDefault()
      event.stopPropagation()
      const startX = event.clientX
      const startVal = kind === "panel" ? panelW : inspectorW
      const [min, max] =
        kind === "panel" ? [PANEL_MIN, PANEL_MAX] : [INSPECTOR_MIN, INSPECTOR_MAX]
      // The inspector's leading edge is on its left, so it grows opposite the
      // pointer delta.
      const sign = kind === "panel" ? 1 : -1
      const setter = kind === "panel" ? setPanelW : setInspectorW
      const onMove = (ev: PointerEvent) => {
        const delta = (ev.clientX - startX) * sign
        setter(Math.max(min, Math.min(max, startVal + delta)))
      }
      const onUp = () => {
        window.removeEventListener("pointermove", onMove)
        window.removeEventListener("pointerup", onUp)
        window.document.body.style.cursor = ""
        window.document.body.style.userSelect = ""
      }
      window.addEventListener("pointermove", onMove)
      window.addEventListener("pointerup", onUp)
      window.document.body.style.cursor = "col-resize"
      window.document.body.style.userSelect = "none"
    }
  }

  const slideIndex = state.slides.findIndex((s) => s.id === selectedSlideId)

  return (
    <div
      className="studio-root carousel-studio"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        width: "100%",
        overflow: "hidden",
      }}
    >
      <TopBar
        name={document.name}
        canUndo={state.past.length > 0}
        canRedo={state.future.length > 0}
        onUndo={() => dispatch({ type: "UNDO" })}
        onRedo={() => dispatch({ type: "REDO" })}
        onReset={() => dispatch({ type: "RESET_DEFAULTS" })}
        onPreview={() => setPreviewOpen(true)}
        onExport={() => {
          setExportError(null)
          setExportProgress(null)
          setExportOpen(true)
        }}
      />

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <IconRail panel={panel} onSelect={setPanel} />

        <aside
          style={{
            width: panelW,
            flex: "none",
            position: "relative",
            background: "var(--panel)",
            borderRight: "1px solid var(--line)",
            minHeight: 0,
          }}
        >
          <CarouselContextPanel
            panel={panel}
            slides={state.slides}
            format={state.format}
            selectedSlideId={state.selectedSlideId}
            onSelectSlide={(slideId) => dispatch({ type: "SELECT_SLIDE", slideId })}
            onAddSlide={() => dispatch({ type: "ADD_SLIDE" })}
            onDuplicateSlide={(slideId) =>
              dispatch({ type: "DUPLICATE_SLIDE", slideId })
            }
            onDeleteSlide={(slideId) =>
              dispatch({ type: "DELETE_SLIDE", slideId })
            }
            onAddItem={addItem}
          />
          <ResizeHandle side="right" onPointerDown={startResize("panel")} />
        </aside>

        {selectedSlide ? (
          <CanvasStage
            slide={selectedSlide}
            slides={state.slides}
            slideIndex={slideIndex}
            format={state.format}
            selectedItemId={state.selectedItemId}
            onSelectItem={(itemId) => dispatch({ type: "SELECT_ITEM", itemId })}
            onSelectSlide={(slideId) => dispatch({ type: "SELECT_SLIDE", slideId })}
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
        ) : (
          <div style={{ flex: 1 }} />
        )}

        <aside
          style={{
            width: inspectorW,
            flex: "none",
            position: "relative",
            minHeight: 0,
          }}
        >
          <ResizeHandle side="left" onPointerDown={startResize("inspector")} />
          {selectedSlide ? (
            <CarouselInspector
              slide={selectedSlide}
              selectedItem={selectedItem}
              format={state.format}
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
              onReplaceImage={() => setMediaOpen(true)}
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
        </aside>
      </div>

      <StatusBar
        format={state.format}
        slideCount={state.slides.length}
        saveStatus={saveStatus}
        statusError={statusError}
      />

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
        progress={exportProgress}
        onUpdateCaption={(caption) =>
          dispatch({ type: "UPDATE_CAPTION", caption })
        }
        onExport={handleExport}
      />
      <MediaPicker
        open={mediaOpen}
        onOpenChange={setMediaOpen}
        showVideos={false}
        currentMediaUrl={
          selectedItem?.type === "image" ? selectedItem.url : undefined
        }
        onSelectMedia={handleSelectMedia}
      />
    </div>
  )
}

// ------------------------------------------------------------- Top bar ------

function TopBar({
  name,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onReset,
  onPreview,
  onExport,
}: {
  name: string
  canUndo: boolean
  canRedo: boolean
  onUndo: () => void
  onRedo: () => void
  onReset: () => void
  onPreview: () => void
  onExport: () => void
}) {
  return (
    <header
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        height: 56,
        padding: "0 16px",
        background: "var(--panel)",
        borderBottom: "1px solid var(--line)",
        flex: "none",
        zIndex: 40,
      }}
    >
      <Link
        to="/admin/carousels"
        aria-label="Back to carousels"
        className="st-hovbright"
        style={{
          display: "grid",
          placeItems: "center",
          height: 30,
          width: 30,
          borderRadius: 9,
          background: "var(--ink)",
          color: "var(--paper)",
          flex: "none",
        }}
      >
        <ArrowLeftIcon size={17} />
      </Link>
      <span
        style={{
          fontWeight: 600,
          fontSize: 14,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
          maxWidth: 320,
        }}
        title={name}
      >
        {name}
      </span>

      <div style={{ flex: 1 }} />

      <TopIconButton label="Undo" disabled={!canUndo} onClick={onUndo}>
        <Undo2Icon size={16} />
      </TopIconButton>
      <TopIconButton label="Redo" disabled={!canRedo} onClick={onRedo}>
        <Redo2Icon size={16} />
      </TopIconButton>
      <TopIconButton label="Reset slide to defaults" onClick={onReset}>
        <RotateCcwIcon size={16} />
      </TopIconButton>
      <div style={{ width: 1, height: 20, background: "var(--line)" }} />
      <button type="button" className="st-hovbg" onClick={onPreview} style={secondaryTopBtn}>
        <EyeIcon size={15} />
        Preview
      </button>
      <button type="button" className="st-hovbright" onClick={onExport} style={primaryTopBtn}>
        <DownloadIcon size={15} />
        Export
      </button>
    </header>
  )
}

function TopIconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled?: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      className={disabled ? undefined : "st-hovbg"}
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      style={{
        height: 32,
        width: 32,
        display: "grid",
        placeItems: "center",
        border: "none",
        background: "transparent",
        borderRadius: 9,
        color: "var(--ink2)",
        cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {children}
    </button>
  )
}

const secondaryTopBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  height: 32,
  padding: "0 13px",
  background: "transparent",
  border: "1px solid var(--line2)",
  borderRadius: 9,
  color: "var(--ink)",
  fontSize: 12.5,
  fontWeight: 500,
  cursor: "pointer",
}

const primaryTopBtn: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 7,
  height: 32,
  padding: "0 17px",
  background: "var(--ink)",
  border: "none",
  borderRadius: 9,
  color: "var(--paper)",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
  boxShadow: "var(--sh-sm)",
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
      style={{
        width: 72,
        flex: "none",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 4,
        padding: "12px 0",
        background: "var(--panel)",
        borderRight: "1px solid var(--line)",
        zIndex: 20,
      }}
    >
      {RAIL.map(({ id, label, Icon }) => {
        const on = panel === id
        return (
          <button
            key={id}
            type="button"
            onClick={() => onSelect(id)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 5,
              width: 56,
              padding: "9px 0",
              border: "none",
              borderRadius: 13,
              cursor: "pointer",
              background: on ? "var(--elev2)" : "transparent",
              color: on ? "var(--ink)" : "var(--ink2)",
            }}
          >
            <Icon size={20} />
            <span style={{ fontSize: 9.5, fontWeight: 600 }}>{label}</span>
          </button>
        )
      })}
    </nav>
  )
}

function ResizeHandle({
  side,
  onPointerDown,
}: {
  side: "left" | "right"
  onPointerDown: (event: React.PointerEvent) => void
}) {
  return (
    <div
      className="st-resize"
      onPointerDown={onPointerDown}
      title="Drag to resize"
      style={{
        position: "absolute",
        top: 0,
        bottom: 0,
        width: 9,
        zIndex: 25,
        cursor: "col-resize",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        [side]: -4,
      }}
    >
      <span
        className="st-grip"
        style={{
          width: 3,
          height: 34,
          borderRadius: 3,
          background: "var(--line2)",
          transition: "background .13s",
        }}
      />
    </div>
  )
}

// --------------------------------------------------------- Context panel ----

function CarouselContextPanel({
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
  const title = RAIL.find((item) => item.id === panel)?.label ?? ""

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: "16px 16px 12px",
          flex: "none",
        }}
      >
        <div
          style={{
            fontFamily: "'Bebas Neue'",
            fontSize: 22,
            letterSpacing: ".02em",
            lineHeight: 1,
          }}
        >
          {title}
        </div>
        {panel === "slides" ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, flex: "none" }}>
            <span style={{ fontSize: 11, color: "var(--mut)", whiteSpace: "nowrap" }}>
              {slides.length} slides
            </span>
            <SlidesViewToggle view={slidesView} onChange={setSlidesView} />
          </div>
        ) : null}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 16px 18px" }}>
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
          <ImagePanelBody format={format} onAddItem={onAddItem} />
        ) : (
          <ShadowPanelBody onAddItem={onAddItem} />
        )}
      </div>
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
    <div style={{ display: "flex", gap: 2, padding: 3, background: "var(--elev)", borderRadius: 9 }}>
      {(
        [
          ["list", ListIcon, "List view"],
          ["grid", LayoutGridIcon, "Thumbnail view"],
        ] as const
      ).map(([id, Icon, label]) => {
        const on = view === id
        return (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            aria-label={label}
            aria-pressed={on}
            title={label}
            style={{
              height: 24,
              width: 28,
              display: "grid",
              placeItems: "center",
              border: "none",
              borderRadius: 7,
              cursor: "pointer",
              background: on ? "var(--panel)" : "transparent",
              color: on ? "var(--ink)" : "var(--ink2)",
              boxShadow: on ? "var(--sh-sm)" : "none",
            }}
          >
            <Icon size={14} />
          </button>
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
    <button
      type="button"
      className="st-hovcard"
      onClick={onAddSlide}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 7,
        height: 44,
        width: "100%",
        border: "1.5px dashed var(--line2)",
        borderRadius: 12,
        background: "var(--panel2)",
        color: "var(--ink2)",
        fontSize: 12.5,
        fontWeight: 600,
        cursor: "pointer",
        marginTop: 10,
      }}
    >
      <PlusIcon size={15} />
      Add slide
    </button>
  )

  return (
    <div>
      {view === "list" ? (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 9 }}>
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
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 10 }}>
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
    <div className="cb-slide-card" style={{ position: "relative" }}>
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
      <div className="cb-slide-actions" style={{ position: "absolute", top: 5, right: 5, display: "flex", gap: 3 }}>
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
          style={{ ...gridCardIconBtn, opacity: canDelete ? 1 : 0.4, cursor: canDelete ? "pointer" : "default" }}
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
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 9, marginBottom: 20 }}>
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
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
        {TEXT_FONTS.map((font) => (
          <button
            key={font.id}
            type="button"
            className="st-hovcard"
            onClick={() =>
              onAddItem({ ...createTextItem(), fontId: font.id, text: font.label })
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
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 9 }}>
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
  format,
  onAddItem,
}: {
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
    listMedia({
      pageSize: 30,
      fileTypes: ["image"],
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
  }, [debounced, refresh])

  async function handleUpload(files: FileList | null) {
    if (!files?.length) return
    setUploading(true)
    setError(null)
    try {
      for (const file of Array.from(files)) {
        await uploadMedia(file, undefined, {})
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
        <div style={{ display: "grid", placeItems: "center", marginBottom: 6, color: "var(--mut)" }}>
          <UploadIcon size={22} />
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 600 }}>
          {uploading ? "Uploading…" : "Drop or import media"}
        </div>
        <div style={{ fontSize: 11, color: "var(--mut)", marginTop: 2 }}>PNG · JPG · WEBP</div>
      </div>

      {error ? (
        <div style={{ fontSize: 11.5, color: "var(--coral)", marginBottom: 12 }}>{error}</div>
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
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginBottom: 18 }}>
        {SHADOW_PRESETS.map((preset) => (
          <button
            key={preset.label}
            type="button"
            className="st-hovlift"
            onClick={() => onAddItem(createShadowPresetItem(preset, color, opacity))}
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
            <div style={{ height: 62, position: "relative", background: "#3a5675" }}>
              <div style={{ position: "absolute", inset: 0, background: shadowPreviewCss(preset.direction) }} />
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, padding: "7px 9px" }}>{preset.label}</div>
          </button>
        ))}
      </div>

      <StudioLabel>Tint</StudioLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 18 }}>
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

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
        <span className="st-lbl">Opacity</span>
        <span style={{ fontSize: 11.5, color: "var(--ink2)", fontVariantNumeric: "tabular-nums" }}>
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

      <div style={{ fontSize: 11, color: "var(--mut)", lineHeight: 1.5, marginTop: 14 }}>
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
                onPointerDown={(event) => handlePointerDown(event, item, "move")}
                onResizeDown={(event) => handlePointerDown(event, item, "resize")}
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
            fontFamily: "'Bebas Neue'",
            fontSize: 15,
            letterSpacing: ".04em",
            color: "var(--mut)",
            flex: "none",
          }}
        >
          SLIDE {String(slideIndex + 1).padStart(2, "0")}
        </span>
        <span style={{ height: 4, width: 4, borderRadius: "50%", background: "var(--line2)", flex: "none" }} />
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
        style={{ ...zoomIconBtn, opacity: canZoomOut ? 1 : 0.35, cursor: canZoomOut ? "pointer" : "default" }}
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
        style={{ ...zoomIconBtn, opacity: canZoomIn ? 1 : 0.35, cursor: canZoomIn ? "pointer" : "default" }}
      >
        <PlusIcon size={15} />
      </button>
      <div style={{ width: 1, height: 18, background: "var(--line)", margin: "0 4px" }} />
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
        style={{ ...pagerArrow, opacity: current <= 0 ? 0.35 : 1, cursor: current <= 0 ? "default" : "pointer" }}
      >
        <ChevronLeftIcon size={16} />
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 7, padding: "0 6px" }}>
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
        {current + 1} <span style={{ color: "var(--mut)" }}>/ {slides.length}</span>
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
  const font = getTextFont(item.fontId)

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
  onUpdateFormat,
  onUpdateSlide,
  onUpdateItem,
  onReplaceImage,
  onDeleteItem,
  onMoveLayer,
}: {
  slide: CarouselSlide
  selectedItem: CarouselSlideItem | null
  format: CarouselFormat
  onUpdateFormat: (format: CarouselFormat) => void
  onUpdateSlide: (patch: Partial<CarouselSlide>) => void
  onUpdateItem: (itemId: string, patch: Partial<CarouselSlideItem>) => void
  onReplaceImage: () => void
  onDeleteItem: (itemId: string) => void
  onMoveLayer: (itemId: string, direction: 1 | -1) => void
}) {
  const title = getInspectorTitle(selectedItem)
  const badge = getInspectorBadge(selectedItem)

  return (
    <aside
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--panel)",
        borderLeft: "1px solid var(--line)",
        minHeight: 0,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "16px 16px 12px",
          borderBottom: "1px solid var(--line)",
          flex: "none",
        }}
      >
        <div style={{ fontFamily: "'Bebas Neue'", fontSize: 22, letterSpacing: ".02em", lineHeight: 1 }}>
          {title}
        </div>
        {badge ? (
          <span
            style={{
              padding: "3px 9px",
              borderRadius: 7,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: ".05em",
              background: "var(--acc-soft)",
              color: "var(--acc2)",
            }}
          >
            {badge}
          </span>
        ) : null}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 16 }}>
        {selectedItem ? (
          selectedItem.type === "text" ? (
            <TextInspector
              item={selectedItem}
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
              onReplace={onReplaceImage}
              onUpdate={(patch) => onUpdateItem(selectedItem.id, patch)}
            />
          )
        ) : (
          <SlideInspector
            slide={slide}
            format={format}
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

function getInspectorBadge(selectedItem: CarouselSlideItem | null) {
  if (!selectedItem) return ""
  if (selectedItem.type === "text") return "TEXT"
  if (selectedItem.type === "image") return "IMAGE"
  if (selectedItem.type === "gradient-shadow") return "SHADOW"
  return "MEDIA"
}

function SlideInspector({
  slide,
  format,
  onUpdateFormat,
  onUpdateSlide,
}: {
  slide: CarouselSlide
  format: CarouselFormat
  onUpdateFormat: (format: CarouselFormat) => void
  onUpdateSlide: (patch: Partial<CarouselSlide>) => void
}) {
  return (
    <div>
      <StudioLabel style={{ marginBottom: 9 }}>Slide name</StudioLabel>
      <input
        value={slide.title}
        onChange={(event) => onUpdateSlide({ title: event.target.value })}
        style={{ ...studioInput, marginBottom: 18 }}
      />

      <StudioLabel style={{ marginBottom: 9 }}>Format</StudioLabel>
      <div style={{ marginBottom: 18 }}>
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

      <StudioLabel style={{ marginBottom: 9 }}>Background</StudioLabel>
      <ColorField
        value={slide.backgroundColor}
        onChange={(backgroundColor) => onUpdateSlide({ backgroundColor })}
        swatches={BACKGROUND_SWATCHES}
      />
    </div>
  )
}

function TextInspector({
  item,
  onUpdate,
}: {
  item: CarouselTextItem
  onUpdate: (patch: Partial<CarouselTextItem>) => void
}) {
  return (
    <div>
      <StudioLabel style={{ marginBottom: 9 }}>Content</StudioLabel>
      <textarea
        value={item.text}
        rows={4}
        onChange={(event) => onUpdate({ text: event.target.value })}
        style={{
          width: "100%",
          resize: "vertical",
          background: "var(--panel2)",
          border: "1px solid var(--line)",
          borderRadius: 11,
          padding: 11,
          color: "var(--ink)",
          fontSize: 13.5,
          fontFamily: "inherit",
          lineHeight: 1.45,
          marginBottom: 18,
        }}
      />

      <StudioLabel style={{ marginBottom: 9 }}>Font</StudioLabel>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 18 }}>
        {TEXT_FONTS.map((font) => {
          const on = item.fontId === font.id
          return (
            <button
              key={font.id}
              type="button"
              onClick={() => onUpdate({ fontId: font.id })}
              style={{
                padding: 10,
                borderRadius: 10,
                fontSize: 12,
                cursor: "pointer",
                border: `1px solid ${on ? "var(--acc)" : "var(--line)"}`,
                background: on ? "var(--acc-soft)" : "var(--panel2)",
                color: "var(--ink)",
                fontFamily: font.family,
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {font.label}
            </button>
          )
        })}
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
        <span className="st-lbl">Size</span>
        <span style={{ fontSize: 11.5, color: "var(--ink2)", fontVariantNumeric: "tabular-nums" }}>
          {item.fontSize}px
        </span>
      </div>
      <input
        type="range"
        min={12}
        max={180}
        step={2}
        value={item.fontSize}
        onChange={(event) => onUpdate({ fontSize: Number(event.target.value) })}
        aria-label="Font size"
        style={{ width: "100%", background: fillTrack(item.fontSize, 12, 180) }}
      />

      <StudioLabel style={{ margin: "18px 0 9px" }}>Color</StudioLabel>
      <div style={{ marginBottom: 18 }}>
        <ColorField
          value={item.color}
          onChange={(color) => onUpdate({ color })}
          swatches={TEXT_SWATCHES}
        />
      </div>

      <StudioLabel style={{ marginBottom: 9 }}>Alignment</StudioLabel>
      <div style={{ marginBottom: 18 }}>
        <SegRow
          columns={3}
          value={item.align}
          onChange={(align) => onUpdate({ align })}
          options={[
            { value: "left", label: <AlignLeftIcon size={16} />, title: "Align left" },
            { value: "center", label: <AlignCenterIcon size={16} />, title: "Align center" },
            { value: "right", label: <AlignRightIcon size={16} />, title: "Align right" },
          ]}
        />
      </div>

      <PositionFields item={item} onUpdate={onUpdate} />
    </div>
  )
}

function MediaInspector({
  item,
  onReplace,
  onUpdate,
}: {
  item: CarouselMediaItem
  onReplace: () => void
  onUpdate: (patch: Partial<CarouselMediaItem>) => void
}) {
  return (
    <div>
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
      <button
        type="button"
        className="st-hovbg"
        onClick={onReplace}
        style={{
          ...panelActionBtn,
          width: "fit-content",
          maxWidth: "100%",
          padding: "0 14px",
          whiteSpace: "nowrap",
          marginBottom: 18,
        }}
      >
        <ReplaceIcon size={15} />
        Replace media
      </button>

      <StudioLabel style={{ marginBottom: 9 }}>Fit</StudioLabel>
      <div style={{ marginBottom: 18 }}>
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

      <PositionFields item={item} onUpdate={onUpdate} />
    </div>
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
    <div>
      <StudioLabel style={{ marginBottom: 9 }}>Direction</StudioLabel>
      <div style={{ marginBottom: 18 }}>
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

      <StudioLabel style={{ marginBottom: 9 }}>Color</StudioLabel>
      <div style={{ marginBottom: 18 }}>
        <ColorField
          value={item.color}
          onChange={(color) => onUpdate({ color })}
          swatches={SHADOW_SWATCHES}
        />
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 9 }}>
        <span className="st-lbl">Opacity</span>
        <span style={{ fontSize: 11.5, color: "var(--ink2)", fontVariantNumeric: "tabular-nums" }}>
          {Math.round(item.opacity)}%
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={item.opacity}
        onChange={(event) => onUpdate({ opacity: Number(event.target.value) })}
        aria-label="Shadow opacity"
        style={{ width: "100%", background: fillTrack(item.opacity, 0, 100), marginBottom: 18 }}
      />

      <PositionFields item={item} onUpdate={onUpdate} />
    </div>
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
    <>
      <StudioLabel style={{ marginBottom: 9 }}>Position &amp; size</StudioLabel>
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
    </>
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

  return (
    <div style={{ ...studioCard, padding: "8px 11px" }}>
      <div style={{ fontSize: 10, color: "var(--mut)", marginBottom: 3 }}>{label}</div>
      <input
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
        style={{
          width: "100%",
          background: "transparent",
          border: "none",
          outline: "none",
          color: "var(--ink)",
          fontSize: 13,
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
          fontFamily: "inherit",
          padding: 0,
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
    <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
      <button type="button" className="st-hovbg" onClick={onBringForward} style={{ ...panelActionBtn, flex: 1 }}>
        <ArrowUpIcon size={15} />
        Forward
      </button>
      <button type="button" className="st-hovbg" onClick={onSendBackward} style={{ ...panelActionBtn, flex: 1 }}>
        <ArrowDownIcon size={15} />
        Back
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label="Delete layer"
        title="Delete layer"
        style={{
          ...panelActionBtn,
          width: 40,
          flex: "none",
          color: "var(--coral)",
          borderColor: "color-mix(in oklch, var(--coral), transparent 60%)",
        }}
      >
        <Trash2Icon size={15} />
      </button>
    </div>
  )
}

const panelActionBtn: React.CSSProperties = {
  height: 36,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: 7,
  background: "var(--panel2)",
  border: "1px solid var(--line2)",
  borderRadius: 10,
  color: "var(--ink)",
  fontSize: 12.5,
  fontWeight: 600,
  cursor: "pointer",
}

// --------------------------------------------------- Shared studio bits -----

const studioCard: React.CSSProperties = {
  background: "var(--panel2)",
  border: "1px solid var(--line)",
  borderRadius: 11,
}

const studioInput: React.CSSProperties = {
  width: "100%",
  height: 34,
  background: "var(--panel2)",
  border: "1px solid var(--line)",
  borderRadius: 9,
  padding: "0 11px",
  color: "var(--ink)",
  fontSize: 13,
  fontFamily: "inherit",
  outline: "none",
}

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
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${columns ?? options.length},1fr)`,
        gap: 8,
      }}
    >
      {options.map((option) => {
        const on = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            title={option.title}
            onClick={() => onChange(option.value)}
            style={{
              display: "grid",
              placeItems: "center",
              padding: "9px 6px",
              borderRadius: 10,
              fontSize: 12,
              cursor: "pointer",
              border: `1px solid ${on ? "var(--acc)" : "var(--line)"}`,
              background: on ? "var(--acc-soft)" : "var(--panel2)",
              color: "var(--ink)",
            }}
          >
            {option.label}
          </button>
        )
      })}
    </div>
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
    <div style={{ display: "flex", gap: 9, flexWrap: "wrap", alignItems: "center" }}>
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
          style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
        />
      </label>
    </div>
  )
}

// -------------------------------------------------------- Status bar --------

function StatusBar({
  format,
  slideCount,
  saveStatus,
  statusError,
}: {
  format: CarouselFormat
  slideCount: number
  saveStatus: SaveStatus
  statusError: string | null
}) {
  const saveDot =
    saveStatus === "error"
      ? "var(--coral)"
      : saveStatus === "saving"
        ? "var(--warn)"
        : "var(--good)"
  const saveLabel =
    saveStatus === "error"
      ? (statusError ?? "Save failed")
      : saveStatus === "saving"
        ? "Saving…"
        : "Saved"

  return (
    <footer
      style={{
        height: 28,
        flex: "none",
        display: "flex",
        alignItems: "center",
        gap: 18,
        padding: "0 14px",
        background: "var(--panel)",
        borderTop: "1px solid var(--line)",
        fontSize: 11,
        color: "var(--ink2)",
        zIndex: 16,
      }}
    >
      <StatItem label="Format" value={FORMAT_LABELS[format]} />
      <StatItem label="Slides" value={String(slideCount)} />
      <div style={{ flex: 1 }} />
      <span
        role={saveStatus === "error" ? "alert" : "status"}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          maxWidth: 260,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          color: saveStatus === "error" ? "var(--coral)" : "var(--ink2)",
        }}
      >
        <span style={{ height: 6, width: 6, borderRadius: "50%", background: saveDot, flex: "none" }} />
        {saveLabel}
      </span>
    </footer>
  )
}

function StatItem({ label, value }: { label: string; value: string }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "baseline", gap: 5 }}>
      <span style={{ color: "var(--mut)" }}>{label}</span>
      <span style={{ fontWeight: 600, color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
        {value}
      </span>
    </span>
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin" className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>Preview</DialogTitle>
          <DialogDescription>
            Review your slides and caption before exporting.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="grid gap-4 md:grid-cols-[1fr_280px]">
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
            <div className="space-y-2">
              <Label>Caption</Label>
              <div className="max-h-96 overflow-auto rounded-md border bg-muted/30 p-3 text-sm whitespace-pre-wrap">
                {caption}
              </div>
            </div>
          </div>
        </DialogBody>
        <DialogFooter variant="plain">
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
  progress,
  onUpdateCaption,
  onExport,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  slideCount: number
  caption: string
  exporting: boolean
  error: string | null
  progress: CarouselVideoExportProgress | null
  onUpdateCaption: (caption: string) => void
  onExport: (
    mode: CarouselExportMode,
    options: { secondsPerSlide: number }
  ) => void
}) {
  const [mode, setMode] = React.useState<CarouselExportMode>("zip")
  const [secondsPerSlide, setSecondsPerSlide] = React.useState(3)
  const [mp4Supported, setMp4Supported] = React.useState<boolean | null>(null)

  React.useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => {
      setMp4Supported(canExportCarouselMp4())
    }, 0)
    return () => window.clearTimeout(timer)
  }, [open])

  const selectedMode = mp4Supported === false && mode === "mp4" ? "zip" : mode
  const progressValue = progress
    ? Math.round((progress.completedSlides / progress.totalSlides) * 100)
    : 0

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
            Download your carousel as image slides or a video.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Format</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <ExportOptionButton
                  active={selectedMode === "zip"}
                  disabled={exporting}
                  icon={<FileArchiveIcon className="size-4" />}
                  title="ZIP"
                  description={`${slideCount} PNG slides and caption.txt`}
                  onClick={() => setMode("zip")}
                />
                <ExportOptionButton
                  active={selectedMode === "mp4"}
                  disabled={exporting || mp4Supported === false}
                  icon={<FilmIcon className="size-4" />}
                  title="MP4"
                  description={
                    mp4Supported === false
                      ? "Not supported by this browser"
                      : `${slideCount} slides as a video`
                  }
                  onClick={() => setMode("mp4")}
                />
              </div>

              {selectedMode === "mp4" ? (
                <div className="grid gap-2">
                  <FieldLabel htmlFor="carousel-video-duration">
                    Slide duration
                  </FieldLabel>
                  <Input
                    id="carousel-video-duration"
                    type="number"
                    min={1}
                    max={10}
                    step={0.5}
                    value={secondsPerSlide}
                    disabled={exporting}
                    onChange={(event) =>
                      setSecondsPerSlide(Number(event.target.value))
                    }
                  />
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card size="sm">
            <CardHeader>
              <CardTitle>Caption</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="grid gap-2">
                <FieldLabel htmlFor="carousel-export-caption">
                  Caption
                </FieldLabel>
                <Textarea
                  id="carousel-export-caption"
                  value={caption}
                  rows={1}
                  disabled={exporting}
                  onChange={(event) => onUpdateCaption(event.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {exporting && progress ? (
            <div className="space-y-2">
              <Progress value={progressValue} />
              <p className="text-xs text-muted-foreground">
                Rendering slide{" "}
                {Math.min(progress.completedSlides + 1, progress.totalSlides)}{" "}
                of {progress.totalSlides}
              </p>
            </div>
          ) : null}

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter variant="plain">
          <Button
            type="button"
            variant="outline"
            disabled={exporting}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={
              exporting || (selectedMode === "mp4" && mp4Supported === false)
            }
            onClick={() => onExport(selectedMode, { secondsPerSlide })}
          >
            {exporting ? (
              <Loader2Icon className="size-4 animate-spin" />
            ) : (
              <DownloadIcon className="size-4" />
            )}
            {exporting ? "Exporting" : `Export ${selectedMode.toUpperCase()}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ExportOptionButton({
  active,
  disabled,
  icon,
  title,
  description,
  onClick,
}: {
  active: boolean
  disabled: boolean
  icon: React.ReactNode
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      className={cn(
        "rounded-md border bg-background p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        active
          ? "border-foreground"
          : "border-border hover:border-foreground/50 hover:bg-muted/40"
      )}
      onClick={onClick}
    >
      <span className="flex items-center gap-2 text-sm font-medium">
        {icon}
        {title}
      </span>
      <span className="mt-1 block text-xs text-muted-foreground">
        {description}
      </span>
    </button>
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

function builderReducer(
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
      const slide = createBlankSlide()
      return withHistory(state, {
        ...state,
        slides: [...state.slides, slide],
        selectedSlideId: slide.id,
        selectedItemId: slide.items[0]?.id ?? null,
      })
    }
    case "DUPLICATE_SLIDE": {
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
    case "ADD_ITEM":
      return withHistory(state, {
        ...state,
        selectedItemId: action.item.id,
        slides: state.slides.map((slide) =>
          slide.id === action.slideId
            ? { ...slide, items: [...slide.items, action.item] }
            : slide
        ),
      })
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
  altText?: string,
  mediaId?: string,
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
