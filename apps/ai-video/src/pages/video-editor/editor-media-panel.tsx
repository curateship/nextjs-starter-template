import * as React from "react"
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  ImageIcon,
  Loader2Icon,
  MusicIcon,
  PlusIcon,
  SearchIcon,
  SettingsIcon,
  UploadIcon,
  VideoIcon,
  XIcon,
  type LucideIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  FileUpload,
  FileUploadDropzone,
  FileUploadItem,
  FileUploadItemDelete,
  FileUploadItemMetadata,
  FileUploadItemPreview,
  FileUploadItemProgress,
  FileUploadList,
  FileUploadTrigger,
  useFileUpload,
} from "@/components/ui/file-upload"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  getMediaErrorMessage,
  listMedia,
  uploadMedia,
  type MediaItem,
  type MediaListResponse,
} from "@/lib/api/media"
import { EditorSettingsDialog } from "@/pages/video-editor/editor-settings-dialog"
import { ElementsPanel } from "@/pages/video-editor/editor-settings-panel"
import { useEditor, type EditorClip } from "@/pages/video-editor/editor-store"
import {
  DEFAULT_IMAGE_DURATION_MS,
  editorId,
  loadMediaDurationMs,
  pxToMs,
} from "@/pages/video-editor/timeline-utils"

type MediaTab = "videos" | "images" | "audio"

// Everything tab-specific in one table: dropdown entry, list filter, empty state.
const TAB_CONFIG: Record<
  MediaTab,
  {
    label: string
    fileType: "video" | "image" | "audio"
    icon: LucideIcon
    emptyMessage: string
  }
> = {
  videos: {
    label: "Videos",
    fileType: "video",
    icon: VideoIcon,
    emptyMessage: "No videos yet — upload one above",
  },
  images: {
    label: "Images",
    fileType: "image",
    icon: ImageIcon,
    emptyMessage: "No images yet — upload one above",
  },
  audio: {
    label: "Audio",
    fileType: "audio",
    icon: MusicIcon,
    emptyMessage: "No audio yet — upload a track above",
  },
}

const MEDIA_TABS = Object.keys(TAB_CONFIG) as MediaTab[]

// One shared upload control covers every media type the server accepts.
const UPLOAD_ACCEPT = "video/*,image/*,audio/*"
// Pointer-drag bookkeeping for dragging a library item onto the timeline.
type TileDrag = {
  item: MediaItem
  startX: number
  startY: number
  active: boolean
  ghost: HTMLDivElement | null
}

type UploadCallbacks = {
  onError?: (file: File, error: Error) => void
  onProgress?: (file: File, progress: number) => void
  onSuccess?: (file: File) => void
}

