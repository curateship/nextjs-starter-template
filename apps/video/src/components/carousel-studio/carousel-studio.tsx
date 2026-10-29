import * as React from "react"
import { Link, useNavigate } from "@tanstack/react-router"
import type { PanelImperativeHandle } from "react-resizable-panels"
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  ArrowDownIcon,
  ArrowLeftIcon,
  ArrowUpIcon,
  BlendIcon,
  BoldIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CopyIcon,
  DownloadIcon,
  EllipsisIcon,
  EyeIcon,
  FilmIcon,
  GripVerticalIcon,
  HashIcon,
  HighlighterIcon,
  HistoryIcon,
  ImageIcon,
  LanguagesIcon,
  LayersIcon,
  LayoutGridIcon,
  ListIcon,
  ListTreeIcon,
  Loader2Icon,
  Maximize2Icon,
  MinusIcon,
  PlusIcon,
  Redo2Icon,
  RotateCcwIcon,
  ScanIcon,
  SearchIcon,
  SlidersHorizontalIcon,
  SparklesIcon,
  Trash2Icon,
  TriangleAlertIcon,
  TypeIcon,
  Undo2Icon,
  UploadIcon,
} from "lucide-react"
import { toast } from "sonner"

import { useShellRuntime } from "@/components/shell/shell-layout"
import {
  DashboardCardHeader,
  DashboardCardTitleHeader,
} from "@/components/shared/dashboard-card-header"
import { EditorMediaContextMenu } from "@/components/shared/editor-media-context-menu"
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
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  duplicateCarousel,
  exportCarousel,
  getCarouselErrorMessage,
  listCollectionPictures,
  loadCarouselMediaCounts,
  makeVideoFromCarousel,
  suggestFirstSlide,
  writeCaption,
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
import type {
  CarouselSlideNumberItem,
  CarouselTextMarkStyle,
  CarouselWordsItem,
} from "@/lib/video/carousel-schema"
import {
  DEFAULT_HIGHLIGHT_COLOR,
  hasMark,
  letterSpacingOf,
  lineHeightOf,
  shiftMarks,
  toggleMark,
} from "@/lib/video/carousel-text"
import {
  getMediaErrorMessage,
  uploadMedia,
  type MediaItem,
} from "@/lib/api/media/media"
import { attachEditorMedia, listVideoMedia } from "@/lib/api/video/media"
import { LayersPanelBody } from "@/components/carousel-studio/layers-panel"
import { StickerList } from "@/components/video-editor/studio-stickers"
import { useMediaCollections } from "@/components/video-editor/use-media-collections"
import { CollectionNameDialog } from "@/components/video-editor/studio-media-collections"
import { MediaFilterMenu } from "@/components/video-editor/studio-media-filter"
import {
  CAROUSEL_MEDIA_FILTER,
  emptyMediaFilter,
  readMediaTypes,
  type MediaFilterValue,
} from "@/lib/video/media-saved-views"
import type { Sticker } from "@/lib/api/video/stickers"
import { PhonePreviewDialog } from "@/components/carousel-studio/phone-preview"
import {
  CarouselVersionsDialog,
  TranslateCopiesDialog,
} from "@/components/carousel-studio/carousel-copies-dialogs"
import { StockPhotoSearch } from "@/components/carousel-studio/stock-photos"
import {
  CarouselExportDialog,
  type CarouselExportKind,
  type CarouselVideoOptions,
} from "@/components/carousel-studio/export-dialog"
import {
  SlideLayerContent,
  StaticSlidePreview,
} from "@/components/carousel-studio/slide-layer"
import {
  RESIZE_HANDLES,
  boundingBox,
  snapMove,
  snapResize,
  snapThreshold,
  type ResizeHandle,
  type SnapGap,
  type SnapLine,
} from "@/lib/video/carousel-snap"
import type { CarouselShadowDirection } from "@/lib/video/carousel-schema"
import {
  CAROUSEL_FRAME_SIZES,
  findTextOverflow,
  matchSlideLayers,
  pushSlideLayout,
  relayoutSlides,
} from "@/lib/video/carousel-layout"
import {
  CAROUSEL_CONFLICT_MESSAGE,
  CAROUSEL_FORMATS,
  CAROUSEL_ITEM_LIMIT_MESSAGE,
  CAROUSEL_ITEM_MAX,
  CAROUSEL_LETTER_SPACING_RANGE,
  CAROUSEL_LINE_HEIGHT_RANGE,
  CAROUSEL_OUTLINE_WIDTH_MAX,
} from "@/lib/video/carousel-schema"
import {
  DEFAULT_TEXT_FONT_ID,
  requireTextFont,
  TEXT_FONTS,
  type TextFontId,
} from "@/lib/video/text-fonts"
import { cn } from "@/lib/utils"
import { useRememberedChoice } from "@/lib/remembered-choice"
import {
  instagramGuide,
  type InstagramGuide,
} from "@/lib/video/carousel-guides"
import { railPickedEdge, useRailPickedEdge } from "@/lib/video/rail"
import {
  dismissErrorToast,
  showErrorToast,
  useErrorToast,
} from "@/lib/toast/error-toast"
import {
  useBlankSpaceDoubleClick,
  usePanelToggle,
} from "@/lib/layout/panel-collapse"
import { useRememberedPanelLayout } from "@/lib/layout/panel-layout"
import "@/components/video-editor/studio.css"
import "@/components/video-editor/text-fonts.css"

export type Snapshot = {
  slides: CarouselSlide[]
  caption: string
  format: CarouselFormat
}

export type BuilderState = Snapshot & {
  selectedSlideId: string
  // The picked layers on the picked slide, in the order they were picked.
  selectedItemIds: string[]
  past: Snapshot[]
  future: Snapshot[]
}

export type BuilderAction =
  | { type: "SELECT_SLIDE"; slideId: string }
  // `additive` is a Shift-click: it adds the layer, or takes it back out.
  | { type: "SELECT_ITEM"; itemId: string | null; additive?: boolean }
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
  | {
      type: "UPDATE_ITEMS"
      slideId: string
      patches: Record<string, Partial<CarouselSlideItem>>
      transient?: boolean
    }
  | { type: "COMMIT_HISTORY"; before: Snapshot }
  | { type: "ADD_SLIDE" }
  | { type: "DUPLICATE_SLIDE"; slideId: string }
  | { type: "DELETE_SLIDE"; slideId: string }
  | { type: "MOVE_SLIDE"; slideId: string; toIndex: number }
  | { type: "ADD_ITEM"; slideId: string; item: CarouselSlideItem }
  // A slide number on every slide that has none yet, as one undo step.
  | { type: "ADD_SLIDE_NUMBERS"; item: CarouselSlideNumberItem }
  | { type: "PASTE_ITEMS"; slideId: string; items: CarouselSlideItem[] }
  | { type: "DELETE_ITEMS"; slideId: string; itemIds: string[] }
  | {
      type: "MOVE_LAYERS"
      slideId: string
      itemIds: string[]
      direction: 1 | -1
    }
  | { type: "RESET_DEFAULTS" }
  | { type: "PUSH_LAYOUT"; sourceSlideId: string; targetSlideIds: string[] }
  | { type: "UNDO" }
  | { type: "REDO" }

type StudioPanel = "slides" | "layers" | "text" | "image" | "shadow"

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
// editor's Text panel (Styles list) but tuned for carousel copy. The preview
// is drawn in the face and weight the layer exports in: every face ships at
// one weight, so a preset that looked heavier or slanted here came out plain.
const TEXT_PRESETS: {
  label: string
  fontId: TextFontId
  fontSize: number
  align: CarouselTextAlign
  y: number
  height: number
  previewSize: number
}[] = [
  {
    label: "Headline",
    fontId: "inter",
    fontSize: 96,
    align: "left",
    y: 0.12,
    height: 0.2,
    previewSize: 19,
  },
  {
    label: "Title",
    fontId: "inter",
    fontSize: 68,
    align: "left",
    y: 0.3,
    height: 0.16,
    previewSize: 16,
  },
  {
    label: "Subheading",
    fontId: "inter",
    fontSize: 46,
    align: "left",
    y: 0.5,
    height: 0.12,
    previewSize: 14,
  },
  {
    label: "Body copy",
    fontId: "inter",
    fontSize: 32,
    align: "left",
    y: 0.64,
    height: 0.18,
    previewSize: 13,
  },
  {
    label: "Pull quote",
    fontId: "playfair-display",
    fontSize: 52,
    align: "center",
    y: 0.4,
    height: 0.2,
    previewSize: 16,
  },
]

const NO_ITEMS: CarouselTextItem[] = []

