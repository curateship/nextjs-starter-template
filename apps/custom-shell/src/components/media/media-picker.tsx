import * as React from "react"
import {
  ImageIcon,
  Loader2Icon,
  PlayIcon,
  UploadIcon,
  XIcon,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  ImageCropStep,
  type CropAspectKey,
} from "@/components/media/image-crop-step"
import { MediaThumbnail } from "@/components/media/media-thumbnail"
import { EmptyRow } from "@/components/shared/feed-card"
import { DashboardTablePagination } from "@/components/shared/dashboard-table"
import { DashboardToolbarSearch } from "@/components/shared/dashboard-toolbar"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ErrorBanner } from "@/components/ui/error-banner"
import { LoadingRow } from "@/components/ui/loading-row"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"
import { focusRing, focusRingInset } from "@/lib/focus-ring"
import { useAsyncAction } from "@/lib/use-async-action"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  getMediaErrorMessage,
  listMedia,
  uploadMedia,
  type MediaFileType,
  type MediaItem,
  type MediaListResponse,
} from "@/lib/api/media"
import { isCroppableImage } from "@/lib/crop-image"
import { formatFileSize } from "@/lib/format-bytes"
import { getMediaUploadError, mediaAccept } from "@/lib/media-upload"
import { quoteOneLine } from "@/lib/quote-text"
import { cn } from "@/lib/utils"

type MediaFilter = "all" | MediaFileType

type MediaPickerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectMedia: (mediaUrl: string, altText?: string) => void
  currentMediaUrl?: string
  showVideos?: boolean
  /** Renders as a step inside the owner window instead of a nested dialog. */
  inline?: boolean
  /** Which crop shape starts selected when an uploaded image is cropped. */
  defaultCropAspect?: CropAspectKey
}