// Left panel: browser over the media library. Video/image/audio items add to
// the timeline by clicking (at the playhead) or dragging onto a track lane;
// each tab can also upload new files.
export function EditorMediaPanel({
  embedded = false,
}: {
  embedded?: boolean
} = {}) {
  // documentName is the project or template name (shown in the panel header).
  const {
    state,
    dispatch,
    clock,
    kind,
    documentId,
    documentName: projectName,
  } = useEditor()
  const projectId = kind === "project" ? documentId : undefined
  const [tab, setTab] = React.useState<MediaTab>("videos")
  const [settingsOpen, setSettingsOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  // Search lives in a popover so opening it never pushes the grid down.
  const [searchOpen, setSearchOpen] = React.useState(false)
  const [refresh, setRefresh] = React.useState(0)
  const [uploading, setUploading] = React.useState(false)
  // Add/upload failures, shown in place of nothing happening silently.
  const [actionError, setActionError] = React.useState<string | null>(null)
  const fileInputRef = React.useRef<HTMLInputElement>(null)
  const dragRef = React.useRef<TileDrag | null>(null)

  // Results/errors carry the tab they were fetched for, so switching tabs
  // falls back to the loading state without resetting state inside the effect.
  const [result, setResult] = React.useState<{
    tab: MediaTab
    data: MediaListResponse
  } | null>(null)
  const [loadError, setLoadError] = React.useState<{
    tab: MediaTab
    message: string
  } | null>(null)

  // Load fresh media whenever the tab changes or an upload finishes.
  React.useEffect(() => {
    let active = true
    listMedia({
      pageSize: 30,
      fileType: TAB_CONFIG[tab].fileType,
      projectId,
      source: projectId ? "upload" : undefined,
    })
      .then((response) => {
        if (active) {
          setResult({ tab, data: response })
          setLoadError(null)
        }
      })
      .catch((caught) => {
        if (active) {
          setLoadError({ tab, message: getMediaErrorMessage(caught) })
        }
      })
    return () => {
      active = false
    }
  }, [projectId, tab, refresh])

  const data = result?.tab === tab ? result.data : null
  const error = loadError?.tab === tab ? loadError.message : null

  // Client-side name filter over the fetched page (the list endpoint has no
  // search parameter; same approach as the media library page).
  const visibleMedia = React.useMemo(() => {
    const query = search.trim().toLowerCase()
    return (data?.media ?? []).filter((item) => {
      if (!query) return true
      return `${item.original_name} ${item.alt_text ?? ""}`
        .toLowerCase()
        .includes(query)
    })
  }, [data?.media, search])

  // Probe duration, build a clip, and place it in the store.
  async function addMediaItem(item: MediaItem, trackId?: string, atMs?: number) {
    try {
      setActionError(null)
      const clip = await buildMediaClip(item)
      dispatch({
        type: "ADD_CLIP",
        // In the template editor every media clip is a replaceable slot, so
        // videos built from the template can swap it (project clips are not).
        clip: kind === "template" ? { ...clip, replaceable: true } : clip,
        atMs: atMs ?? clock.getTime(),
        trackId,
      })
    } catch (caught) {
      setActionError(getMediaErrorMessage(caught))
    }
  }

  // --- Drag a tile onto a timeline lane -----------------------------------
  function handleTileDown(e: React.PointerEvent, item: MediaItem) {
    if (e.button !== 0) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = {
      item,
      startX: e.clientX,
      startY: e.clientY,
      active: false,
      ghost: null,
    }
  }

  function handleTileMove(e: React.PointerEvent) {
    const drag = dragRef.current
    if (!drag) return
    if (!drag.active) {
      // Small threshold so plain clicks don't spawn a ghost.
      if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 6) {
        return
      }
      drag.active = true
      drag.ghost = createDragGhost(drag.item.original_name)
    }
    if (drag.ghost) {
      drag.ghost.style.left = `${e.clientX + 12}px`
      drag.ghost.style.top = `${e.clientY + 12}px`
    }
  }

  function handleTileUp(e: React.PointerEvent, item: MediaItem) {
    const drag = dragRef.current
    dragRef.current = null
    if (!drag) return
    ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    drag.ghost?.remove()

    // Plain click: add at the current playhead position.
    if (!drag.active) {
      void addMediaItem(item)
      return
    }

    // Drop: add on the lane under the pointer, at the pointer's time.
    const lane = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest("[data-track-lane]") as HTMLElement | null
    if (!lane?.dataset.trackId) return // dropped outside the timeline
    const atMs = pxToMs(
      Math.max(0, e.clientX - lane.getBoundingClientRect().left),
      state.pxPerSecond
    )
    void addMediaItem(item, lane.dataset.trackId, atMs)
  }

  function handleTileCancel() {
    dragRef.current?.ghost?.remove()
    dragRef.current = null
  }

  // Closing the search also clears it so no hidden filter lingers.
  function handleSearchOpenChange(open: boolean) {
    setSearchOpen(open)
    if (!open) setSearch("")
  }

  // --- Shared upload (any media type) --------------------------------------
  async function uploadSelectedFile(file: File, callbacks: UploadCallbacks = {}) {
    setUploading(true)
    setActionError(null)
    callbacks.onProgress?.(file, 15)
    try {
      await uploadMedia(file, undefined, { projectId })
      callbacks.onProgress?.(file, 100)
      callbacks.onSuccess?.(file)
      // Jump to the uploaded file's tab so the new item is visible.
      setTab(getMediaTabForFile(file))
      setRefresh((count) => count + 1)
    } catch (caught) {
      const message = getMediaErrorMessage(caught)
      const error = new Error(message)
      setActionError(message)
      callbacks.onError?.(file, error)
    } finally {
      setUploading(false)
    }
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    await uploadSelectedFile(file)
  }

  async function handleDropzoneUpload(files: File[], callbacks: UploadCallbacks) {
    for (const file of files) {
      await uploadSelectedFile(file, callbacks)
    }
  }

  function handleDropzoneReject(file: File, message: string) {
    setActionError(`${file.name}: ${message}`)
  }

  const tileHandlers = (item: MediaItem) => ({
    onPointerDown: (e: React.PointerEvent) => handleTileDown(e, item),
    onPointerMove: handleTileMove,
    onPointerUp: (e: React.PointerEvent) => handleTileUp(e, item),
    onPointerCancel: handleTileCancel,
  })

  return (
    <section className="flex h-full w-full min-w-0 flex-col overflow-hidden rounded-xl bg-muted/60">
      <Tabs defaultValue="media" className="min-h-0 flex-1 gap-0">
        {/* Row 1: project name on the left, the Media/Elements switcher right. */}
        {!embedded ? (
          <div className="flex shrink-0 items-center gap-2 p-3 pb-2">
            <span
              className="min-w-0 flex-1 truncate text-sm font-semibold"
              title={projectName}
            >
              {projectName}
            </span>
            <TabsList className="shrink-0">
              <TabsTrigger value="media">Media</TabsTrigger>
              <TabsTrigger value="elements">Elements</TabsTrigger>
            </TabsList>
          </div>
        ) : null}

        {/* Media tab: the action controls (second row) over the library grid. */}
        <TabsContent value="media" className="flex min-h-0 flex-col">
          {/* Row 2: media-type dropdown + search/upload/settings icons. */}
          <div className="shrink-0 space-y-2 px-3 pb-2">
            <div className="flex items-center gap-1">
              {/* Media-type switch: a compact row of icon tabs (video / image
                  / audio). */}
              <Tabs
                value={tab}
                onValueChange={(value) => setTab(value as MediaTab)}
              >
                <TabsList>
                  {MEDIA_TABS.map((key) => {
                    const { label, icon: Icon } = TAB_CONFIG[key]
                    return (
                      <TabsTrigger key={key} value={key} aria-label={label}>
                        <Icon />
                      </TabsTrigger>
                    )
                  })}
                </TabsList>
              </Tabs>
              {/* Search / upload / settings — their own group, pinned right and
                  kept separate from the media-type filter. */}
              <div className="ml-auto flex items-center gap-1">
                <Popover open={searchOpen} onOpenChange={handleSearchOpenChange}>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      aria-label="Search media"
                      aria-pressed={searchOpen}
                    >
                      <SearchIcon />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-64 p-2">
                    <div className="relative">
                      <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        autoFocus
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="Search media..."
                        className="pl-8"
                        aria-label="Search media"
                      />
                    </div>
                  </PopoverContent>
                </Popover>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Upload media"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? (
                    <Loader2Icon className="animate-spin" />
                  ) : (
                    <UploadIcon />
                  )}
                </Button>
                {!embedded ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Settings"
                    onClick={() => setSettingsOpen(true)}
                  >
                    <SettingsIcon />
                  </Button>
                ) : null}
              </div>
            </div>
            {actionError && (
              <p className="text-xs text-destructive">{actionError}</p>
            )}
          </div>

          {/* Scrollable media list. Radix wraps content in an inline-styled
              display:table div that sizes to the tiles' intrinsic width — force
              it back to a block pinned to the panel width (! beats the inline
              style) so the columns stay constrained. */}
          <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:block! [&_[data-slot=scroll-area-viewport]>div]:w-full">
            <div className="p-3 pt-0">
            {error ? (
              <div className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-xs text-destructive">
                {error}
              </div>
            ) : !data ? (
              <div className="grid grid-cols-2 gap-2">
                {Array.from({ length: 6 }, (_, index) => (
                  <Skeleton key={index} className="aspect-video" />
                ))}
              </div>
            ) : visibleMedia.length === 0 ? (
              <MediaPanelEmpty
                tab={tab}
                searching={search.trim().length > 0}
                uploading={uploading}
                onFileReject={handleDropzoneReject}
                onUpload={handleDropzoneUpload}
              />
            ) : tab === "audio" ? (
              <div className="space-y-1.5">
                {visibleMedia.map((item) => (
                  <div
                    key={item.id}
                    className="flex cursor-grab touch-none items-center gap-2 rounded-md border bg-background p-2 select-none active:cursor-grabbing"
                    title="Click to add at the playhead, or drag onto the timeline"
                    {...tileHandlers(item)}
                  >
                    <MusicIcon className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-xs">
                      {item.original_name}
                    </span>
                    <PlusIcon className="size-3.5 shrink-0 text-muted-foreground" />
                  </div>
                ))}
              </div>
            ) : (
              // CSS columns give each tile its natural height (portrait reels
              // stay portrait) without same-row gaps a grid would leave.
              <div className="columns-2 gap-2">
                {visibleMedia.map((item) => (
                  <MediaThumbnail
                    key={item.id}
                    item={item}
                    handlers={tileHandlers(item)}
                  />
                ))}
              </div>
            )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Elements tab: the building-block tiles + their Add dialogs. */}
        {!embedded ? (
          <TabsContent
            value="elements"
            className="min-h-0 overflow-y-auto p-3 pt-1"
          >
            <ElementsPanel />
          </TabsContent>
        ) : null}
      </Tabs>

      <input
        ref={fileInputRef}
        type="file"
        accept={UPLOAD_ACCEPT}
        className="hidden"
        onChange={handleUpload}
      />
      {!embedded ? (
        <EditorSettingsDialog
          open={settingsOpen}
          onOpenChange={setSettingsOpen}
        />
      ) : null}
    </section>
  )
}

