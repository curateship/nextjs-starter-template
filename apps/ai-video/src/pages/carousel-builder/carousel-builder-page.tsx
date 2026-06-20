import * as React from "react"
import { Link } from "@tanstack/react-router"
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  CopyIcon,
  DownloadIcon,
  EyeIcon,
  FileArchiveIcon,
  FilmIcon,
  ImageIcon,
  Loader2Icon,
  PlusIcon,
  Redo2Icon,
  Trash2Icon,
  TypeIcon,
  Undo2Icon,
} from "lucide-react"

import { MediaPicker } from "@/components/media-picker"
import { Button } from "@/components/ui/button"
import { ColorPicker } from "@/components/ui/color-picker"
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
import { Progress } from "@/components/ui/progress"
import { ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  getCarouselErrorMessage,
  saveCarousel,
  type CarouselDetail,
  type CarouselFormat,
  type CarouselMediaItem,
  type CarouselSlide,
  type CarouselSlideItem,
  type CarouselTextAlign,
  type CarouselTextItem,
} from "@/lib/api/carousels"
import type { MediaItem } from "@/lib/api/media"
import { cn } from "@/lib/utils"
import {
  canExportCarouselMp4,
  exportCarouselMp4,
  exportCarouselZip,
  type CarouselVideoExportProgress,
} from "@/pages/carousel-builder/carousel-export"

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
  | { type: "UNDO" }
  | { type: "REDO" }

const AUTOSAVE_DEBOUNCE_MS = 1200
const UNDO_LIMIT = 50
const MIN_ITEM_SIZE = 0.06
const DEFAULT_BACKGROUND = "#f8fafc"

const FORMAT_LABELS: Record<CarouselFormat, string> = {
  "4:5": "4:5 portrait",
  "1:1": "1:1 square",
  "9:16": "9:16 story",
}