export function MediaPicker({
  open,
  onOpenChange,
  onSelectMedia,
  currentMediaUrl,
  showVideos = true,
  defaultCropAspect,
  inline = false,
}: MediaPickerProps) {
  const [data, setData] = React.useState<MediaListResponse | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [searchQuery, setSearchQuery] = React.useState("")
  // What the server was last asked for. Kept apart from what is typed so the
  // box stays responsive while the request waits out the pause below.
  const [searchTerm, setSearchTerm] = React.useState("")
  const [selectedMedia, setSelectedMedia] = React.useState<MediaItem | null>(
    null
  )
  const [filterType, setFilterType] = React.useState<MediaFilter>("all")
  const [currentPage, setCurrentPage] = React.useState(1)
  const [upload, setUpload] = React.useState<{
    file: File
    previewUrl: string
  } | null>(null)
  /** A just-picked raster image waiting in the crop step before it uploads. */
  const [cropFile, setCropFile] = React.useState<{
    file: File
    previewUrl: string
  } | null>(null)
  const [altText, setAltText] = React.useState("")
  const [runUpload, uploading] = useAsyncAction(getMediaErrorMessage)
  /** The one video allowed to play at a time, so tiles never talk over each other. */
  const [playingId, setPlayingId] = React.useState<string | null>(null)
  const pageSize = 12

  // The preview points at the file rather than holding it: reading a 100MB
  // video into a data URL would cost well over 100MB of memory as text. A blob
  // address has to be handed back or the file stays in memory until reload.
  const previewUrl = upload?.previewUrl
  React.useEffect(() => {
    if (!previewUrl) return
    return () => URL.revokeObjectURL(previewUrl)
  }, [previewUrl])

  // The crop step's preview address follows the same rule. It is created in
  // the file-select handler, never during a render: a render can run more than
  // once, and a second run would leak addresses or revoke the one in use.
  const cropPreviewUrl = cropFile?.previewUrl
  React.useEffect(() => {
    if (!cropPreviewUrl) return
    return () => URL.revokeObjectURL(cropPreviewUrl)
  }, [cropPreviewUrl])

  const loadCurrentMedia = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const fileType = showVideos
        ? filterType === "all"
          ? undefined
          : filterType
        : "image"
      setData(
        await listMedia({
          page: currentPage,
          pageSize,
          search: searchTerm,
          fileType,
        })
      )
      setPlayingId(null)
    } catch (loadError) {
      setError(getMediaErrorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }, [currentPage, filterType, pageSize, searchTerm, showVideos])

  React.useEffect(() => {
    if (!open) {
      setCurrentPage(1)
      setSearchQuery("")
      setSearchTerm("")
      setSelectedMedia(null)
      setPlayingId(null)
      setCropFile(null)
      clearUpload()
      return
    }

    loadCurrentMedia()
  }, [loadCurrentMedia, open])

  // The same quarter-second pause the media library and notifications pages
  // use, so one request goes out per word rather than per letter. Opening the
  // picker is not delayed: only a change to what is typed starts the clock.
  React.useEffect(() => {
    const typed = searchQuery.trim()
    if (!open || typed === searchTerm) return

    const timer = setTimeout(() => {
      setCurrentPage(1)
      setSearchTerm(typed)
    }, 250)
    return () => clearTimeout(timer)
  }, [open, searchQuery, searchTerm])

  const mediaItems = React.useMemo(() => {
    // The server already holds the type filter and the search, so the only work
    // left is floating the file this field is already using to the front.
    if (!currentMediaUrl) return data?.media ?? []
    return [...(data?.media ?? [])].sort((a, b) => {
      if (a.url === currentMediaUrl) return -1
      if (b.url === currentMediaUrl) return 1
      return 0
    })
  }, [currentMediaUrl, data?.media])

  React.useEffect(() => {
    if (!open || selectedMedia || !currentMediaUrl) return

    const currentMedia = mediaItems.find((item) => item.url === currentMediaUrl)
    if (currentMedia) {
      setSelectedMedia(currentMedia)
    }
  }, [currentMediaUrl, mediaItems, open, selectedMedia])

  function clearUpload() {
    setUpload(null)
    setAltText("")
  }

  function handleFilterChange(value: string) {
    setFilterType(value as MediaFilter)
    setCurrentPage(1)
  }

  function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    const uploadError = getMediaUploadError(file, showVideos)
    if (uploadError) {
      showErrorToast(uploadError)
      event.target.value = ""
      return
    }

    dismissErrorToast()
    event.target.value = ""
    // Croppable images pause in the crop step first. Videos, SVGs, and GIFs
    // go straight to the upload panel — there is nothing a canvas could
    // faithfully crop there.
    if (isCroppableImage(file)) {
      setCropFile({ file, previewUrl: URL.createObjectURL(file) })
      return
    }
    stageUpload(file)
  }

  /** Puts a file in the upload panel, ready for alt text and the send. */
  function stageUpload(file: File) {
    setUpload({ file, previewUrl: URL.createObjectURL(file) })
    setAltText("")
  }

  async function handleUpload() {
    if (!upload) return

    await runUpload(async () => {
      const item = await uploadMedia(upload.file, altText)
      onSelectMedia(item.url, item.alt_text ?? undefined)
      clearUpload()
      onOpenChange(false)
    })
  }

  // An empty library and an empty filter are different things, so the message
  // names what is actually missing rather than saying "media" every time.
  const emptyKind =
    !showVideos || filterType === "image"
      ? "images"
      : filterType === "video"
        ? "videos"
        : "media"

  // Takes the item rather than reading the selection, so a double-click can
  // pick a tile in the same gesture that selects it.
  function chooseMedia(item: MediaItem) {
    onSelectMedia(item.url, item.alt_text ?? undefined)
    onOpenChange(false)
  }

  // While the crop step is up, Escape, the X, and the backdrop back out of
  // the crop and return to the picker instead of tearing the whole thing down.
  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && cropFile) {
      setCropFile(null)
      return
    }
    onOpenChange(nextOpen)
  }

  React.useEffect(() => {
    if (!inline || !open) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      event.preventDefault()
      event.stopPropagation()
      handleOpenChange(false)
    }
    document.addEventListener("keydown", handleKeyDown)
    return () => document.removeEventListener("keydown", handleKeyDown)
  }, [inline, open, cropFile])

  const pickerContent = (
    <>
        {cropFile ? (
          <ImageCropStep
            file={cropFile.file}
            previewUrl={cropFile.previewUrl}
            defaultAspect={defaultCropAspect}
            onDone={(file) => {
              stageUpload(file)
              setCropFile(null)
            }}
            onCancel={() => setCropFile(null)}
          />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>
                {showVideos ? "Select media" : "Select image"}
              </DialogTitle>
            </DialogHeader>

            <DialogBody>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2 sm:flex-row">
                  <DashboardToolbarSearch
                    className="min-w-0 sm:flex-1"
                    inputClassName="sm:w-full lg:w-full"
                    name="media-picker-search"
                    aria-label="Search media"
                    placeholder="Search media"
                    // The same cap the search takes on the way in, so the box can
                    // never hold more than what is actually being searched for.
                    maxLength={120}
                    value={searchQuery}
                    onChange={(event) => setSearchQuery(event.target.value)}
                  />

                  {showVideos ? (
                    <Select
                      value={filterType}
                      onValueChange={handleFilterChange}
                    >
                      <SelectTrigger
                        className="w-full sm:w-36"
                        aria-label="Media type filter"
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All</SelectItem>
                        <SelectItem value="image">Images</SelectItem>
                        <SelectItem value="video">Videos</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : null}

                  <Button asChild>
                    <label>
                      <input
                        type="file"
                        className="hidden"
                        accept={mediaAccept(showVideos)}
                        onChange={handleFileSelect}
                      />
                      <UploadIcon className="size-4" />
                      Upload
                    </label>
                  </Button>
                </div>

                {error ? (
                  <ErrorBanner
                    message={error}
                    onRetry={() => void loadCurrentMedia()}
                  />
                ) : null}

                {upload ? (
                  <form
                    onSubmit={(event) => {
                      event.preventDefault()
                      void handleUpload()
                    }}
                    className="rounded-lg border bg-muted/30 p-3"
                  >
                    <div className="flex gap-3">
                      <MediaThumbnail
                        url={upload.previewUrl}
                        fileType={
                          upload.file.type.startsWith("video/")
                            ? "video"
                            : "image"
                        }
                        alt={upload.file.name}
                        className="size-20 shrink-0 rounded-md bg-background"
                        compact
                      />
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {upload.file.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatFileSize(upload.file.size)}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            onClick={clearUpload}
                          >
                            <XIcon className="size-4" />
                            <span className="sr-only">Clear upload</span>
                          </Button>
                        </div>
                        <div className="grid gap-1.5">
                          <Label htmlFor="media-picker-alt-text">
                            {upload.file.type.startsWith("video/")
                              ? "Description"
                              : "Alt text"}
                          </Label>
                          <Input
                            id="media-picker-alt-text"
                            value={altText}
                            onChange={(event) => setAltText(event.target.value)}
                            placeholder="Optional"
                          />
                        </div>
                        <Button
                          type="submit"
                          disabled={uploading}
                        >
                          {uploading ? (
                            <Loader2Icon className="size-4 animate-spin" />
                          ) : (
                            <UploadIcon className="size-4" />
                          )}
                          Upload and select
                        </Button>
                      </div>
                    </div>
                  </form>
                ) : null}

                {/* No scroll box of its own: the dialog body is already a
                ScrollArea, and a second one would trap the wheel. */}
                <div className="min-h-64 rounded-lg border p-3">
                  {loading ? (
                    <LoadingRow label="Loading…" className="min-h-56" />
                  ) : mediaItems.length === 0 ? (
                    <EmptyRow className="grid min-h-56 place-items-center">
                      <div className="grid justify-items-center gap-3">
                        <ImageIcon className="size-10" />
                        {searchTerm ? (
                          <>
                            <p>Nothing matched {quoteOneLine(searchTerm)}.</p>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setSearchQuery("")}
                            >
                              Clear search
                            </Button>
                          </>
                        ) : (
                          <p>
                            No {emptyKind} yet. Upload a file to get started.
                          </p>
                        )}
                      </div>
                    </EmptyRow>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                      {mediaItems.map((item) => (
                        <MediaTile
                          key={item.id}
                          item={item}
                          selected={
                            selectedMedia?.id === item.id ||
                            currentMediaUrl === item.url
                          }
                          isCurrent={currentMediaUrl === item.url}
                          playing={playingId === item.id}
                          onSelect={() => setSelectedMedia(item)}
                          onChoose={() => chooseMedia(item)}
                          onPlay={() => {
                            setSelectedMedia(item)
                            setPlayingId(item.id)
                          }}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {data && data.total_pages > 1 ? (
                  <div className="overflow-hidden rounded-lg">
                    <DashboardTablePagination
                      page={currentPage}
                      pageSize={pageSize}
                      total={data.total}
                      totalPages={data.total_pages}
                      onPageChange={(page) =>
                        setCurrentPage(
                          Math.max(1, Math.min(page, data.total_pages))
                        )
                      }
                      pageSizeOptions={[pageSize]}
                    />
                  </div>
                ) : null}
              </div>
            </DialogBody>

            <DialogFooter>
              {currentMediaUrl ? (
                <Button
                  type="button"
                  variant="outline"
                  className="mr-auto"
                  onClick={() => {
                    onSelectMedia("")
                    onOpenChange(false)
                  }}
                >
                  Remove
                </Button>
              ) : null}
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button
                type="button"
                aria-invalid={!selectedMedia || undefined}
                onClick={() => {
                  if (!selectedMedia) {
                    showErrorToast("Choose a file before selecting it.")
                    return
                  }
                  chooseMedia(selectedMedia)
                }}
              >
                Select
              </Button>
            </DialogFooter>
          </>
        )}
    </>
  )

  return inline ? (
    open ? (
      <div className="grid gap-4 rounded-xl border bg-card p-4" data-media-picker-step="">
        {pickerContent}
      </div>
    ) : null
  ) : (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent variant="admin">{pickerContent}</DialogContent>
    </Dialog>
  )
}

/**
 * One item in the picker grid. One click selects, a double-click picks and
 * closes. Videos get a play button over the still frame so a clip can be
 * checked before it is chosen — pressing it selects the item as well, since
 * nobody plays a video they are not considering. The tile is a div with the
 * choose-this button filling it, because a play button inside a button is not
 * valid markup.
 */
function MediaTile({
  item,
  selected,
  isCurrent,
  playing,
  onSelect,
  onChoose,
  onPlay,
}: {
  item: MediaItem
  selected: boolean
  isCurrent: boolean
  playing: boolean
  onSelect: () => void
  onChoose: () => void
  onPlay: () => void
}) {
  return (
    <div
      className={cn(
        "group relative aspect-square overflow-hidden rounded-md border bg-muted transition",
        selected
          ? "border-primary ring-3 ring-primary/15"
          : "hover:border-muted-foreground/40"
      )}
    >
      {playing ? (
        <video
          src={item.url}
          className="h-full w-full object-contain"
          controls
          autoPlay
          playsInline
          preload="metadata"
        />
      ) : (
        <>
          <button
            type="button"
            className={cn(
              "block h-full w-full text-left",
              focusRingInset
            )}
            onClick={onSelect}
            onDoubleClick={onChoose}
            aria-pressed={selected}
            aria-label={`Select ${item.original_name}`}
          >
            <MediaThumbnail
              url={item.url}
              fileType={item.file_type}
              alt={item.alt_text ?? item.original_name}
              className="h-full w-full"
              showPlayBadge={false}
            />
          </button>
          {item.file_type === "video" ? (
            // Only the badge plays, so the rest of the tile still just picks.
            <button
              type="button"
              className={cn(
                "absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/60 p-2 transition hover:bg-foreground/80",
                focusRing
              )}
              onClick={onPlay}
              aria-label={`Play ${item.original_name}`}
            >
              <PlayIcon className="size-5 fill-background text-background" />
            </button>
          ) : null}
        </>
      )}
      {isCurrent ? (
        <Badge
          variant="secondary"
          className="pointer-events-none absolute top-2 right-2"
        >
          Current
        </Badge>
      ) : null}
    </div>
  )
}