// Single grid tile: draggable/clickable to add, with a plus overlay on hover
// as the affordance.
function MediaThumbnail({
  item,
  handlers,
}: {
  item: MediaItem
  handlers: React.DOMAttributes<HTMLDivElement>
}) {
  return (
    <div className="mb-2 break-inside-avoid space-y-1">
      <div
        className="group relative min-h-10 cursor-grab touch-none overflow-hidden rounded-md border bg-muted select-none active:cursor-grabbing"
        title="Click to add at the playhead, or drag onto the timeline"
        {...handlers}
      >
        {item.file_type === "video" ? (
          <>
            <video
              src={item.url}
              className="block w-full"
              muted
              preload="metadata"
            />
            <VideoIcon className="absolute top-1.5 left-1.5 size-3.5 text-white drop-shadow" />
          </>
        ) : (
          <img
            src={item.url}
            alt={item.alt_text ?? item.original_name}
            className="block w-full"
            draggable={false}
          />
        )}
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
          <PlusIcon className="size-5 text-white" />
        </div>
      </div>
      <p className="truncate text-[11px] text-muted-foreground">
        {item.original_name}
      </p>
    </div>
  )
}

// Centered upload target for empty tabs; search misses stay compact.
function MediaPanelEmpty({
  onFileReject,
  onUpload,
  tab,
  searching,
  uploading,
}: {
  onFileReject: (file: File, message: string) => void
  onUpload: (files: File[], callbacks: UploadCallbacks) => Promise<void>
  tab: MediaTab
  searching: boolean
  uploading: boolean
}) {
  const { icon: EmptyIcon, label } = TAB_CONFIG[tab]

  if (searching) {
    return (
      <div className="flex h-full min-h-32 flex-col items-center justify-center gap-2 text-muted-foreground">
        <EmptyIcon className="size-5" />
        <p className="text-xs">No matches</p>
      </div>
    )
  }

  const mediaLabel = label.toLowerCase()

  return (
    <div className="flex h-full min-h-40 items-center justify-center">
      <EmptyMediaUpload
        accept={`${TAB_CONFIG[tab].fileType}/*`}
        browseLabel={`Browse ${mediaLabel}`}
        description={`Drag and drop ${mediaLabel} here, or browse from your computer.`}
        disabled={uploading}
        onFileReject={onFileReject}
        onUpload={onUpload}
        title={`Upload ${mediaLabel}`}
      />
    </div>
  )
}