// A picture sticker lands this share of the slide wide, or tall when it is
// taller than it is wide.
const STICKER_SHARE = 0.3

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
const HIGHLIGHT_SWATCHES = ["#ffe27a", "#a7f3d0", "#bfdbfe", "#fecaca", "#ffffff"]
const TEXT_BOX_SWATCHES = ["#111827", "#ffffff", "#ffe27a", "#4f46e5"]
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
}: {
  document: CarouselDetail
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
  const [writingCaption, setWritingCaption] = React.useState(false)
  const [translateOpen, setTranslateOpen] = React.useState(false)
  const [versionsOpen, setVersionsOpen] = React.useState(false)
  const [exportError, setExportError] = React.useState<string | null>(null)
  const [polishing, setPolishing] = React.useState(false)
  const [copyingTo, setCopyingTo] = React.useState<CarouselFormat | null>(null)
  const [pushOpen, setPushOpen] = React.useState(false)
  const [mediaVersion, setMediaVersion] = React.useState(0)
  const [dropping, setDropping] = React.useState(false)
  const navigate = useNavigate()
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
  // What the server holds, or will once the save in flight lands. The opening
  // document to start with, so merely viewing never saves.
  const sentRef = React.useRef<Snapshot | null>(document)
  const saveTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  const activeSaveRef = React.useRef<Promise<void> | null>(null)
  const versionRef = React.useRef(document.version)
  const saveQueueRef = React.useRef(Promise.resolve())
  const conflictRef = React.useRef(false)
  const [hasConflict, setHasConflict] = React.useState(false)

  // Both failures live in the shared error toast. A conflict outranks a status
  // failure, because it is the one that has stopped the saving.
  useErrorToast(
    hasConflict
      ? "This carousel changed somewhere else, so this window has stopped saving. Reload to use the newer version."
      : statusError,
    hasConflict ? () => window.location.reload() : undefined
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
  const selectedItems = React.useMemo(
    () =>
      selectedSlide
        ? state.selectedItemIds.flatMap(
            (id) => selectedSlide.items.find((item) => item.id === id) ?? []
          )
        : [],
    [selectedSlide, state.selectedItemIds]
  )
  // The inspector edits one layer at a time; several picked share one card.
  const selectedItem = selectedItems.length === 1 ? selectedItems[0] : null
  // Copied layers, kept in this window only. The system clipboard stays free
  // for the words being typed.
  const clipboardRef = React.useRef<CarouselSlideItem[]>([])
  const textOverflow = React.useMemo(
    () => findTextOverflow(state.slides, state.format),
    [state.slides, state.format]
  )

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
    // React runs effects twice while developing, and an undo can land back on
    // what was last sent. Neither is an edit, so neither saves. An undo back to
    // the opening document after a save is an edit, and does save.
    const sent = sentRef.current
    if (
      sent &&
      snapshot.slides === sent.slides &&
      snapshot.caption === sent.caption &&
      snapshot.format === sent.format
    ) {
      pendingRef.current = null
      return
    }
    if (conflictRef.current) return

    pendingRef.current = snapshot
    const timer = setTimeout(() => {
      if (saveTimerRef.current === timer) saveTimerRef.current = null
      pendingRef.current = null
      setSaveStatus("saving")
      setStatusError(null)
      sentRef.current = snapshot
      const save = persist(snapshot)
      activeSaveRef.current = save
      save
        .then(() => setSaveStatus("saved"))
        .catch((error) => {
          // The server may hold anything now, so the next change saves.
          if (sentRef.current === snapshot) sentRef.current = null
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
  }, [persist, snapshot])

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
    sentRef.current = pending
    const save = persist(pending)
    activeSaveRef.current = save
    try {
      await save
      setSaveStatus("saved")
    } catch (error) {
      if (sentRef.current === pending) sentRef.current = null
      setSaveStatus("error")
      setStatusError(getCarouselErrorMessage(error))
      pendingRef.current ??= pending
      throw error
    } finally {
      if (activeSaveRef.current === save) activeSaveRef.current = null
    }
  }

  async function handleExport(
    kind: CarouselExportKind,
    video: CarouselVideoOptions
  ) {
    setExporting(true)
    setExportError(null)
    try {
      // The server works from what is saved, so what is on screen is saved
      // first.
      await flushSave()
      if (kind === "video") {
        await makeVideoFromCarousel(document.id, video)
        setExportOpen(false)
        toast.success(
          `"${document.name} video" is queued. It shows in Exports when it is ready, and opens as a project.`,
          {
            action: {
              label: "Open Exports",
              onClick: () => void navigate({ to: "/admin/video-exports" }),
            },
          }
        )
        return
      }
      const kept = await exportCarousel(document.id)
      downloadKeptExport(kept.id, kept.title ?? document.name, kind === "pdf")
      setExportOpen(false)
      toast.success("Carousel exported. A copy is kept in Carousel exports.", {
        action: {
          label: "Open Carousel exports",
          onClick: () => void navigate({ to: "/admin/video-carousel-exports" }),
        },
      })
    } catch (error) {
      setExportError(getCarouselErrorMessage(error))
    } finally {
      setExporting(false)
    }
  }

  // The caption is written from the saved slides, then put in the box as an
  // ordinary edit, so Undo takes it back out.
  async function handleWriteCaption() {
    setWritingCaption(true)
    try {
      await flushSave()
      dispatch({ type: "UPDATE_CAPTION", caption: await writeCaption(document.id) })
    } catch (error) {
      showErrorToast(getCarouselErrorMessage(error))
    } finally {
      setWritingCaption(false)
    }
  }

  // Saves first, so the copy is made from what is on screen.
  async function copyToFormat(format: CarouselFormat) {
    setCopyingTo(format)
    try {
      await flushSave()
      const copy = await duplicateCarousel(document.id, format)
      toast.success(`"${copy.name}" created.`)
      await navigate({
        to: "/admin/video-carousels/$carouselId",
        params: { carouselId: copy.id },
      })
    } catch (error) {
      showErrorToast(getCarouselErrorMessage(error))
    } finally {
      setCopyingTo(null)
    }
  }

  function pushLayout(targetSlideIds: string[]) {
    if (!selectedSlide) return
    if (!targetSlideIds.length) {
      showErrorToast("Pick at least one slide to line up with this one.")
      return
    }
    // The reducer runs the same push, so this is what the slides will be.
    const pushed = pushSlideLayout(
      state.slides,
      selectedSlide.id,
      new Set(targetSlideIds)
    )
    const changed = pushed.filter((slide, index) => slide !== state.slides[index])
    if (!changed.length) {
      showErrorToast(
        "None of those slides has a layer like the ones on this slide, so nothing changed."
      )
      return
    }
    dispatch({
      type: "PUSH_LAYOUT",
      sourceSlideId: selectedSlide.id,
      targetSlideIds,
    })
    setPushOpen(false)
    // An earlier "pick a slide" or "nothing matched" no longer applies. A
    // saving failure shares the toast and must stay up.
    if (!hasConflict && !statusError) dismissErrorToast()

    const done = `${changed.length} ${changed.length === 1 ? "slide" : "slides"} aligned to this one.`
    const overflow = findTextOverflow(changed, state.format)
    if (!overflow.size) {
      toast.success(done)
      return
    }
    const names = pushed.flatMap((slide, index) =>
      overflow.has(slide.id)
        ? [`slide ${index + 1}${slide.title ? ` "${slide.title}"` : ""}`]
        : []
    )
    toast.warning(done, {
      description: `Text does not fit its box on ${new Intl.ListFormat("en").format(names)}, so the export would cut it off.`,
    })
  }

  function addItem(item: CarouselSlideItem) {
    if (!selectedSlide) return
    if (selectedSlide.items.length >= CAROUSEL_ITEM_MAX) {
      showErrorToast(CAROUSEL_ITEM_LIMIT_MESSAGE)
      return
    }
    dispatch({ type: "ADD_ITEM", slideId: selectedSlide.id, item })
  }

  /**
   * Uploads pictures and clips onto this carousel's shelf, one by one.
   * Anything else is refused before any upload starts.
   */
  async function uploadPictures(files: File[]) {
    const refused = files.find((file) => !slideFileKind(file))
    if (refused) throw new Error(DROP_PICTURES_ONLY_MESSAGE)
    const uploaded: MediaItem[] = []
    try {
      for (const file of files) {
        const media = await uploadMedia(file)
        await attachEditorMedia({ type: "carousel", id: document.id }, media.id)
        uploaded.push(media)
      }
    } finally {
      if (uploaded.length) setMediaVersion((version) => version + 1)
    }
    return uploaded
  }

  /**
   * Pictures dropped on the slide: uploaded, then placed on the picked slide
   * with the first one centred where it was dropped and each next one a
   * little further down and right.
   */
  async function dropPictures(files: File[], point: { x: number; y: number }) {
    if (!selectedSlide) return
    const slideId = selectedSlide.id
    const room = CAROUSEL_ITEM_MAX - selectedSlide.items.length
    if (files.length > room) {
      showErrorToast(CAROUSEL_ITEM_LIMIT_MESSAGE)
      return
    }
    const clips = files.filter((file) => slideFileKind(file) === "video")
    if (clips.length && (clips.length > 1 || slideHasVideo(selectedSlide))) {
      showErrorToast(ONE_VIDEO_PER_SLIDE_MESSAGE)
      return
    }
    setDropping(true)
    try {
      const uploaded = await uploadPictures(files)
      const size = CAROUSEL_FRAME_SIZES[state.format]
      const placed = await Promise.all(
        uploaded.map(async (media, index) => {
          const kind = media.file_type === "video" ? "video" : "image"
          const natural = await naturalSize(media.url, kind)
          const box = natural
            ? fitImageBox(natural.width, natural.height, state.format)
            : undefined
          const item = createImageItem(
            media.url,
            media.original_name,
            media.id,
            box,
            kind
          )
          const shift = (index * PASTE_OFFSET_PX) / size.width
          return {
            ...item,
            x: clamp01(point.x - item.width / 2 + shift, 1 - item.width),
            y: clamp01(point.y - item.height / 2 + shift, 1 - item.height),
          }
        })
      )
      dispatch({ type: "PASTE_ITEMS", slideId, items: placed })
    } catch (error) {
      showErrorToast(getMediaErrorMessage(error))
    } finally {
      setDropping(false)
    }
  }

  function addSlideNumbers() {
    const missing = state.slides.filter(
      (slide) => !slide.items.some((item) => item.type === "slide-number")
    )
    if (!missing.length) {
      showErrorToast("Every slide already has a slide number.")
      return
    }
    if (missing.every((slide) => slide.items.length >= CAROUSEL_ITEM_MAX)) {
      showErrorToast(CAROUSEL_ITEM_LIMIT_MESSAGE)
      return
    }
    dispatch({ type: "ADD_SLIDE_NUMBERS", item: createSlideNumberItem() })
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
        // New words, so bold and highlighted letters no longer point at
        // anything.
        patch: { text, marks: undefined },
      })
    } catch (error) {
      showErrorToast(getCarouselErrorMessage(error))
    } finally {
      setPolishing(false)
    }
  }

  function pasteLayers() {
    if (!selectedSlide || !clipboardRef.current.length) return
    const copied = clipboardRef.current
    const clips = copied.filter((item) => item.type === "video").length
    if (clips && (clips > 1 || slideHasVideo(selectedSlide))) {
      showErrorToast(ONE_VIDEO_PER_SLIDE_MESSAGE)
      return
    }
    if (selectedSlide.items.length + copied.length > CAROUSEL_ITEM_MAX) {
      showErrorToast(CAROUSEL_ITEM_LIMIT_MESSAGE)
      return
    }
    dispatch({
      type: "PASTE_ITEMS",
      slideId: selectedSlide.id,
      items: pastedLayers(copied, selectedSlide, state.format),
    })
  }

  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented) return
      // An open window, menu or popover owns the keys, so nothing behind it
      // moves, goes or is undone unseen.
      if (window.document.querySelector(OPEN_OVERLAY_SELECTOR)) return
      // While typing, the box's own undo handles the words being typed.
      if (isTextEntryTarget(event.target)) return
      const key = event.key.toLowerCase()
      const command = event.metaKey && !event.ctrlKey && !event.altKey

      // Cmd+Z undoes and Shift+Cmd+Z redoes. Control+Z is left alone:
      // Tyler's own keyboard setup uses it (19 Oct 2026).
      if (command && key === "z") {
        event.preventDefault()
        dispatch({ type: event.shiftKey ? "REDO" : "UNDO" })
        return
      }
      // Cmd+C copies the picked layers and Cmd+V pastes them onto whichever
      // slide is picked then, in the same place.
      if (command && !event.shiftKey && key === "c") {
        if (!selectedItems.length) return
        event.preventDefault()
        clipboardRef.current = selectedItems
        return
      }
      if (command && !event.shiftKey && key === "v") {
        if (!clipboardRef.current.length) return
        event.preventDefault()
        pasteLayers()
        return
      }
      if (!selectedSlideId || !selectedItems.length) return
      if (event.key === "Escape") {
        dispatch({ type: "SELECT_ITEM", itemId: null })
        return
      }

      const nudge = nudgeStep(event.key, event.shiftKey, state.format)
      if (nudge && !event.altKey && !event.ctrlKey && !event.metaKey) {
        const movable = selectedItems.filter((item) => !item.locked)
        if (!movable.length) return
        event.preventDefault()
        dispatch({
          type: "UPDATE_ITEMS",
          slideId: selectedSlideId,
          // A held arrow is one undo step: the first press keeps the place
          // it started from and the repeats only move the layer on.
          transient: event.repeat,
          patches: Object.fromEntries(
            movable.map((item) => [
              item.id,
              {
                x: clamp01(item.x + nudge.x, 1 - item.width),
                y: clamp01(item.y + nudge.y, 1 - item.height),
              },
            ])
          ),
        })
        return
      }

      if (event.key !== "Backspace" && event.key !== "Delete") return
      if (event.altKey || event.ctrlKey || event.metaKey) return
      event.preventDefault()
      dispatch({
        type: "DELETE_ITEMS",
        slideId: selectedSlideId,
        itemIds: selectedItems.map((item) => item.id),
      })
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  })

  const slideIndex = state.slides.findIndex((s) => s.id === selectedSlideId)

  const contextPanel = (
    <div data-screen-label="Panel" className="flex h-full min-h-0">
      <IconRail panel={panel} onSelect={setPanel} />
      <div className="flex min-w-0 flex-1 flex-col">
        <CarouselContextPanel
          carouselId={document.id}
          panel={panel}
          slide={selectedSlide}
          selectedItemIds={state.selectedItemIds}
          onSelectItem={(itemId, additive) =>
            dispatch({ type: "SELECT_ITEM", itemId, additive })
          }
          onUpdateItem={(itemId, patch) =>
            selectedSlide &&
            dispatch({
              type: "UPDATE_ITEM",
              slideId: selectedSlide.id,
              itemId,
              patch,
            })
          }
          onAddSlideNumbers={addSlideNumbers}
          mediaVersion={mediaVersion}
          onUpload={uploadPictures}
          slides={state.slides}
          format={state.format}
          textOverflow={textOverflow}
          selectedSlideId={state.selectedSlideId}
          onSelectSlide={(slideId) =>
            dispatch({ type: "SELECT_SLIDE", slideId })
          }
          onAddSlide={addSlide}
          onDuplicateSlide={duplicateSlide}
          onDeleteSlide={(slideId) =>
            dispatch({ type: "DELETE_SLIDE", slideId })
          }
          onMoveSlide={(slideId, toIndex) =>
            dispatch({ type: "MOVE_SLIDE", slideId, toIndex })
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
        onTranslate={() => setTranslateOpen(true)}
        onVersions={() => setVersionsOpen(true)}
        onExport={() => {
          setExportError(null)
          setExportOpen(true)
        }}
      />
      <div
        className={cn(
          "relative flex min-h-0 flex-1",
          !panelCollapsed && "studio-flat-stage-left",
          !inspectorCollapsed && "studio-flat-stage-right"
        )}
      >
        {selectedSlide ? (
          <CanvasStage
            slide={selectedSlide}
            slides={state.slides}
            slideIndex={slideIndex}
            format={state.format}
            selectedItemIds={state.selectedItemIds}
            onSelectItem={(itemId, additive) =>
              dispatch({ type: "SELECT_ITEM", itemId, additive })
            }
            onSelectSlide={(slideId) =>
              dispatch({ type: "SELECT_SLIDE", slideId })
            }
            onUpdateItems={(patches, transient) =>
              dispatch({
                type: "UPDATE_ITEMS",
                slideId: selectedSlide.id,
                patches,
                transient,
              })
            }
            onCommitHistory={(before) =>
              dispatch({ type: "COMMIT_HISTORY", before })
            }
            onUpdateFormat={(format) =>
              dispatch({ type: "UPDATE_FORMAT", format })
            }
            getSnapshot={() => currentSnapshot(state)}
            dropping={dropping}
            onDropPictures={(files, point) => void dropPictures(files, point)}
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
              isFirstSlide={slideIndex === 0}
              onSuggestFirstSlide={async (itemId) => {
                // Written from the saved slides, so they are saved first.
                await flushSave()
                return suggestFirstSlide(document.id, itemId)
              }}
              selectedItem={selectedItem}
              selectedCount={selectedItems.length}
              format={state.format}
              copyingTo={copyingTo}
              onCopyToFormat={(format) => void copyToFormat(format)}
              canPushLayout={state.slides.length > 1}
              onPushLayout={() => setPushOpen(true)}
              overflowItems={textOverflow.get(selectedSlide.id) ?? NO_ITEMS}
              onSelectItem={(itemId) =>
                dispatch({ type: "SELECT_ITEM", itemId })
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
              onDeletePicked={() =>
                dispatch({
                  type: "DELETE_ITEMS",
                  slideId: selectedSlide.id,
                  itemIds: state.selectedItemIds,
                })
              }
              onMovePicked={(direction) =>
                dispatch({
                  type: "MOVE_LAYERS",
                  slideId: selectedSlide.id,
                  itemIds: state.selectedItemIds,
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
      <div className="flex h-full min-h-0">{workspace}</div>

      <PhonePreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        slides={state.slides}
        caption={state.caption}
        format={state.format}
      />
      <CarouselExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        slideCount={state.slides.length}
        videoSlides={state.slides.filter(slideHasVideo).length}
        caption={state.caption}
        busy={exporting}
        writingCaption={writingCaption}
        error={exportError}
        onUpdateCaption={(caption) =>
          dispatch({ type: "UPDATE_CAPTION", caption })
        }
        onWriteCaption={() => void handleWriteCaption()}
        onExport={(kind, video) => void handleExport(kind, video)}
      />
      <TranslateCopiesDialog
        open={translateOpen}
        onOpenChange={setTranslateOpen}
        carouselId={document.id}
        beforeTranslate={flushSave}
      />
      <CarouselVersionsDialog
        open={versionsOpen}
        onOpenChange={setVersionsOpen}
        carouselId={document.id}
        beforeRestore={flushSave}
        // The editor opens again on the restored slides and their version.
        onRestored={() => window.location.reload()}
      />
      {selectedSlide ? (
        <PushLayoutDialog
          open={pushOpen}
          onOpenChange={setPushOpen}
          source={selectedSlide}
          slides={state.slides}
          format={state.format}
          onPush={pushLayout}
        />
      ) : null}
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
  onTranslate,
  onVersions,
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
  onTranslate: () => void
  onVersions: () => void
  onExport: () => void
}) {
  return (
    <DashboardCardHeader className="grid grid-cols-[1fr_auto_1fr]">
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
        <DropdownMenu>
          <Tooltip>
            <TooltipTrigger asChild>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="More for this carousel"
                >
                  <EllipsisIcon />
                </Button>
              </DropdownMenuTrigger>
            </TooltipTrigger>
            <TooltipContent>More</TooltipContent>
          </Tooltip>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuItem onSelect={onTranslate}>
              <LanguagesIcon />
              Copies in other languages
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onVersions}>
              <HistoryIcon />
              Earlier versions
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button type="button" variant="outline" onClick={onPreview}>
          <EyeIcon />
          Preview
        </Button>
        <Button type="button" onClick={onExport}>
          <DownloadIcon />
          Export
        </Button>
      </div>
    </DashboardCardHeader>
  )
}

// -------------------------------------------------------------- Rail --------

const RAIL: { id: StudioPanel; label: string; Icon: typeof TypeIcon }[] = [
  { id: "slides", label: "Slides", Icon: LayersIcon },
  { id: "layers", label: "Layers", Icon: ListTreeIcon },
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
  const { trackRef, trackProps, pillProps } = useRailPickedEdge<HTMLElement>()
  return (
    <nav
      ref={trackRef}
      {...trackProps}
      data-screen-label="Tool rail"
      aria-label="Carousel panels"
      className="relative flex w-16 shrink-0 flex-col items-center gap-1 border-r py-3"
    >
      <span {...pillProps} />
      {RAIL.map(({ id, label, Icon }) => {
        const on = panel === id
        return (
          <button
            key={id}
            type="button"
            aria-pressed={on}
            onClick={() => onSelect(id)}
            className={cn(
              "relative flex w-full flex-col items-center gap-1 py-2 transition-colors",
              on
                ? cn("text-foreground", railPickedEdge)
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
  slide,
  selectedItemIds,
  onSelectItem,
  onUpdateItem,
  onAddSlideNumbers,
  mediaVersion,
  onUpload,
  slides,
  format,
  textOverflow,
  selectedSlideId,
  onSelectSlide,
  onAddSlide,
  onDuplicateSlide,
  onDeleteSlide,
  onMoveSlide,
  onAddItem,
}: {
  carouselId: string
  panel: StudioPanel
  slide: CarouselSlide | undefined
  selectedItemIds: string[]
  onSelectItem: (itemId: string, additive: boolean) => void
  onUpdateItem: (itemId: string, patch: Partial<CarouselSlideItem>) => void
  onAddSlideNumbers: () => void
  mediaVersion: number
  onUpload: (files: File[]) => Promise<unknown>
  slides: CarouselSlide[]
  format: CarouselFormat
  textOverflow: ReadonlyMap<string, CarouselTextItem[]>
  selectedSlideId: string
  onSelectSlide: (slideId: string) => void
  onAddSlide: () => void
  onDuplicateSlide: (slideId: string) => void
  onDeleteSlide: (slideId: string) => void
  onMoveSlide: (slideId: string, toIndex: number) => void
  onAddItem: (item: CarouselSlideItem) => void
}) {
  const [slidesView, setSlidesView] = React.useState<"list" | "grid">("list")
  const currentPanel = RAIL.find((item) => item.id === panel) ?? RAIL[0]
  const PanelIcon = currentPanel.Icon

  // The Image panel puts search, its filter and + in the header, so it
  // draws the header itself.
  if (panel === "image") {
    return (
      <ImagePanel
        icon={<PanelIcon className="size-4" />}
        title={currentPanel.label}
        carouselId={carouselId}
        slide={slide}
        format={format}
        mediaVersion={mediaVersion}
        onUpload={onUpload}
        onAddItem={onAddItem}
      />
    )
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DashboardCardTitleHeader
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
              textOverflow={textOverflow}
              selectedSlideId={selectedSlideId}
              onSelectSlide={onSelectSlide}
              onAddSlide={onAddSlide}
              onDuplicateSlide={onDuplicateSlide}
              onDeleteSlide={onDeleteSlide}
              onMoveSlide={onMoveSlide}
            />
          ) : panel === "layers" ? (
            slide ? (
              <LayersPanelBody
                slide={slide}
                selectedItemIds={selectedItemIds}
                onSelectItem={onSelectItem}
                onUpdateItem={onUpdateItem}
              />
            ) : null
          ) : panel === "text" ? (
            <TextPanelBody
              format={format}
              onAddItem={onAddItem}
              onAddSlideNumbers={onAddSlideNumbers}
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
  textOverflow,
  selectedSlideId,
  onSelectSlide,
  onAddSlide,
  onDuplicateSlide,
  onDeleteSlide,
  onMoveSlide,
}: {
  view: "list" | "grid"
  slides: CarouselSlide[]
  format: CarouselFormat
  textOverflow: ReadonlyMap<string, CarouselTextItem[]>
  selectedSlideId: string
  onSelectSlide: (slideId: string) => void
  onAddSlide: () => void
  onDuplicateSlide: (slideId: string) => void
  onDeleteSlide: (slideId: string) => void
  onMoveSlide: (slideId: string, toIndex: number) => void
}) {
  const canDelete = slides.length > 1
  // A press has to travel 8px before it is a drag, so a click still picks the
  // slide. The grip on each slide moves it from the keyboard.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  const slideIds = slides.map((slide) => slide.id)

  function handleDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    const toIndex = slideIds.indexOf(String(over.id))
    if (toIndex !== -1) onMoveSlide(String(active.id), toIndex)
  }

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
    <DndContext
      // A fixed id: dnd-kit counts its own otherwise, and the server's count
      // and the browser's differ, which logged a hydration error on every load.
      id="carousel-slides"
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={slideIds} strategy={verticalListSortingStrategy}>
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
              count={slides.length}
              format={format}
              overflowing={textOverflow.has(slide.id)}
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
              count={slides.length}
              format={format}
              overflowing={textOverflow.has(slide.id)}
              selected={slide.id === selectedSlideId}
              canDelete={canDelete}
              onSelect={() => onSelectSlide(slide.id)}
              onDuplicate={() => onDuplicateSlide(slide.id)}
              onDelete={() => onDeleteSlide(slide.id)}
            />
          ))}
        </div>
      )}
      </SortableContext>

      {addButton}
    </DndContext>
  )
}

/**
 * One slide in the Slides list or grid, draggable to a new place. The whole
 * slide drags with a mouse or a finger; the grip is the keyboard's way in,
 * because Space and Enter on the slide itself still pick it.
 */
function useSortableSlide(slideId: string) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: slideId })
  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
    position: "relative",
    zIndex: isDragging ? 10 : undefined,
    opacity: isDragging ? 0.85 : undefined,
  }
  return {
    nodeProps: { ref: setNodeRef, style, ...listeners },
    gripProps: { ref: setActivatorNodeRef, ...attributes },
  }
}