const FORMAT_RATIOS: Record<CarouselFormat, number> = {
  "4:5": 4 / 5,
  "1:1": 1,
  "9:16": 9 / 16,
}

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
  const [saveStatus, setSaveStatus] = React.useState<SaveStatus>("saved")
  const [statusError, setStatusError] = React.useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = React.useState(false)
  const [exportOpen, setExportOpen] = React.useState(false)
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

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <header className="flex h-14 shrink-0 items-center gap-2 border-b px-3 sm:px-4">
        <Button asChild variant="ghost" size="icon-sm">
          <Link to="/admin/carousels" aria-label="Back to carousels">
            <ArrowLeftIcon className="size-4" />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-sm font-semibold">{document.name}</h1>
          <p className="text-xs text-muted-foreground">
            {saveStatus === "saving"
              ? "Saving"
              : saveStatus === "error"
                ? (statusError ?? "Save failed")
                : "Saved"}
          </p>
        </div>
        {exportError ? (
          <p role="alert" className="hidden text-xs text-destructive lg:block">
            {exportError}
          </p>
        ) : null}
        <IconButton
          label="Undo"
          disabled={!state.past.length}
          onClick={() => dispatch({ type: "UNDO" })}
        >
          <Undo2Icon className="size-4" />
        </IconButton>
        <IconButton
          label="Redo"
          disabled={!state.future.length}
          onClick={() => dispatch({ type: "REDO" })}
        >
          <Redo2Icon className="size-4" />
        </IconButton>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setPreviewOpen(true)}
        >
          <EyeIcon className="size-4" />
          Preview
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            setExportError(null)
            setExportProgress(null)
            setExportOpen(true)
          }}
        >
          <DownloadIcon className="size-4" />
          Export
        </Button>
      </header>

      <ResizablePanelGroup className="min-h-0 flex-1" orientation="horizontal">
        <ResizablePanel defaultSize="25%" minSize="180px" maxSize="320px">
          <SlidesPanel
            slides={state.slides}
            format={state.format}
            selectedSlideId={state.selectedSlideId}
            onSelectSlide={(slideId) =>
              dispatch({ type: "SELECT_SLIDE", slideId })
            }
            onAddSlide={() => dispatch({ type: "ADD_SLIDE" })}
            onDuplicateSlide={(slideId) =>
              dispatch({ type: "DUPLICATE_SLIDE", slideId })
            }
            onDeleteSlide={(slideId) =>
              dispatch({ type: "DELETE_SLIDE", slideId })
            }
          />
        </ResizablePanel>
        <ResizablePanel defaultSize="50%" minSize="360px">
          {selectedSlide ? (
            <CanvasPanel
              slide={selectedSlide}
              format={state.format}
              selectedItemId={state.selectedItemId}
              onSelectItem={(itemId) =>
                dispatch({ type: "SELECT_ITEM", itemId })
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
        </ResizablePanel>
        <ResizablePanel defaultSize="25%" minSize="280px" maxSize="420px">
          {selectedSlide ? (
            <InspectorPanel
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
              onAddText={() =>
                dispatch({
                  type: "ADD_ITEM",
                  slideId: selectedSlide.id,
                  item: createTextItem(),
                })
              }
              onAddImage={(item) =>
                dispatch({
                  type: "ADD_ITEM",
                  slideId: selectedSlide.id,
                  item,
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
        </ResizablePanel>
      </ResizablePanelGroup>

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
    </div>
  )
}

function SlidesPanel({
  slides,
  format,
  selectedSlideId,
  onSelectSlide,
  onAddSlide,
  onDuplicateSlide,
  onDeleteSlide,
}: {
  slides: CarouselSlide[]
  format: CarouselFormat
  selectedSlideId: string
  onSelectSlide: (slideId: string) => void
  onAddSlide: () => void
  onDuplicateSlide: (slideId: string) => void
  onDeleteSlide: (slideId: string) => void
}) {
  return (
    <aside className="flex h-full min-h-0 flex-col border-r bg-muted/30">
      <div className="flex h-12 shrink-0 items-center justify-between px-3">
        <h2 className="text-sm font-semibold">Slides</h2>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          onClick={onAddSlide}
          aria-label="Add slide"
        >
          <PlusIcon className="size-4" />
        </Button>
      </div>
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-3 p-3 pt-0">
          {slides.map((slide, index) => (
            <div key={slide.id} className="group relative">
              <button
                type="button"
                aria-label={`Select slide ${index + 1}`}
                className={cn(
                  "block w-full overflow-hidden rounded-md border bg-muted text-left transition-colors outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                  selectedSlideId === slide.id
                    ? "border-foreground"
                    : "border-border hover:border-foreground/50"
                )}
                onClick={() => onSelectSlide(slide.id)}
              >
                <StaticSlidePreview slide={slide} format={format} />
                <span className="absolute top-2 left-2 rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-semibold text-foreground shadow-sm ring-1 ring-border">
                  {String(index + 1).padStart(2, "0")}
                </span>
              </button>
              <div className="absolute top-2 right-2 flex gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
                <IconButton
                  label="Duplicate slide"
                  size="icon-xs"
                  className="bg-background/90 shadow-sm ring-1 ring-border hover:bg-background"
                  onClick={() => onDuplicateSlide(slide.id)}
                >
                  <CopyIcon className="size-3" />
                </IconButton>
                <IconButton
                  label="Delete slide"
                  size="icon-xs"
                  disabled={slides.length <= 1}
                  className="bg-background/90 shadow-sm ring-1 ring-border hover:bg-background"
                  onClick={() => onDeleteSlide(slide.id)}
                >
                  <Trash2Icon className="size-3" />
                </IconButton>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </aside>
  )
}

function CanvasPanel({
  slide,
  format,
  selectedItemId,
  onSelectItem,
  onUpdateItem,
  onCommitHistory,
  getSnapshot,
}: {
  slide: CarouselSlide
  format: CarouselFormat
  selectedItemId: string | null
  onSelectItem: (itemId: string | null) => void
  onUpdateItem: (
    itemId: string,
    patch: Partial<CarouselSlideItem>,
    transient?: boolean
  ) => void
  onCommitHistory: (before: Snapshot) => void
  getSnapshot: () => Snapshot
}) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const stageRef = React.useRef<HTMLDivElement>(null)
  const dragRef = React.useRef<{
    itemId: string
    mode: "move" | "resize"
    startX: number
    startY: number
    item: CarouselSlideItem
    before: Snapshot
  } | null>(null)
  const [box, setBox] = React.useState({ width: 0, height: 0 })

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
  let stageWidth = box.width - 48
  let stageHeight = stageWidth / ratio
  if (stageHeight > box.height - 48) {
    stageHeight = box.height - 48
    stageWidth = stageHeight * ratio
  }
  stageWidth = Math.max(220, stageWidth)
  stageHeight = Math.max(220 / ratio, stageHeight)

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
      className="grid h-full min-h-0 place-items-center overflow-hidden bg-muted/20 p-6"
    >
      <div
        ref={stageRef}
        className="relative overflow-hidden rounded-md border shadow-sm"
        style={{
          width: stageWidth,
          height: stageHeight,
          backgroundColor: slide.backgroundColor,
        }}
        onPointerDown={() => onSelectItem(null)}
      >
        {slide.items
          .slice()
          .sort((a, b) => a.zIndex - b.zIndex)
          .map((item) => (
            <CanvasItem
              key={item.id}
              item={item}
              selected={item.id === selectedItemId}
              scale={stageWidth / 1080}
              onPointerDown={(event) => handlePointerDown(event, item, "move")}
              onResizeDown={(event) => handlePointerDown(event, item, "resize")}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            />
          ))}
      </div>
    </main>
  )
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
      className={cn(
        "absolute touch-none select-none",
        selected && "outline outline-2 outline-primary"
      )}
      style={{
        left: `${item.x * 100}%`,
        top: `${item.y * 100}%`,
        width: `${item.width * 100}%`,
        height: `${item.height * 100}%`,
        zIndex: item.zIndex,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      {item.type === "text" ? (
        <div
          className="h-full w-full font-semibold break-words whitespace-pre-wrap"
          style={{
            color: item.color,
            fontSize: item.fontSize * scale,
            lineHeight: 1.16,
            textAlign: item.align,
          }}
        >
          {item.text}
        </div>
      ) : item.type === "image" ? (
        <img
          src={item.url}
          alt={item.altText ?? ""}
          draggable={false}
          className={cn(
            "h-full w-full rounded-sm",
            item.fit === "contain" ? "object-contain" : "object-cover"
          )}
        />
      ) : (
        <div className="grid h-full w-full place-items-center rounded-sm border bg-black text-white">
          <ImageIcon className="size-8" />
        </div>
      )}
      {selected ? (
        <button
          type="button"
          className="absolute -right-2 -bottom-2 size-4 rounded-full border bg-background shadow-sm"
          onPointerDown={onResizeDown}
          aria-label="Resize layer"
        />
      ) : null}
    </div>
  )
}

function InspectorPanel({
  slide,
  selectedItem,
  format,
  onUpdateFormat,
  onUpdateSlide,
  onUpdateItem,
  onAddText,
  onAddImage,
  onDeleteItem,
  onMoveLayer,
}: {
  slide: CarouselSlide
  selectedItem: CarouselSlideItem | null
  format: CarouselFormat
  onUpdateFormat: (format: CarouselFormat) => void
  onUpdateSlide: (patch: Partial<CarouselSlide>) => void
  onUpdateItem: (itemId: string, patch: Partial<CarouselSlideItem>) => void
  onAddText: () => void
  onAddImage: (item: CarouselMediaItem) => void
  onDeleteItem: (itemId: string) => void
  onMoveLayer: (itemId: string, direction: 1 | -1) => void
}) {
  const [mediaOpen, setMediaOpen] = React.useState(false)

  function handleSelectMedia(url: string, altText?: string, media?: MediaItem) {
    if (selectedItem?.type === "image") {
      onUpdateItem(selectedItem.id, {
        url,
        altText,
        mediaId: media?.id,
      })
      return
    }

    onAddImage(createImageItem(url, altText, media?.id))
  }

  return (
    <aside className="flex h-full min-h-0 flex-col border-l bg-muted/30">
      <div className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <h2 className="text-sm font-semibold">Inspector</h2>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={onAddText}
            aria-label="Add text"
          >
            <TypeIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            onClick={() => setMediaOpen(true)}
            aria-label="Add image"
          >
            <ImageIcon className="size-4" />
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        {selectedItem ? (
          selectedItem.type === "text" ? (
            <TextInspector
              item={selectedItem}
              onUpdate={(patch) => onUpdateItem(selectedItem.id, patch)}
            />
          ) : (
            <MediaInspector
              item={selectedItem}
              onReplace={() => setMediaOpen(true)}
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

      <MediaPicker
        open={mediaOpen}
        onOpenChange={setMediaOpen}
        showVideos={false}
        currentMediaUrl={
          selectedItem?.type === "image" ? selectedItem.url : undefined
        }
        onSelectMedia={handleSelectMedia}
      />
    </aside>
  )
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
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="slide-title">Slide name</Label>
        <Input
          id="slide-title"
          value={slide.title}
          onChange={(event) => onUpdateSlide({ title: event.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="carousel-format">Format</Label>
        <Select
          value={format}
          onValueChange={(value) => onUpdateFormat(value as CarouselFormat)}
        >
          <SelectTrigger id="carousel-format">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(FORMAT_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="slide-background">Background</Label>
        <ColorPicker
          id="slide-background"
          value={slide.backgroundColor}
          onChange={(backgroundColor) => onUpdateSlide({ backgroundColor })}
        />
      </div>
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
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="item-text">Text</Label>
        <Textarea
          id="item-text"
          value={item.text}
          rows={5}
          onChange={(event) => onUpdate({ text: event.target.value })}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Font size</Label>
        <Slider
          value={[item.fontSize]}
          min={12}
          max={180}
          step={2}
          onValueChange={(value) => onUpdate({ fontSize: value[0] })}
          aria-label="Font size"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="item-color">Color</Label>
        <ColorPicker
          id="item-color"
          value={item.color}
          onChange={(color) => onUpdate({ color })}
        />
      </div>
      <div className="space-y-1.5">
        <Label>Alignment</Label>
        <div className="flex gap-1">
          {[
            ["left", AlignLeftIcon],
            ["center", AlignCenterIcon],
            ["right", AlignRightIcon],
          ].map(([align, Icon]) => (
            <Button
              key={align as string}
              type="button"
              variant={item.align === align ? "default" : "outline"}
              size="icon-sm"
              onClick={() => onUpdate({ align: align as CarouselTextAlign })}
              aria-label={`${align} align`}
            >
              <Icon className="size-4" />
            </Button>
          ))}
        </div>
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
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>Media</Label>
        <div className="overflow-hidden rounded-md border bg-background">
          <img
            src={item.url}
            alt={item.altText ?? ""}
            className="aspect-video w-full object-cover"
          />
        </div>
        <Button type="button" variant="outline" onClick={onReplace}>
          <ImageIcon className="size-4" />
          Replace
        </Button>
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="media-fit">Fit</Label>
        <Select
          value={item.fit}
          onValueChange={(value) =>
            onUpdate({ fit: value === "contain" ? "contain" : "cover" })
          }
        >
          <SelectTrigger id="media-fit">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="cover">Crop</SelectItem>
            <SelectItem value="contain">Fit</SelectItem>
          </SelectContent>
        </Select>
      </div>
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
    <div className="grid grid-cols-2 gap-2">
      {[
        ["X", "x", item.x],
        ["Y", "y", item.y],
        ["W", "width", item.width],
        ["H", "height", item.height],
      ].map(([label, key, value]) => (
        <div key={key as string} className="space-y-1.5">
          <Label htmlFor={`pos-${key}`}>{label}</Label>
          <Input
            id={`pos-${key}`}
            type="number"
            min={0}
            max={100}
            value={Math.round((value as number) * 100)}
            onChange={(event) =>
              onUpdate(
                positionPatch(
                  item,
                  key as PositionKey,
                  Number(event.target.value) / 100
                ) as Partial<T>
              )
            }
          />
        </div>
      ))}
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
        size="sm"
        onClick={onBringForward}
      >
        <ArrowUpIcon className="size-4" />
        Forward
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={onSendBackward}
      >
        <ArrowDownIcon className="size-4" />
        Back
      </Button>
      <Button
        type="button"
        variant="destructive"
        size="icon-sm"
        onClick={onDelete}
        aria-label="Delete layer"
      >
        <Trash2Icon className="size-4" />
      </Button>
    </div>
  )
}

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
        </DialogHeader>
        <DialogBody className="gap-5">
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
            <div className="grid gap-2 sm:grid-cols-[1fr_9rem] sm:items-end">
              <div className="space-y-1.5">
                <Label htmlFor="carousel-video-duration">Slide duration</Label>
              </div>
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

          <div className="space-y-1.5">
            <Label htmlFor="carousel-export-caption">Caption</Label>
            <Textarea
              id="carousel-export-caption"
              value={caption}
              rows={8}
              disabled={exporting}
              onChange={(event) => onUpdateCaption(event.target.value)}
            />
          </div>

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
  return (
    <div
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
              <div
                className="h-full w-full font-semibold break-words whitespace-pre-wrap"
                style={{
                  color: item.color,
                  fontSize: `${Math.max(8, item.fontSize * 0.18)}px`,
                  lineHeight: 1.16,
                  textAlign: item.align,
                }}
              >
                {item.text}
              </div>
            ) : item.type === "image" ? (
              <img
                src={item.url}
                alt={item.altText ?? ""}
                className={cn(
                  "h-full w-full",
                  item.fit === "contain" ? "object-contain" : "object-cover"
                )}
              />
            ) : null}
          </div>
        ))}
    </div>
  )
}

function IconButton({
  label,
  children,
  size = "icon-sm",
  ...props
}: React.ComponentProps<typeof Button> & {
  label: string
  children: React.ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size={size}
          aria-label={label}
          {...props}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

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
                    ? { ...item, ...action.patch }
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

function createTextItem(): CarouselTextItem {
  return {
    id: builderId(),
    type: "text",
    text: "New text",
    x: 0.12,
    y: 0.16,
    width: 0.76,
    height: 0.2,
    zIndex: 10,
    fontSize: 56,
    color: "#111827",
    align: "left",
  }
}

function createImageItem(
  url: string,
  altText?: string,
  mediaId?: string
): CarouselMediaItem {
  return {
    id: builderId(),
    type: "image",
    mediaId,
    url,
    altText,
    x: 0.12,
    y: 0.24,
    width: 0.76,
    height: 0.46,
    zIndex: 5,
    fit: "cover",
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

function clamp01(value: number, max = 1) {
  return Math.min(Math.max(0, value), Math.max(0, max))
}

function clampSize(value: number, max = 1) {
  return Math.min(Math.max(MIN_ITEM_SIZE, max), Math.max(MIN_ITEM_SIZE, value))
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