function EmptyMediaUpload({
  accept,
  browseLabel,
  description,
  disabled,
  onFileReject,
  onUpload,
  title,
}: {
  accept: string
  browseLabel: string
  description: string
  disabled: boolean
  onFileReject: (file: File, message: string) => void
  onUpload: (files: File[], callbacks: UploadCallbacks) => Promise<void>
  title: string
}) {
  const [files, setFiles] = React.useState<File[]>([])

  return (
    <FileUpload
      accept={accept}
      className="w-full max-w-sm"
      disabled={disabled}
      label={title}
      maxFiles={1}
      onFileReject={onFileReject}
      onUpload={onUpload}
      onValueChange={setFiles}
      value={files}
    >
      <FileUploadDropzone className="min-h-40 bg-background/70 p-4">
        <div className="flex flex-col items-center gap-1 text-center">
          <div className="flex items-center justify-center rounded-full border p-2.5">
            <UploadIcon className="size-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <FileUploadTrigger asChild>
          <Button type="button" variant="outline" size="sm" className="mt-2">
            {browseLabel}
          </Button>
        </FileUploadTrigger>
      </FileUploadDropzone>
      <FileUploadList>
        {files.map((file) => (
          <EmptyMediaUploadItem key={`${file.name}-${file.lastModified}`} file={file} />
        ))}
      </FileUploadList>
    </FileUpload>
  )
}