const TEXT_OVERFLOW_LABEL = "text on it does not fit its box"

// A hover hint only: the slide's select button carries the same words for
// keyboards and screen readers.
function TextOverflowMark() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-hidden
          className="inline-grid size-4 flex-none place-items-center text-destructive"
        >
          <TriangleAlertIcon className="size-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent>
        Text on this slide does not fit its box, so the export cuts it off.
      </TooltipContent>
    </Tooltip>
  )
}

function SlideListRow({
  slide,
  index,
  count,
  format,
  overflowing,
  selected,
  canDelete,
  onSelect,
  onDuplicate,
  onDelete,
}: {
  slide: CarouselSlide
  index: number
  count: number
  format: CarouselFormat
  overflowing: boolean
  selected: boolean
  canDelete: boolean
  onSelect: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const thumbWidth = 46
  const thumbHeight = Math.round(thumbWidth / FORMAT_RATIOS[format])
  const { nodeProps, gripProps } = useSortableSlide(slide.id)

  return (
    <div
      {...nodeProps}
      style={{
        ...nodeProps.style,
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: 8,
        paddingLeft: 2,
        minWidth: 0,
        background: "var(--panel2)",
        border: `1px solid ${selected ? "var(--acc)" : "var(--line)"}`,
        borderRadius: 12,
        boxShadow: selected ? "0 0 0 2px var(--acc-soft)" : "none",
      }}
    >
      <button
        type="button"
        {...gripProps}
        aria-label={`Move slide ${index + 1}`}
        className="st-hovbg"
        style={{ ...slideRowIconBtn, ...gripStyle, width: 18 }}
      >
        <GripVerticalIcon size={14} />
      </button>
      <button
        type="button"
        onClick={onSelect}
        aria-label={
          overflowing
            ? `Select slide ${index + 1}, ${TEXT_OVERFLOW_LABEL}`
            : `Select slide ${index + 1}`
        }
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
          <StaticSlidePreview
            slide={slide}
            format={format}
            index={index}
            count={count}
          />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              fontSize: 11,
              fontWeight: 700,
              color: "var(--mut)",
            }}
          >
            {String(index + 1).padStart(2, "0")}
            {overflowing ? <TextOverflowMark /> : null}
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
  count,
  format,
  overflowing,
  selected,
  canDelete,
  onSelect,
  onDuplicate,
  onDelete,
}: {
  slide: CarouselSlide
  index: number
  count: number
  format: CarouselFormat
  overflowing: boolean
  selected: boolean
  canDelete: boolean
  onSelect: () => void
  onDuplicate: () => void
  onDelete: () => void
}) {
  const { nodeProps, gripProps } = useSortableSlide(slide.id)

  return (
    <div
      {...nodeProps}
      className="group"
    >
      <button
        type="button"
        onClick={onSelect}
        aria-label={
          overflowing
            ? `Select slide ${index + 1}, ${TEXT_OVERFLOW_LABEL}`
            : `Select slide ${index + 1}`
        }
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
        <StaticSlidePreview
            slide={slide}
            format={format}
            index={index}
            count={count}
          />
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
      {overflowing ? (
        <span className="absolute bottom-1.5 left-1.5 grid size-6 place-items-center rounded-md bg-background">
          <TextOverflowMark />
        </span>
      ) : null}
      <div className="absolute top-[5px] right-[5px] flex gap-[3px] opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <button
          type="button"
          {...gripProps}
          className="st-hovbright"
          aria-label={`Move slide ${index + 1}`}
          style={{ ...gridCardIconBtn, ...gripStyle }}
        >
          <GripVerticalIcon size={12} />
        </button>
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

// A finger on the grip drags at once instead of scrolling the list. Anywhere
// else on a slide, a finger still scrolls.
const gripStyle: React.CSSProperties = { cursor: "grab", touchAction: "none" }

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
  format,
  onAddItem,
  onAddSlideNumbers,
}: {
  format: CarouselFormat
  onAddItem: (item: CarouselSlideItem) => void
  onAddSlideNumbers: () => void
}) {
  // The person's own stickers, the same list as the video editor's. An emoji
  // lands as a text layer, a picture as a picture layer a third of the slide
  // wide, in the middle (workspace/docs/stickers.md).
  async function placeSticker(sticker: Sticker) {
    if (sticker.kind === "emoji") {
      onAddItem({
        ...createTextItem(),
        text: sticker.emoji,
        fontSize: 90,
        align: "center",
        y: 0.4,
        height: 0.2,
      })
      return
    }
    const natural = await naturalSize(sticker.url)
    const box = natural
      ? fitImageBox(natural.width, natural.height, format, STICKER_SHARE)
      : undefined
    onAddItem(createImageItem(sticker.url, sticker.name, sticker.mediaId, box))
  }

  return (
    <div>
      <StudioLabel>Slide number</StudioLabel>
      <div className="mb-5 grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => onAddItem(createSlideNumberItem())}
        >
          <HashIcon />
          This slide
        </Button>
        <Button type="button" variant="outline" onClick={onAddSlideNumbers}>
          <HashIcon />
          Every slide
        </Button>
      </div>

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
            <span
              style={{
                fontFamily: requireTextFont(preset.fontId).family,
                fontWeight: requireTextFont(preset.fontId).weight,
                fontSize: preset.previewSize,
              }}
            >
              {preset.label}
            </span>
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
      <StickerList onPlace={(sticker) => void placeSticker(sticker)} />
    </div>
  )
}