function EmptyMediaUploadItem({ file }: { file: File }) {
  const fileState = useFileUpload((state) => state.files.get(file))
  const progress = fileState?.progress ?? 0
  const status = fileState?.status ?? "idle"

  return (
    <FileUploadItem value={file}>
      <FileUploadItemPreview />
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-center gap-2">
          <FileUploadItemMetadata size="sm" />
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
            {status === "success" ? (
              <CheckCircle2Icon className="size-4 text-green-600" />
            ) : status === "error" ? (
              <AlertCircleIcon className="size-4 text-destructive" />
            ) : (
              `${progress}%`
            )}
          </span>
        </div>
        <FileUploadItemProgress />
      </div>
      <FileUploadItemDelete asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="size-7"
          aria-label="Remove file"
        >
          <XIcon className="size-4" />
        </Button>
      </FileUploadItemDelete>
    </FileUploadItem>
  )
}

function getMediaTabForFile(file: File): MediaTab {
  if (file.type.startsWith("image/")) return "images"
  if (file.type.startsWith("audio/")) return "audio"
  return "videos"
}

// Floating chip that follows the pointer while dragging a library item.
// z-50 keeps the dragged item visible above everything it crosses.
function createDragGhost(name: string) {
  const ghost = document.createElement("div")
  ghost.className =
    "pointer-events-none fixed z-50 max-w-48 truncate rounded-md bg-primary px-2 py-1 text-xs text-primary-foreground shadow-md"
  ghost.textContent = name
  document.body.appendChild(ghost)
  return ghost
}

// mediaId -> probed duration; repeat adds of the same item skip the fetch.
const durationCache = new Map<string, Promise<number>>()

// Probe the media's intrinsic duration and build a timeline clip for it.
// Images have no source duration and get a fixed default length.
async function buildMediaClip(item: MediaItem): Promise<EditorClip> {
  if (item.file_type === "image") {
    return {
      id: editorId(),
      kind: "image",
      name: item.original_name,
      mediaId: item.id,
      url: item.url,
      trimStartMs: 0,
      startMs: 0, // the reducer resolves the actual placement
      durationMs: DEFAULT_IMAGE_DURATION_MS,
    }
  }

  const kind = item.file_type === "video" ? "video" : "audio"
  let pending = durationCache.get(item.id)
  if (!pending) {
    pending = loadMediaDurationMs(item.url, kind).catch((error) => {
      durationCache.delete(item.id) // allow a retry on the next add
      throw error
    })
    durationCache.set(item.id, pending)
  }
  const sourceDurationMs = await pending
  return {
    id: editorId(),
    kind,
    name: item.original_name,
    mediaId: item.id,
    url: item.url,
    sourceDurationMs,
    trimStartMs: 0,
    startMs: 0, // the reducer resolves the actual placement
    durationMs: sourceDurationMs,
  }
}