// -------------------------------------------------------- Image panel -------

function ImagePanel({
  icon,
  title,
  carouselId,
  slide,
  format,
  mediaVersion,
  onUpload,
  onAddItem,
}: {
  icon: React.ReactNode
  title: string
  carouselId: string
  slide: CarouselSlide | undefined
  format: CarouselFormat
  // Goes up whenever a file joins this carousel's shelf, from here or from a
  // drop on the canvas, so the list reads it again.
  mediaVersion: number
  onUpload: (files: File[]) => Promise<unknown>
  onAddItem: (item: CarouselSlideItem) => void
}) {
  const [search, setSearch] = React.useState("")
  const [debounced, setDebounced] = React.useState("")
  const [items, setItems] = React.useState<MediaItem[]>([])
  const [error, setError] = React.useState<string | null>(null)
  const [uploading, setUploading] = React.useState(false)
  const [dragOver, setDragOver] = React.useState(false)
  // Goes up when a Pexels photo joins the shelf from this panel.
  const [kept, setKept] = React.useState(0)
  const [searchOpen, setSearchOpen] = React.useState(false)
  // The filter menu's Collection row: "shelf" is this carousel's own
  // uploads; a collection's id lists that collection from the whole library.
  const [filter, setFilter] = React.useState<MediaFilterValue>(() =>
    emptyMediaFilter(CAROUSEL_MEDIA_FILTER)
  )
  const typesKey = filter.types.join(",")
  const [counts, setCounts] = React.useState<Record<string, number>>()
  const [creatingCollection, setCreatingCollection] = React.useState(false)
  const { collections, reload: reloadCollections } = useMediaCollections()
  const fileRef = React.useRef<HTMLInputElement>(null)
  // A collection deleted in another tab falls back to the shelf.
  const showing =
    filter.collection === "shelf" ||
    collections.some((item) => item.id === filter.collection)
      ? filter.collection
      : "shelf"

  React.useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 250)
    return () => clearTimeout(id)
  }, [search])

  React.useEffect(() => {
    let active = true
    const types = readMediaTypes(typesKey, CAROUSEL_MEDIA_FILTER.types) as (
      | "image"
      | "video"
    )[]
    const request =
      showing === "shelf"
        ? listVideoMedia({
            scope: { type: "carousel", id: carouselId },
            pageSize: 30,
            search: debounced || undefined,
            fileTypes: types.length ? types : ["image", "video"],
          }).then((data) => data.media)
        : listCollectionPictures(showing, debounced, types)
    request
      .then((media) => {
        if (!active) return
        setItems(media)
        setError(null)
      })
      .catch((caught) => {
        if (!active) return
        setError(getMediaErrorMessage(caught))
      })
    return () => {
      active = false
    }
  }, [carouselId, debounced, mediaVersion, showing, typesKey, kept])

  // The filter menu's numbers. Read again when the collections are, so a
  // file added to one in the video editor counts once this tab is looked at.
  React.useEffect(() => {
    let active = true
    const types = readMediaTypes(typesKey, CAROUSEL_MEDIA_FILTER.types) as (
      | "image"
      | "video"
    )[]
    loadCarouselMediaCounts(carouselId, debounced, types)
      .then((loaded) => {
        if (active) setCounts(loaded)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [carouselId, debounced, mediaVersion, typesKey, kept, collections])

  // A picture from a collection joins this carousel's shelf as it goes on a
  // slide, so it is there next time without the collection.
  function place(item: MediaItem, tile: HTMLElement) {
    const isVideo = item.file_type === "video"
    if (isVideo && slide && slideHasVideo(slide)) {
      showErrorToast(ONE_VIDEO_PER_SLIDE_MESSAGE)
      return
    }
    const media = tile.querySelector("img, video")
    const natural =
      media instanceof HTMLVideoElement
        ? { width: media.videoWidth, height: media.videoHeight }
        : media instanceof HTMLImageElement
          ? { width: media.naturalWidth, height: media.naturalHeight }
          : null
    const box =
      natural?.width && natural.height
        ? fitImageBox(natural.width, natural.height, format)
        : undefined
    onAddItem(
      createImageItem(
        item.url,
        item.original_name,
        item.id,
        box,
        isVideo ? "video" : "image"
      )
    )
    if (showing !== "shelf") {
      void attachEditorMedia({ type: "carousel", id: carouselId }, item.id).catch(
        (caught) => showErrorToast(getMediaErrorMessage(caught))
      )
    }
  }

  async function handleUpload(files: FileList | null) {
    if (!files?.length) return
    setUploading(true)
    setError(null)
    try {
      await onUpload(Array.from(files))
    } catch (caught) {
      setError(getMediaErrorMessage(caught))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DashboardCardTitleHeader
        icon={icon}
        title={title}
        action={
          <div className="flex items-center gap-2">
            <Popover open={searchOpen} onOpenChange={setSearchOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Search media"
                  title="Search media"
                  aria-pressed={searchOpen}
                >
                  <SearchIcon className={search ? "text-foreground" : undefined} />
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-60 p-2">
                <Input
                  autoFocus
                  type="search"
                  value={search}
                  placeholder="Search media"
                  aria-label="Search media"
                  onChange={(event) => setSearch(event.target.value)}
                />
              </PopoverContent>
            </Popover>
            <MediaFilterMenu
              kind={CAROUSEL_MEDIA_FILTER}
              baseRows={[{ id: "shelf", label: "This carousel" }]}
              value={{ ...filter, collection: showing }}
              onChange={setFilter}
              collections={collections}
              counts={counts}
              showClear={false}
              typeDivider
              onCollectionsChanged={reloadCollections}
              onNewCollection={() => setCreatingCollection(true)}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={uploading}
              aria-label="Upload image"
              title="Upload image"
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/mp4,video/quicktime,video/webm"
              multiple
              hidden
              onChange={(e) => {
                void handleUpload(e.target.files)
                e.target.value = ""
              }}
            />
          </div>
        }
      />

      <CollectionNameDialog
        open={creatingCollection}
        onOpenChange={setCreatingCollection}
        collection={null}
        onSaved={(created) => {
          toast.success(`Created “${created.name}”.`)
          reloadCollections()
        }}
      />

      <ScrollArea className="min-h-0 flex-1">
      <div className="p-4">
      {/* The drop box shows while the shelf is empty; files dropped on the
          canvas join the shelf too. */}
      {showing === "shelf" && !items.length && !search ? (
      <div
        className="st-hovcard"
        data-media-drop
        onClick={() => fileRef.current?.click()}
        onDragOver={(event) => {
          if (!hasFiles(event)) return
          event.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          if (!hasFiles(event)) return
          event.preventDefault()
          setDragOver(false)
          void handleUpload(event.dataTransfer.files)
        }}
        style={{
          border: `1.5px dashed ${dragOver ? "var(--acc)" : "var(--line2)"}`,
          borderRadius: 13,
          padding: "18px 12px",
          textAlign: "center",
          marginBottom: 18,
          background: dragOver ? "var(--elev)" : "var(--panel2)",
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
          PNG · JPG · WEBP · MP4 · MOV
        </div>
      </div>
      ) : null}

      {error ? (
        <div
          style={{ fontSize: 11.5, color: "var(--coral)", marginBottom: 12 }}
        >
          {error}
        </div>
      ) : null}

      <StudioLabel>
        {showing === "shelf"
          ? `This carousel · ${items.length}`
          : `${collections.find((item) => item.id === showing)?.name ?? "Collection"} · ${items.length}`}
      </StudioLabel>
      {/* 2-col masonry so each thumbnail keeps its own aspect ratio (no crop). */}
      <div style={{ columnCount: 2, columnGap: 10 }}>
        {items.map((item) => {
          const tile = (
            <button
              type="button"
              className="st-hovlift"
              onClick={(event) => place(item, event.currentTarget)}
              aria-label={
                showing === "shelf"
                  ? `Add ${item.original_name}, or right-click to delete`
                  : `Add ${item.original_name}`
              }
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
              {item.file_type === "video" ? (
                <span className="relative block">
                  <video
                    src={`${item.url}#t=0.1`}
                    muted
                    playsInline
                    preload="metadata"
                    style={{ display: "block", width: "100%", height: "auto" }}
                  />
                  <span className="absolute top-1.5 left-1.5 grid size-5 place-items-center rounded bg-black/60 text-white">
                    <FilmIcon className="size-3" />
                  </span>
                </span>
              ) : (
                <img
                  src={item.url}
                  alt=""
                  draggable={false}
                  style={{ display: "block", width: "100%", height: "auto" }}
                />
              )}
            </button>
          )
          // Deleting is for this carousel's own uploads. A collection's
          // pictures belong to the library, so they have no delete here.
          return showing === "shelf" ? (
            <EditorMediaContextMenu
              key={item.id}
              scope={{ type: "carousel", id: carouselId }}
              mediaId={item.id}
              mediaName={item.original_name}
              onDeleted={(mediaId) =>
                setItems((current) =>
                  current.filter((media) => media.id !== mediaId)
                )
              }
            >
              {tile}
            </EditorMediaContextMenu>
          ) : (
            <React.Fragment key={item.id}>{tile}</React.Fragment>
          )
        })}
      </div>
      {!items.length && !error ? (
        <div style={{ fontSize: 12, color: "var(--mut)", padding: "8px 2px" }}>
          {showing === "shelf"
            ? "No images yet. Import one to place it on the slide."
            : "Nothing in this collection yet."}
        </div>
      ) : null}

      <StudioLabel style={{ marginTop: 18 }}>Free photos</StudioLabel>
      <StockPhotoSearch
        carouselId={carouselId}
        onPlace={(picture, size) => {
          onAddItem(
            createImageItem(
              picture.url,
              picture.name,
              picture.id,
              fitImageBox(size.width, size.height, format)
            )
          )
          setKept((count) => count + 1)
        }}
      />
      </div>
      </ScrollArea>
    </div>
  )
}

// ------------------------------------------------------- Shadow panel -------

function ShadowPanelBody({
  onAddItem,
}: {
  onAddItem: (item: CarouselSlideItem) => void
}) {
  const [color, setColor] = React.useState(DEFAULT_GRADIENT_SHADOW_COLOR)
  const [opacity, setOpacity] = React.useState(DEFAULT_GRADIENT_SHADOW_OPACITY)

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
      <div style={{ marginBottom: 18 }}>
        <ColorField
          value={color}
          onChange={setColor}
          swatches={SHADOW_SWATCHES}
        />
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
        tint and strength. It drops in as a layer you can resize on the canvas.
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
  selectedItemIds,
  onSelectItem,
  onSelectSlide,
  onUpdateItems,
  onCommitHistory,
  onUpdateFormat,
  getSnapshot,
  dropping,
  onDropPictures,
}: {
  slide: CarouselSlide
  slides: CarouselSlide[]
  slideIndex: number
  format: CarouselFormat
  selectedItemIds: string[]
  onSelectItem: (itemId: string | null, additive?: boolean) => void
  onSelectSlide: (slideId: string) => void
  onUpdateItems: (
    patches: Record<string, Partial<CarouselSlideItem>>,
    transient?: boolean
  ) => void
  onCommitHistory: (before: Snapshot) => void
  onUpdateFormat: (format: CarouselFormat) => void
  getSnapshot: () => Snapshot
  dropping: boolean
  onDropPictures: (files: File[], point: { x: number; y: number }) => void
}) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const artboardRef = React.useRef<HTMLDivElement>(null)
  const dragRef = React.useRef<{
    mode: "move" | ResizeHandle | "crop"
    startX: number
    startY: number
    // Every layer the drag moves, as it was when the press began.
    items: CarouselSlideItem[]
    before: Snapshot
    moved: boolean
    // Where the pointer last was, so pressing or letting go of Alt can redo
    // the snap without waiting for the pointer to move.
    pointer?: { x: number; y: number }
    // For a crop drag: how many screen pixels the picture reaches past its
    // box across and down.
    spare?: { x: number; y: number }
  } | null>(null)
  // The picture whose crop is being moved, after a double-click on it.
  const [cropItemId, setCropItemId] = React.useState<string | null>(null)
  const [fileOver, setFileOver] = React.useState(false)
  const [guides, setGuides] = React.useState<{
    lines: SnapLine[]
    gaps: SnapGap[]
  }>(NO_GUIDES)
  const [guidesChoice, setGuidesChoice] = useRememberedChoice(
    GUIDES_STORAGE_KEY,
    "off",
    GUIDES_CHOICES
  )
  const guide = guidesChoice === "on" ? instagramGuide(format) : null
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
  const picked = new Set(selectedItemIds)
  const singlePicked =
    selectedItemIds.length === 1
      ? slide.items.find((item) => item.id === selectedItemIds[0])
      : undefined
  // Crop mode lasts while that picture alone stays picked.
  const croppingId =
    cropItemId && singlePicked?.id === cropItemId ? cropItemId : null
  // Picking anything else ends crop mode for good, so picking the picture
  // again later moves it rather than its crop.
  if (cropItemId && !croppingId) setCropItemId(null)

  React.useEffect(() => {
    if (!croppingId) return
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return
      event.preventDefault()
      setCropItemId(null)
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [croppingId])

  function startCrop(item: CarouselSlideItem) {
    if (!isMediaItem(item) || item.fit === "contain" || item.locked) return
    onSelectItem(item.id)
    setCropItemId(item.id)
  }

  function dropPoint(event: React.DragEvent<HTMLElement>) {
    const rect = artboardRef.current?.getBoundingClientRect()
    if (!rect || !rect.width || !rect.height) return { x: 0.5, y: 0.5 }
    return {
      x: clamp01((event.clientX - rect.left) / rect.width),
      y: clamp01((event.clientY - rect.top) / rect.height),
    }
  }

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
    mode: "move" | ResizeHandle
  ) {
    if (event.button !== 0) return
    event.stopPropagation()
    if (mode === "move" && croppingId === item.id && isMediaItem(item)) {
      // Dragging a picture in crop mode moves what shows inside its box.
      const media = event.currentTarget.querySelector("img, video")
      const natural =
        media instanceof HTMLVideoElement
          ? { width: media.videoWidth, height: media.videoHeight }
          : media instanceof HTMLImageElement
            ? { width: media.naturalWidth, height: media.naturalHeight }
            : { width: 0, height: 0 }
      const boxWidth = item.width * stageWidth
      const boxHeight = item.height * stageHeight
      const fill =
        natural.width && natural.height
          ? Math.max(boxWidth / natural.width, boxHeight / natural.height)
          : 0
      dragRef.current = {
        mode: "crop",
        startX: event.clientX,
        startY: event.clientY,
        items: [item],
        before: getSnapshot(),
        moved: false,
        spare: {
          x: fill ? natural.width * fill - boxWidth : 0,
          y: fill ? natural.height * fill - boxHeight : 0,
        },
      }
      event.currentTarget.setPointerCapture(event.pointerId)
      return
    }
    if (mode === "move" && croppingId && croppingId !== item.id) {
      setCropItemId(null)
    }
    let moving: CarouselSlideItem[]
    if (mode !== "move") {
      moving = [item]
    } else if (event.shiftKey) {
      // Shift adds the layer to the picked ones, or takes it back out. A
      // layer taken out is not dragged.
      onSelectItem(item.id, true)
      if (picked.has(item.id)) return
      moving = slide.items.filter(
        (candidate) => picked.has(candidate.id) || candidate.id === item.id
      )
    } else if (picked.has(item.id)) {
      moving = slide.items.filter((candidate) => picked.has(candidate.id))
    } else {
      onSelectItem(item.id)
      moving = [item]
    }
    dragRef.current = {
      mode,
      startX: event.clientX,
      startY: event.clientY,
      items: moving.filter((candidate) => !candidate.locked),
      before: getSnapshot(),
      moved: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePointerMove(event: React.PointerEvent<HTMLElement>) {
    const drag = dragRef.current
    if (!drag || !drag.items.length) return
    // A few pixels of slack, so a click never counts as a move.
    if (
      !drag.moved &&
      Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 3
    ) {
      return
    }
    drag.moved = true
    if (drag.mode === "crop") {
      const [item] = drag.items
      if (!isMediaItem(item) || !drag.spare) return
      // The picture follows the pointer, so dragging it right shows more of
      // its left side.
      const focus = (start: number | undefined, moved: number, spare: number) =>
        spare > 0.5 ? clamp01((start ?? 0.5) - moved / spare) : (start ?? 0.5)
      onUpdateItems(
        {
          [item.id]: {
            focusX: focus(item.focusX, event.clientX - drag.startX, drag.spare.x),
            focusY: focus(item.focusY, event.clientY - drag.startY, drag.spare.y),
          },
        },
        true
      )
      return
    }
    drag.pointer = { x: event.clientX, y: event.clientY }
    dragTo(drag, event.clientX, event.clientY, event.altKey)
  }

  function dragTo(
    drag: NonNullable<typeof dragRef.current>,
    clientX: number,
    clientY: number,
    altKey: boolean
  ) {
    if (drag.mode === "crop") return
    const dx = (clientX - drag.startX) / stageWidth
    const dy = (clientY - drag.startY) / stageHeight
    const movingIds = new Set(drag.items.map((item) => item.id))
    const others = slide.items.filter(
      (item) => !movingIds.has(item.id) && !item.hidden
    )
    // Alt switches snapping off, as it does on the video stage.
    const thresholdX = altKey ? 0 : snapThreshold(stageWidth)
    const thresholdY = altKey ? 0 : snapThreshold(stageHeight)

    if (drag.mode === "move") {
      const start = boundingBox(drag.items)
      const result = snapMove({
        box: {
          ...start,
          x: clamp01(start.x + dx, 1 - start.width),
          y: clamp01(start.y + dy, 1 - start.height),
        },
        others,
        thresholdX,
        thresholdY,
      })
      const shiftX = result.box.x - start.x
      const shiftY = result.box.y - start.y
      onUpdateItems(
        Object.fromEntries(
          drag.items.map((item) => [
            item.id,
            {
              x: clamp01(item.x + shiftX, 1 - item.width),
              y: clamp01(item.y + shiftY, 1 - item.height),
            },
          ])
        ),
        true
      )
      setGuides({ lines: result.lines, gaps: result.gaps })
      return
    }

    const [item] = drag.items
    const result = snapResize({
      box: item,
      handle: drag.mode,
      dx,
      dy,
      others,
      thresholdX,
      thresholdY,
      minSize: MIN_ITEM_SIZE,
    })
    onUpdateItems({ [item.id]: result.box }, true)
    setGuides({ lines: result.lines, gaps: [] })
  }

  // Pressing or letting go of Alt mid-drag lets go of the snap, or takes it
  // up again, on the spot, with the pointer held still.
  const redoSnap = React.useEffectEvent((event: KeyboardEvent) => {
    const drag = dragRef.current
    if (event.key !== "Alt" || !drag?.moved || !drag.pointer) return
    dragTo(drag, drag.pointer.x, drag.pointer.y, event.type === "keydown")
  })

  React.useEffect(() => {
    window.addEventListener("keydown", redoSnap)
    window.addEventListener("keyup", redoSnap)
    return () => {
      window.removeEventListener("keydown", redoSnap)
      window.removeEventListener("keyup", redoSnap)
    }
  }, [])

  function handlePointerUp(event: React.PointerEvent<HTMLElement>) {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag) return
    event.currentTarget.releasePointerCapture(event.pointerId)
    setGuides(NO_GUIDES)
    // A click that never moved is a pick, not an edit, and adds no undo step.
    if (drag.moved) onCommitHistory(drag.before)
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
        onPointerDown={() => {
          setCropItemId(null)
          onSelectItem(null)
        }}
      >
        <div
          ref={artboardRef}
          data-carousel-artboard
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
            setCropItemId(null)
            onSelectItem(null)
          }}
          onDragOver={(event) => {
            if (!hasFiles(event)) return
            event.preventDefault()
            setFileOver(true)
          }}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setFileOver(false)
            }
          }}
          onDrop={(event) => {
            if (!hasFiles(event)) return
            event.preventDefault()
            setFileOver(false)
            onDropPictures(Array.from(event.dataTransfer.files), dropPoint(event))
          }}
        >
          {slide.items
            .filter((item) => !item.hidden)
            .sort((a, b) => a.zIndex - b.zIndex)
            .map((item) => (
              <CanvasItem
                key={item.id}
                item={item}
                slideIndex={slideIndex}
                slideCount={slides.length}
                selected={picked.has(item.id)}
                resizable={
                  singlePicked?.id === item.id &&
                  !item.locked &&
                  croppingId !== item.id
                }
                cropping={croppingId === item.id}
                onDoubleClick={() => startCrop(item)}
                scale={scale}
                onPointerDown={(event) =>
                  handlePointerDown(event, item, "move")
                }
                onResizeDown={(event, handle) =>
                  handlePointerDown(event, item, handle)
                }
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
              />
            ))}
          {guide ? <InstagramGuideOverlay guide={guide} /> : null}
          <SnapGuides lines={guides.lines} gaps={guides.gaps} />
          {fileOver || dropping ? (
            <div
              aria-live="polite"
              className="pointer-events-none absolute inset-0 z-[1001] grid place-items-center bg-black/30 text-sm font-medium text-white"
            >
              {dropping ? "Uploading…" : "Drop to place on this slide"}
            </div>
          ) : null}
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
          maxWidth: "calc(100% - 380px)",
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

      <div
        style={{
          position: "absolute",
          top: 16,
          right: 20,
          display: "flex",
          alignItems: "center",
          gap: 8,
          zIndex: 10,
        }}
      >
        <GuidesToggle
          on={guidesChoice === "on"}
          format={format}
          onChange={(on) => setGuidesChoice(on ? "on" : "off")}
        />
        <FormatControl format={format} onChange={onUpdateFormat} />
        <ZoomControl
          pct={zoomPct}
          isFit={zoom === null}
          canZoomOut={scale > ZOOM_MIN}
          canZoomIn={scale < ZOOM_MAX}
          onZoomOut={() => zoomBy(1 / ZOOM_FACTOR)}
          onZoomIn={() => zoomBy(ZOOM_FACTOR)}
          onFit={() => setZoom(null)}
        />
      </div>

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
    <div style={canvasPill}>
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

const GUIDES_STORAGE_KEY = "video-carousel-instagram-guides"
const GUIDES_CHOICES = ["on", "off"] as const

// Shows where Instagram covers or cuts off this shape of slide. Remembered in
// this browser; the guides are never saved with the carousel.
function GuidesToggle({
  on,
  format,
  onChange,
}: {
  on: boolean
  format: CarouselFormat
  onChange: (on: boolean) => void
}) {
  const guide = instagramGuide(format)
  return (
    <div style={canvasPill}>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            className="st-hovbg"
            aria-pressed={on}
            aria-label={`Instagram guides: ${guide.label}`}
            onClick={() => onChange(!on)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              height: 28,
              padding: "0 10px",
              border: "none",
              background: on ? "var(--elev2)" : "transparent",
              borderRadius: 8,
              color: on ? "var(--ink)" : "var(--ink2)",
              fontSize: 12,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <ScanIcon size={14} />
            Guides
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-64">
          {guide.label}. {guide.note} Source: {guide.source}.
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

function InstagramGuideOverlay({ guide }: { guide: InstagramGuide }) {
  return (
    <div
      aria-hidden
      data-instagram-guide={guide.label}
      className="pointer-events-none absolute inset-0 z-[999]"
    >
      {guide.zones.map((zone, index) => (
        <div
          key={index}
          data-guide-zone
          className="absolute"
          style={{
            left: `${zone.x * 100}%`,
            top: `${zone.y * 100}%`,
            width: `${zone.width * 100}%`,
            height: `${zone.height * 100}%`,
            background:
              "repeating-linear-gradient(135deg, rgba(0,0,0,.34) 0 6px, rgba(0,0,0,.22) 6px 12px)",
          }}
        />
      ))}
    </div>
  )
}

// The carousel's shape. Layers move to suit by relayoutSlides, as one undo
// step (workspace/docs/carousel-shapes.md).
function FormatControl({
  format,
  onChange,
}: {
  format: CarouselFormat
  onChange: (format: CarouselFormat) => void
}) {
  return (
    <div role="group" aria-label="Format" style={canvasPill}>
      {CAROUSEL_FORMATS.map((option) => {
        const on = option === format
        return (
          <button
            key={option}
            type="button"
            className="st-hovbg"
            aria-pressed={on}
            onClick={() => onChange(option)}
            style={{
              height: 28,
              padding: "0 10px",
              border: "none",
              background: on ? "var(--elev2)" : "transparent",
              borderRadius: 8,
              color: on ? "var(--ink)" : "var(--ink2)",
              fontSize: 12,
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
              cursor: "pointer",
            }}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}

const canvasPill: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 2,
  padding: "4px 6px",
  background: "var(--panel)",
  border: "1px solid var(--line)",
  borderRadius: 13,
  boxShadow: "var(--sh)",
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
  slideIndex,
  slideCount,
  selected,
  resizable,
  cropping,
  onDoubleClick,
  scale,
  onPointerDown,
  onResizeDown,
  onPointerMove,
  onPointerUp,
}: {
  item: CarouselSlideItem
  slideIndex: number
  slideCount: number
  selected: boolean
  resizable: boolean
  cropping: boolean
  onDoubleClick: () => void
  scale: number
  onPointerDown: (event: React.PointerEvent<HTMLElement>) => void
  onResizeDown: (
    event: React.PointerEvent<HTMLElement>,
    handle: ResizeHandle
  ) => void
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
        outline: cropping
          ? "2px dashed var(--acc)"
          : selected
            ? "2px solid var(--acc)"
            : undefined,
        cursor: cropping ? "move" : undefined,
        // A locked layer lets a press through to whatever lies under it.
        pointerEvents: item.locked ? "none" : undefined,
      }}
      data-cropping={cropping || undefined}
      onDoubleClick={onDoubleClick}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <SlideLayerContent
        item={item}
        scale={scale}
        slideIndex={slideIndex}
        slideCount={slideCount}
        rounded
        play
      />
      {resizable
        ? RESIZE_HANDLES.map((handle) => (
            <button
              key={handle}
              type="button"
              onPointerDown={(event) => onResizeDown(event, handle)}
              // Only a pointer resizes; the keys move the layer instead.
              tabIndex={-1}
              aria-label={`Resize layer from the ${RESIZE_HANDLE_NAMES[handle]}`}
              style={{
                position: "absolute",
                ...resizeHandlePosition(handle),
                height: 13,
                width: 13,
                borderRadius: "50%",
                border: "1px solid var(--line2)",
                background: "var(--panel)",
                boxShadow: "var(--sh-sm)",
                cursor: RESIZE_CURSORS[handle],
                zIndex: 1,
              }}
            />
          ))
        : null}
    </div>
  )
}

const RESIZE_HANDLE_NAMES: Record<ResizeHandle, string> = {
  n: "top",
  s: "bottom",
  e: "right",
  w: "left",
  ne: "top right",
  nw: "top left",
  se: "bottom right",
  sw: "bottom left",
}

const RESIZE_CURSORS: Record<ResizeHandle, string> = {
  n: "ns-resize",
  s: "ns-resize",
  e: "ew-resize",
  w: "ew-resize",
  ne: "nesw-resize",
  sw: "nesw-resize",
  nw: "nwse-resize",
  se: "nwse-resize",
}

// Each handle sits on its side or corner, centred on the box's edge.
function resizeHandlePosition(handle: ResizeHandle): React.CSSProperties {
  const half = -7
  return {
    top: handle.includes("n")
      ? half
      : handle.includes("s")
        ? undefined
        : "calc(50% - 6.5px)",
    bottom: handle.includes("s") ? half : undefined,
    left: handle.includes("w")
      ? half
      : handle.includes("e")
        ? undefined
        : "calc(50% - 6.5px)",
    right: handle.includes("e") ? half : undefined,
  }
}

const OPEN_OVERLAY_SELECTOR = [
  '[role="dialog"][data-state="open"]',
  '[role="alertdialog"][data-state="open"]',
  '[role="menu"][data-state="open"]',
].join(",")

const NO_GUIDES = { lines: [] as SnapLine[], gaps: [] as SnapGap[] }

/**
 * The lines a dragged layer snapped to, across the whole slide, and the
 * equal gaps it was spaced at. Drawn in the accent colour on purpose: they
 * are a measuring overlay, not a dividing line.
 */
function SnapGuides({ lines, gaps }: { lines: SnapLine[]; gaps: SnapGap[] }) {
  if (!lines.length && !gaps.length) return null
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-[1000]">
      {lines.map((line) => (
        <div
          key={`${line.axis}-${line.at}`}
          data-snap-line={line.axis}
          className="absolute bg-[var(--acc)]"
          style={
            line.axis === "x"
              ? { left: `${line.at * 100}%`, top: 0, bottom: 0, width: 1 }
              : { top: `${line.at * 100}%`, left: 0, right: 0, height: 1 }
          }
        />
      ))}
      {gaps.map((gap, index) => (
        <div
          key={`${gap.axis}-${gap.from}-${index}`}
          data-snap-gap={gap.axis}
          className="absolute border-[var(--acc)]"
          style={
            gap.axis === "x"
              ? {
                  left: `${gap.from * 100}%`,
                  width: `${(gap.to - gap.from) * 100}%`,
                  top: `${gap.cross * 100}%`,
                  height: 0,
                  borderTopWidth: 1,
                  borderStyle: "dashed",
                }
              : {
                  top: `${gap.from * 100}%`,
                  height: `${(gap.to - gap.from) * 100}%`,
                  left: `${gap.cross * 100}%`,
                  width: 0,
                  borderLeftWidth: 1,
                  borderStyle: "dashed",
                }
          }
        />
      ))}
    </div>
  )
}

// --------------------------------------------------------- Inspector --------

function CarouselInspector({
  slide,
  isFirstSlide,
  onSuggestFirstSlide,
  selectedItem,
  selectedCount,
  format,
  copyingTo,
  onCopyToFormat,
  canPushLayout,
  onPushLayout,
  overflowItems,
  onSelectItem,
  onUpdateSlide,
  onUpdateItem,
  onDeletePicked,
  onMovePicked,
}: {
  slide: CarouselSlide
  isFirstSlide: boolean
  onSuggestFirstSlide: (itemId: string) => Promise<string[]>
  selectedItem: CarouselSlideItem | null
  selectedCount: number
  format: CarouselFormat
  copyingTo: CarouselFormat | null
  onCopyToFormat: (format: CarouselFormat) => void
  canPushLayout: boolean
  onPushLayout: () => void
  overflowItems: CarouselTextItem[]
  onSelectItem: (itemId: string) => void
  onUpdateSlide: (patch: Partial<CarouselSlide>) => void
  onUpdateItem: (itemId: string, patch: Partial<CarouselSlideItem>) => void
  onDeletePicked: () => void
  onMovePicked: (direction: 1 | -1) => void
}) {
  const title =
    selectedCount > 1 ? `${selectedCount} layers` : getInspectorTitle(selectedItem)

  return (
    <aside
      data-screen-label="Inspector"
      className="flex h-full min-h-0 flex-col"
    >
      <DashboardCardTitleHeader
        icon={<SlidersHorizontalIcon className="size-4" />}
        title={selectedCount ? title : "Inspector"}
        meta={slide.title || "Untitled slide"}
      />

      <ScrollArea className="min-h-0 flex-1">
        <div className="grid auto-rows-min gap-3 p-4">
          {selectedCount > 1 ? (
            <InspectorCard
              title={`${selectedCount} layers picked`}
              description="Drag any of them to move them together. Shift-click a layer to add it or take it out, Cmd+C and Cmd+V copy them, and the arrow keys nudge them."
            >
              <p className="text-sm text-muted-foreground">
                Pick one layer on its own to change how it looks.
              </p>
            </InspectorCard>
          ) : selectedItem ? (
            selectedItem.type === "text" ? (
              <TextInspector
                key={selectedItem.id}
                item={selectedItem}
                onSuggestFirstSlide={
                  isFirstSlide && selectedItem.text.trim()
                    ? () => onSuggestFirstSlide(selectedItem.id)
                    : undefined
                }
                overflowing={overflowItems.some(
                  (item) => item.id === selectedItem.id
                )}
                onUpdate={(patch) => onUpdateItem(selectedItem.id, patch)}
              />
            ) : selectedItem.type === "slide-number" ? (
              <SlideNumberInspector
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
                onUpdate={(patch) => onUpdateItem(selectedItem.id, patch)}
              />
            )
          ) : (
            <SlideInspector
              slide={slide}
              format={format}
              copyingTo={copyingTo}
              onCopyToFormat={onCopyToFormat}
              canPushLayout={canPushLayout}
              onPushLayout={onPushLayout}
              overflowItems={overflowItems}
              onSelectItem={onSelectItem}
              onUpdateSlide={onUpdateSlide}
            />
          )}

          {selectedCount ? (
            <LayerControls
              onBringForward={() => onMovePicked(1)}
              onSendBackward={() => onMovePicked(-1)}
              onDelete={onDeletePicked}
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
  if (selectedItem.type === "slide-number") return "Slide number"
  if (selectedItem.type === "image") return "Image"
  if (selectedItem.type === "gradient-shadow") return "Shadow"
  return "Media"
}

function SlideInspector({
  slide,
  format,
  copyingTo,
  onCopyToFormat,
  canPushLayout,
  onPushLayout,
  overflowItems,
  onSelectItem,
  onUpdateSlide,
}: {
  slide: CarouselSlide
  format: CarouselFormat
  copyingTo: CarouselFormat | null
  onCopyToFormat: (format: CarouselFormat) => void
  canPushLayout: boolean
  onPushLayout: () => void
  overflowItems: CarouselTextItem[]
  onSelectItem: (itemId: string) => void
  onUpdateSlide: (patch: Partial<CarouselSlide>) => void
}) {
  return (
    <>
      {overflowItems.length ? (
        <InspectorCard
          title="Text that does not fit"
          description="The export cuts these off. Make the box taller or the words smaller."
        >
          <ul className="grid gap-2">
            {overflowItems.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="flex items-start gap-2 rounded-sm text-left text-sm text-destructive hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  onClick={() => onSelectItem(item.id)}
                >
                  <TriangleAlertIcon className="mt-0.5 size-4 flex-none" />
                  <span className="min-w-0 break-words">
                    {textLayerName(item)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </InspectorCard>
      ) : null}
      <InspectorCard
        title="Slide"
        description="This slide's name and background, its layout on other slides, and copies of the carousel in other shapes."
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

        {canPushLayout ? (
          <div className="grid gap-2">
            <FieldLabel hint="Moves the layers on the slides you pick to where they sit here, with the same sizes, fonts and colours. Their words and pictures stay.">
              This slide's layout
            </FieldLabel>
            <Button type="button" variant="outline" onClick={onPushLayout}>
              <LayersIcon />
              Align all slides
            </Button>
          </div>
        ) : null}

        <div className="grid gap-2">
          <FieldLabel hint="Makes a new carousel in that shape with the layers moved to suit, and opens it. This one is not changed.">
            Make a copy in
          </FieldLabel>
          <div className="grid grid-cols-2 gap-2">
            {CAROUSEL_FORMATS.filter((option) => option !== format).map(
              (option) => (
                <Button
                  key={option}
                  type="button"
                  variant="outline"
                  aria-label={`Make a copy in ${option}`}
                  disabled={copyingTo !== null}
                  onClick={() => onCopyToFormat(option)}
                >
                  {copyingTo === option ? (
                    <Loader2Icon className="animate-spin" />
                  ) : (
                    <CopyIcon />
                  )}
                  {option}
                </Button>
              )
            )}
          </div>
        </div>

        <div className="grid gap-2">
          <FieldLabel>Background</FieldLabel>
          <ColorField
            value={slide.backgroundColor}
            onChange={(backgroundColor) => onUpdateSlide({ backgroundColor })}
            swatches={BACKGROUND_SWATCHES}
          />
        </div>
      </InspectorCard>
    </>
  )
}

// A text layer is named by its first words, since layers have no names.
function textLayerName(item: CarouselTextItem) {
  const words = item.text.trim().replace(/\s+/g, " ")
  return `Text "${words.length > 40 ? `${words.slice(0, 40)}...` : words}"`
}

function TextInspector({
  item,
  overflowing,
  onSuggestFirstSlide,
  onUpdate,
}: {
  item: CarouselTextItem
  overflowing: boolean
  /** Three other lines for this text; only on the first slide. */
  onSuggestFirstSlide?: () => Promise<string[]>
  onUpdate: (patch: Partial<CarouselTextItem>) => void
}) {
  const contentRef = React.useRef<HTMLTextAreaElement>(null)
  const [suggesting, setSuggesting] = React.useState(false)
  const [lines, setLines] = React.useState<string[] | null>(null)

  async function suggest() {
    if (!onSuggestFirstSlide) return
    setSuggesting(true)
    try {
      setLines(await onSuggestFirstSlide())
    } catch (error) {
      showErrorToast(getCarouselErrorMessage(error))
    } finally {
      setSuggesting(false)
    }
  }
  const [selection, setSelection] = React.useState({ start: 0, end: 0 })
  const marks = item.marks ?? []
  const hasHighlight = marks.some((mark) => mark.style === "highlight")

  function rememberSelection() {
    const node = contentRef.current
    if (node) setSelection({ start: node.selectionStart, end: node.selectionEnd })
  }

  function toggle(style: CarouselTextMarkStyle) {
    const node = contentRef.current
    const start = node ? node.selectionStart : selection.start
    const end = node ? node.selectionEnd : selection.end
    if (end <= start) {
      showErrorToast(
        `Select the words to make ${style === "bold" ? "bold" : "highlighted"} in Content first.`
      )
      return
    }
    const next = toggleMark(marks, start, end, style)
    onUpdate({ marks: next.length ? next : undefined })
    // The words stay selected, so the other button can go on too.
    requestAnimationFrame(() => {
      contentRef.current?.focus()
      contentRef.current?.setSelectionRange(start, end)
    })
  }

  return (
    <>
      <InspectorCard
        title="Text"
        description="The words and how they look on this slide."
      >
        {overflowing ? (
          <p
            role="status"
            className="flex items-start gap-2 text-sm text-destructive"
          >
            <TriangleAlertIcon className="mt-0.5 size-4 flex-none" />
            These words run past the box, so the export cuts off the end. Make
            the box taller or the words smaller.
          </p>
        ) : null}
        <div className="grid gap-2">
          <FieldLabel htmlFor={`carousel-text-${item.id}`}>Content</FieldLabel>
          <Textarea
            ref={contentRef}
            id={`carousel-text-${item.id}`}
            value={item.text}
            maxLength={2_000}
            rows={1}
            onSelect={rememberSelection}
            onChange={(event) => {
              const next = shiftMarks(item.text, event.target.value, marks)
              onUpdate({
                text: event.target.value,
                marks: next.length ? next : undefined,
              })
            }}
          />
        </div>

        <div className="grid gap-2">
          <FieldLabel hint="Select words in Content, then press Bold or Highlight. Press it again with the same words selected to take it off.">
            Words
          </FieldLabel>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["bold", "Bold", BoldIcon],
                ["highlight", "Highlight", HighlighterIcon],
              ] as const
            ).map(([style, label, Icon]) => {
              const on = hasMark(marks, selection.start, selection.end, style)
              return (
                <Button
                  key={style}
                  type="button"
                  variant={on ? "secondary" : "outline"}
                  aria-pressed={on}
                  // Pressing the button must not take the selection away
                  // from the words.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => toggle(style)}
                >
                  <Icon />
                  {label}
                </Button>
              )
            })}
          </div>
        </div>

        {onSuggestFirstSlide ? (
          <div className="grid gap-2">
            <FieldLabel hint="Three other ways to word this first slide, written by AI from the slides after it. Click one to use it; Undo puts the old words back.">
              A stronger first slide
            </FieldLabel>
            <Button
              type="button"
              variant="outline"
              disabled={suggesting}
              onClick={() => void suggest()}
            >
              {suggesting ? <Loader2Icon className="animate-spin" /> : <SparklesIcon />}
              {suggesting ? "Writing" : lines ? "Three more" : "Suggest three lines"}
            </Button>
            {lines ? (
              lines.length ? (
                <ul aria-label="Suggested first lines" className="grid gap-2">
                  {lines.map((line) => (
                    <li key={line}>
                      <button
                        type="button"
                        onClick={() => {
                          // New words, so the old bold or highlighted
                          // letters no longer point at anything.
                          onUpdate({ text: line, marks: undefined })
                          setLines(null)
                        }}
                        className="w-full rounded-md border p-2 text-left text-sm hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                      >
                        {line}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  The writer sent back nothing new. Try again.
                </p>
              )
            ) : null}
          </div>
        ) : null}

        {hasHighlight ? (
          <div className="grid gap-2">
            <FieldLabel>Highlight colour</FieldLabel>
            <ColorField
              value={item.highlightColor ?? DEFAULT_HIGHLIGHT_COLOR}
              onChange={(highlightColor) => onUpdate({ highlightColor })}
              swatches={HIGHLIGHT_SWATCHES}
            />
          </div>
        ) : null}

        <WordsLookFields item={item} onUpdate={onUpdate} />
      </InspectorCard>
      <TextBoxLookCard item={item} onUpdate={onUpdate} />
      <InspectorCard title="Position and size">
        <PositionFields item={item} onUpdate={onUpdate} />
      </InspectorCard>
    </>
  )
}

function SlideNumberInspector({
  item,
  onUpdate,
}: {
  item: CarouselSlideNumberItem
  onUpdate: (patch: Partial<CarouselSlideNumberItem>) => void
}) {
  return (
    <>
      <InspectorCard
        title="Slide number"
        description="Shows this slide's place and how many slides there are, such as 3/7. It changes by itself when slides move, come or go."
      >
        <WordsLookFields item={item} onUpdate={onUpdate} />
      </InspectorCard>
      <TextBoxLookCard item={item} onUpdate={onUpdate} />
      <InspectorCard title="Position and size">
        <PositionFields item={item} onUpdate={onUpdate} />
      </InspectorCard>
    </>
  )
}

// Font, size, colour and alignment, shared by text and slide numbers.
function WordsLookFields<T extends CarouselWordsItem>({
  item,
  onUpdate,
}: {
  item: T
  onUpdate: (patch: Partial<T>) => void
}) {
  return (
    <>
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
                onClick={() => onUpdate({ fontId: font.id } as Partial<T>)}
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
        onChange={(fontSize) => onUpdate({ fontSize } as Partial<T>)}
      />

      <div className="grid gap-2">
        <FieldLabel>Colour</FieldLabel>
        <ColorField
          value={item.color}
          onChange={(color) => onUpdate({ color } as Partial<T>)}
          swatches={TEXT_SWATCHES}
        />
      </div>

      <div className="grid gap-2">
        <FieldLabel>Alignment</FieldLabel>
        <SegRow
          columns={3}
          value={item.align}
          onChange={(align) => onUpdate({ align } as Partial<T>)}
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
    </>
  )
}

/**
 * Line and letter spacing, a box behind the words and a line round the
 * letters (workspace/docs/carousel-text-styles.md). Each switch adds its
 * colour with the first swatch, and taking it off clears the colour.
 */
function TextBoxLookCard<T extends CarouselWordsItem>({
  item,
  onUpdate,
}: {
  item: T
  onUpdate: (patch: Partial<T>) => void
}) {
  const update = (patch: Partial<CarouselWordsItem>) =>
    onUpdate(patch as Partial<T>)
  const outlineOn = Boolean(item.outlineColor && item.outlineWidth)

  return (
    <InspectorCard title="Box and spacing">
      <SliderField
        id={`carousel-line-height-${item.id}`}
        label="Line spacing"
        value={Math.round(lineHeightOf(item) * 100)}
        min={CAROUSEL_LINE_HEIGHT_RANGE.min * 100}
        max={CAROUSEL_LINE_HEIGHT_RANGE.max * 100}
        unit="%"
        onChange={(value) => update({ lineHeight: value / 100 })}
      />
      <SliderField
        id={`carousel-letter-spacing-${item.id}`}
        label="Letter spacing"
        value={Math.round(letterSpacingOf(item) * 100)}
        min={CAROUSEL_LETTER_SPACING_RANGE.min * 100}
        max={CAROUSEL_LETTER_SPACING_RANGE.max * 100}
        unit="%"
        onChange={(value) =>
          update({ letterSpacing: value === 0 ? undefined : value / 100 })
        }
      />

      <div className="flex items-center justify-between gap-3">
        <FieldLabel htmlFor={`carousel-text-box-${item.id}`}>
          Box behind the words
        </FieldLabel>
        <Switch
          id={`carousel-text-box-${item.id}`}
          checked={Boolean(item.boxColor)}
          onCheckedChange={(checked) =>
            update({ boxColor: checked ? TEXT_BOX_SWATCHES[0] : undefined })
          }
        />
      </div>
      {item.boxColor ? (
        <ColorField
          value={item.boxColor}
          onChange={(boxColor) => update({ boxColor })}
          swatches={TEXT_BOX_SWATCHES}
        />
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <FieldLabel htmlFor={`carousel-text-outline-${item.id}`}>
          Outline round the letters
        </FieldLabel>
        <Switch
          id={`carousel-text-outline-${item.id}`}
          checked={outlineOn}
          onCheckedChange={(checked) =>
            update(
              checked
                ? { outlineColor: TEXT_SWATCHES[1], outlineWidth: 4 }
                : { outlineColor: undefined, outlineWidth: undefined }
            )
          }
        />
      </div>
      {outlineOn ? (
        <>
          <ColorField
            value={item.outlineColor ?? TEXT_SWATCHES[1]}
            onChange={(outlineColor) => update({ outlineColor })}
            swatches={TEXT_SWATCHES}
          />
          <SliderField
            id={`carousel-outline-width-${item.id}`}
            label="Outline"
            value={item.outlineWidth ?? 0}
            min={1}
            max={CAROUSEL_OUTLINE_WIDTH_MAX}
            onChange={(outlineWidth) => update({ outlineWidth })}
          />
        </>
      ) : null}
    </InspectorCard>
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
      <InspectorCard title={item.type === "video" ? "Video" : "Picture"}>
        {/* Preview shows the source at its natural aspect ratio (full panel
          width, height follows it) rather than a fixed cropped box. */}
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
          {item.type === "video" ? (
            <video
              src={`${item.url}#t=0.1`}
              muted
              playsInline
              preload="metadata"
              aria-label={item.altText || "Video"}
              style={{ display: "block", width: "100%" }}
            />
          ) : (
            <img
              src={item.url}
              alt=""
              style={{ display: "block", width: "100%" }}
            />
          )}
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
        {item.fit !== "contain" ? (
          <div className="grid gap-4">
            <FieldLabel hint="Which part of the picture shows when it is cropped to its box. Double-click the picture on the slide and drag it to move it by hand; Escape ends that.">
              Crop position
            </FieldLabel>
            <SliderField
              id={`carousel-focus-x-${item.id}`}
              label="Left to right"
              value={Math.round((item.focusX ?? 0.5) * 100)}
              min={0}
              max={100}
              unit="%"
              onChange={(value) => onUpdate({ focusX: value / 100 })}
            />
            <SliderField
              id={`carousel-focus-y-${item.id}`}
              label="Top to bottom"
              value={Math.round((item.focusY ?? 0.5) * 100)}
              min={0}
              max={100}
              unit="%"
              onChange={(value) => onUpdate({ focusY: value / 100 })}
            />
          </div>
        ) : null}
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

// The preset swatches, then a native colour input for any other hex value
// (the OS picker).
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
  const options = swatches.map((swatch) => ({
    value: swatch,
    label: `Colour ${swatch}`,
  }))
  const known = options.some((option) => option.value === normalized)

  return (
    <div
      style={{
        display: "flex",
        gap: 9,
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      {options.map((option) => {
        const on = option.value === normalized
        return (
          <button
            key={option.value}
            type="button"
            aria-label={option.label}
            title={option.label}
            onClick={() => onChange(option.value)}
            style={{
              width: 32,
              height: 32,
              borderRadius: 9,
              cursor: "pointer",
              background: option.value,
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

// Picks the slides that take the source slide's layout. Every other slide
// starts ticked, and each row says how many of its layers will change.
function PushLayoutDialog({
  open,
  onOpenChange,
  source,
  slides,
  format,
  onPush,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  source: CarouselSlide
  slides: CarouselSlide[]
  format: CarouselFormat
  onPush: (targetSlideIds: string[]) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Align all slides</DialogTitle>
          <DialogDescription>
            Layers on the slides you pick move to where they sit on this slide
            and take its sizes, fonts and colours. Their words and pictures stay
            as they are.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <PushLayoutForm
            source={source}
            slides={slides}
            format={format}
            onCancel={() => onOpenChange(false)}
            onPush={onPush}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function PushLayoutForm({
  source,
  slides,
  format,
  onCancel,
  onPush,
}: {
  source: CarouselSlide
  slides: CarouselSlide[]
  format: CarouselFormat
  onCancel: () => void
  onPush: (targetSlideIds: string[]) => void
}) {
  const others = slides.flatMap((slide, index) =>
    slide.id === source.id ? [] : [{ slide, index }]
  )
  const [picked, setPicked] = React.useState(
    () => new Set(others.map(({ slide }) => slide.id))
  )
  const allPicked = picked.size === others.length
  const thumbWidth = 32
  const thumbHeight = Math.round(thumbWidth / FORMAT_RATIOS[format])

  function toggle(slideId: string, checked: boolean) {
    setPicked((current) => {
      const next = new Set(current)
      if (checked) next.add(slideId)
      else next.delete(slideId)
      return next
    })
  }

  return (
    <>
      <DialogBody>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Slides</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <label
              htmlFor="push-layout-all"
              className="flex items-center gap-3 text-sm font-medium"
            >
              <Checkbox
                id="push-layout-all"
                checked={
                  allPicked ? true : picked.size ? "indeterminate" : false
                }
                onCheckedChange={(checked) =>
                  setPicked(
                    checked === true
                      ? new Set(others.map(({ slide }) => slide.id))
                      : new Set()
                  )
                }
              />
              All other slides
            </label>
            <ul className="-mx-3 grid gap-3 border-t px-3 pt-4">
              {others.map(({ slide, index }) => {
                const matched = matchSlideLayers(source, slide).size
                const id = `push-layout-${slide.id}`
                return (
                  <li key={slide.id}>
                    <label
                      htmlFor={id}
                      className="flex min-w-0 items-center gap-3 text-sm"
                    >
                      <Checkbox
                        id={id}
                        checked={picked.has(slide.id)}
                        onCheckedChange={(checked) =>
                          toggle(slide.id, checked === true)
                        }
                      />
                      <span
                        aria-hidden
                        className="flex-none overflow-hidden rounded-sm border"
                        style={{ width: thumbWidth, height: thumbHeight }}
                      >
                        <StaticSlidePreview
                          slide={slide}
                          format={format}
                          index={index}
                          count={slides.length}
                        />
                      </span>
                      <span className="min-w-0 flex-1 truncate">
                        <span className="text-muted-foreground tabular-nums">
                          {String(index + 1).padStart(2, "0")}
                        </span>{" "}
                        {slide.title || "Untitled"}
                      </span>
                      <span className="flex-none text-xs text-muted-foreground">
                        {matched
                          ? `${matched} of ${slide.items.length} ${slide.items.length === 1 ? "layer" : "layers"} change`
                          : "No layers like this slide's"}
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </CardContent>
        </Card>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" onClick={() => onPush([...picked])}>
          <LayersIcon />
          {`Align ${picked.size} ${picked.size === 1 ? "slide" : "slides"}`}
        </Button>
      </DialogFooter>
    </>
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
    selectedItemIds: firstItemIds(slides[0]),
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
        selectedItemIds: firstItemIds(slide),
      }
    }
    case "SELECT_ITEM": {
      if (action.itemId === null) return { ...state, selectedItemIds: [] }
      if (!action.additive) {
        return { ...state, selectedItemIds: [action.itemId] }
      }
      const picked = state.selectedItemIds.includes(action.itemId)
      return {
        ...state,
        selectedItemIds: picked
          ? state.selectedItemIds.filter((id) => id !== action.itemId)
          : [...state.selectedItemIds, action.itemId],
      }
    }
    case "UPDATE_CAPTION":
      return withHistory(state, { ...state, caption: action.caption })
    case "UPDATE_FORMAT":
      if (action.format === state.format) return state
      return withHistory(state, {
        ...state,
        format: action.format,
        slides: relayoutSlides(state.slides, state.format, action.format),
      })
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
    case "UPDATE_ITEMS": {
      const next = {
        ...state,
        slides: state.slides.map((slide) =>
          slide.id === action.slideId
            ? {
                ...slide,
                items: slide.items.map((item) =>
                  action.patches[item.id]
                    ? ({ ...item, ...action.patches[item.id] } as CarouselSlideItem)
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
        selectedItemIds: firstItemIds(slide),
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
        selectedItemIds: firstItemIds(duplicate),
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
        selectedItemIds: firstItemIds(selectedSlide),
      })
    }
    case "MOVE_SLIDE": {
      // A drag in the Slides list. The picked slide and layer stay picked,
      // wherever they end up, and one Undo puts the order back.
      const from = state.slides.findIndex(
        (slide) => slide.id === action.slideId
      )
      const to = Math.min(
        state.slides.length - 1,
        Math.max(0, Math.round(action.toIndex))
      )
      if (from === -1 || from === to) return state
      const slides = [...state.slides]
      const [moved] = slides.splice(from, 1)
      slides.splice(to, 0, moved)
      return withHistory(state, { ...state, slides })
    }
    case "ADD_ITEM": {
      const slide = state.slides.find((item) => item.id === action.slideId)
      if (!slide || slide.items.length >= CAROUSEL_ITEM_MAX) return state
      return withHistory(state, {
        ...state,
        selectedItemIds: [action.item.id],
        slides: state.slides.map((slide) =>
          slide.id === action.slideId
            ? { ...slide, items: [...slide.items, action.item] }
            : slide
        ),
      })
    }
    case "ADD_SLIDE_NUMBERS": {
      const slides = state.slides.map((slide) =>
        slide.items.some((item) => item.type === "slide-number") ||
        slide.items.length >= CAROUSEL_ITEM_MAX
          ? slide
          : { ...slide, items: [...slide.items, { ...action.item, id: builderId() }] }
      )
      if (slides.every((slide, index) => slide === state.slides[index])) {
        return state
      }
      const picked = slides.find((slide) => slide.id === state.selectedSlideId)
      const added = picked?.items.find((item) => item.type === "slide-number")
      return withHistory(state, {
        ...state,
        slides,
        selectedItemIds: added ? [added.id] : state.selectedItemIds,
      })
    }
    case "PASTE_ITEMS": {
      // Pasted layers arrive picked, on the slide they were pasted onto.
      const slide = state.slides.find((item) => item.id === action.slideId)
      if (
        !slide ||
        !action.items.length ||
        slide.items.length + action.items.length > CAROUSEL_ITEM_MAX
      ) {
        return state
      }
      return withHistory(state, {
        ...state,
        selectedSlideId: slide.id,
        selectedItemIds: action.items.map((item) => item.id),
        slides: state.slides.map((candidate) =>
          candidate.id === slide.id
            ? { ...candidate, items: [...candidate.items, ...action.items] }
            : candidate
        ),
      })
    }
    case "DELETE_ITEMS": {
      if (!action.itemIds.length) return state
      const gone = new Set(action.itemIds)
      return withHistory(state, {
        ...state,
        selectedItemIds: state.selectedItemIds.filter((id) => !gone.has(id)),
        slides: state.slides.map((slide) =>
          slide.id === action.slideId
            ? { ...slide, items: slide.items.filter((item) => !gone.has(item.id)) }
            : slide
        ),
      })
    }
    case "MOVE_LAYERS": {
      if (!action.itemIds.length) return state
      const moving = new Set(action.itemIds)
      return withHistory(state, {
        ...state,
        slides: state.slides.map((slide) =>
          slide.id === action.slideId
            ? moveLayers(slide, moving, action.direction)
            : slide
        ),
      })
    }
    case "RESET_DEFAULTS":
      return withHistory(state, {
        ...state,
        slides: resetSlidesToDefaults(state.slides, state.selectedSlideId),
      })
    case "PUSH_LAYOUT": {
      const slides = pushSlideLayout(
        state.slides,
        action.sourceSlideId,
        new Set(action.targetSlideIds)
      )
      // Nothing matched, so there is nothing to undo either.
      if (slides.every((slide, index) => slide === state.slides[index])) {
        return state
      }
      return withHistory(state, { ...state, slides })
    }
    case "UNDO": {
      const previous = state.past[state.past.length - 1]
      if (!previous) return state
      return {
        ...state,
        ...previous,
        past: state.past.slice(0, -1),
        future: [currentSnapshot(state), ...state.future],
        selectedSlideId: previous.slides[0]?.id ?? state.selectedSlideId,
        selectedItemIds: [],
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
        selectedItemIds: [],
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

// "3/7" in a small grey line at the bottom right, readable on dark and light
// slides alike.
function createSlideNumberItem(): CarouselSlideNumberItem {
  return {
    id: builderId(),
    type: "slide-number",
    x: 0.7,
    y: 0.9,
    width: 0.24,
    height: 0.06,
    zIndex: DEFAULT_TEXT_Z_INDEX + 20,
    fontId: DEFAULT_TEXT_FONT_ID,
    fontSize: 36,
    color: "#9ca3af",
    align: "right",
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
  box?: { x: number; y: number; width: number; height: number },
  type: "image" | "video" = "image"
): CarouselMediaItem {
  // Placed as a centred, medium image (not full-bleed) so it doesn't blanket
  // the slide's text. `box` (from the image's natural aspect) keeps portrait
  // images portrait; without it, fall back to a centred landscape box. Use the
  // Fit → Fill control to make it a full-bleed background.
  const placement = box ?? { x: 0.15, y: 0.275, width: 0.7, height: 0.45 }
  return {
    id: builderId(),
    type,
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
  format: CarouselFormat,
  maxShare = 0.72
): { x: number; y: number; width: number; height: number } {
  const formatRatio = FORMAT_RATIOS[format]
  const aspect = naturalWidth / naturalHeight
  let width = maxShare
  let height = (width * formatRatio) / aspect
  if (height > maxShare) {
    height = maxShare
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

function firstItemIds(slide: CarouselSlide) {
  return slide.items[0] ? [slide.items[0].id] : []
}

function moveLayers(
  slide: CarouselSlide,
  itemIds: ReadonlySet<string>,
  direction: 1 | -1
): CarouselSlide {
  return {
    ...slide,
    items: slide.items.map((candidate) =>
      itemIds.has(candidate.id)
        ? {
            ...candidate,
            zIndex: Math.max(0, Math.min(999, candidate.zIndex + direction)),
          }
        : candidate
    ),
  }
}

// One press of an arrow moves the picked layers one pixel at full size, or
// ten with Shift held.
function nudgeStep(key: string, large: boolean, format: CarouselFormat) {
  const pixels = large ? 10 : 1
  const size = CAROUSEL_FRAME_SIZES[format]
  if (key === "ArrowLeft") return { x: -pixels / size.width, y: 0 }
  if (key === "ArrowRight") return { x: pixels / size.width, y: 0 }
  if (key === "ArrowUp") return { x: 0, y: -pixels / size.height }
  if (key === "ArrowDown") return { x: 0, y: pixels / size.height }
  return null
}

const DROP_PICTURES_ONLY_MESSAGE =
  "Only pictures and clips can go on a slide: PNG, JPG, WEBP, MP4, MOV or WEBM."
const ONE_VIDEO_PER_SLIDE_MESSAGE =
  "A slide can hold one video. Put the next clip on a slide of its own."

// The clip types the library takes (`VIDEO_MIME_TYPES`).
const SLIDE_VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"])

function slideFileKind(file: File) {
  if (file.type.startsWith("image/")) return "image"
  if (SLIDE_VIDEO_TYPES.has(file.type)) return "video"
  return null
}

function slideHasVideo(slide: CarouselSlide) {
  return slide.items.some((item) => item.type === "video")
}

function hasFiles(event: React.DragEvent) {
  return Array.from(event.dataTransfer.types).includes("Files")
}

/** A picture's or clip's own width and height, read by loading it, or null. */
function naturalSize(url: string, kind: "image" | "video" = "image") {
  return new Promise<{ width: number; height: number } | null>((resolve) => {
    if (kind === "video") {
      const video = window.document.createElement("video")
      video.preload = "metadata"
      video.muted = true
      video.onloadedmetadata = () =>
        resolve(
          video.videoWidth && video.videoHeight
            ? { width: video.videoWidth, height: video.videoHeight }
            : null
        )
      video.onerror = () => resolve(null)
      video.src = url
      return
    }
    const image = new Image()
    image.onload = () =>
      resolve(
        image.naturalWidth && image.naturalHeight
          ? { width: image.naturalWidth, height: image.naturalHeight }
          : null
      )
    image.onerror = () => resolve(null)
    image.src = url
  })
}

// How far a paste lands from layers it would sit exactly on top of, in
// pixels at full size, so the copy is seen.
const PASTE_OFFSET_PX = 20

/**
 * Copied layers as new layers for `slide`: new ids, unlocked, in the same
 * place, or a little down and right when the same layer is already there.
 */
function pastedLayers(
  copied: CarouselSlideItem[],
  slide: CarouselSlide,
  format: CarouselFormat
): CarouselSlideItem[] {
  const size = CAROUSEL_FRAME_SIZES[format]
  const covered = copied.some((item) =>
    slide.items.some(
      (existing) =>
        Math.abs(existing.x - item.x) < 1e-6 &&
        Math.abs(existing.y - item.y) < 1e-6
    )
  )
  const dx = covered ? PASTE_OFFSET_PX / size.width : 0
  const dy = covered ? PASTE_OFFSET_PX / size.height : 0
  return copied.map((item) => {
    const { locked: _locked, ...rest } = item
    return {
      ...rest,
      id: builderId(),
      x: clamp01(item.x + dx, 1 - item.width),
      y: clamp01(item.y + dy, 1 - item.height),
    } as CarouselSlideItem
  })
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

/**
 * Hands the kept ZIP, or its PDF, over as a download, the way the Exports
 * page does.
 */
function downloadKeptExport(exportId: string, name: string, pdf = false) {
  const link = window.document.createElement("a")
  link.href = `/api/v1/video/exports/${encodeURIComponent(exportId)}/file?${pdf ? "format=pdf&" : ""}filename=${encodeURIComponent(name)}`
  link.download = ""
  window.document.body.append(link)
  link.click()
  link.remove()
}

function builderId() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`
}
