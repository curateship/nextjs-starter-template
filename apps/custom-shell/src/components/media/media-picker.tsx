import * as React from "react"
import { ImageIcon, PlayIcon, SearchIcon, UploadIcon, XIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import { MediaThumbnail } from "@/components/media/media-thumbnail"
import { DashboardTablePagination } from "@/components/shared/dashboard-table"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { ErrorBanner } from "@/components/ui/error-banner"
import { dismissErrorToast, showErrorToast } from "@/lib/error-toast"
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
import { formatFileSize } from "@/lib/format-bytes"
import { getMediaUploadError, mediaAccept } from "@/lib/media-upload"
import { cn } from "@/lib/utils"

type MediaFilter = "all" | MediaFileType

type MediaPickerProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectMedia: (mediaUrl: string, altText?: string) => void
  currentMediaUrl?: string
  showVideos?: boolean
}

export function MediaPicker({
  open,
  onOpenChange,
  onSelectMedia,
  currentMediaUrl,
  showVideos = true,
}: MediaPickerProps) {
  const [data, setData] = React.useState<MediaListResponse | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [searchQuery, setSearchQuery] = React.useState("")
  const [selectedMedia, setSelectedMedia] = React.useState<MediaItem | null>(null)
  const [filterType, setFilterType] = React.useState<MediaFilter>("all")
  const [currentPage, setCurrentPage] = React.useState(1)
  const [upload, setUpload] = React.useState<{
    file: File
    previewUrl: string
  } | null>(null)
  const [altText, setAltText] = React.useState("")
  const [uploading, setUploading] = React.useState(false)
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

  const loadCurrentMedia = React.useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const fileType = showVideos
        ? filterType === "all"
          ? undefined
          : filterType
        : "image"
      setData(await listMedia({ page: currentPage, pageSize, fileType }))
      setPlayingId(null)
    } catch (loadError) {
      setError(getMediaErrorMessage(loadError))
    } finally {
      setLoading(false)
    }
  }, [currentPage, filterType, pageSize, showVideos])

  React.useEffect(() => {
    if (!open) {
      setCurrentPage(1)
      setSearchQuery("")
      setSelectedMedia(null)
      setPlayingId(null)
      clearUpload()
      return
    }

    loadCurrentMedia()
  }, [loadCurrentMedia, open])

  const mediaItems = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    return (data?.media ?? [])
      .filter((item) => {
        if (!showVideos && item.file_type === "video") return false
        if (!query) return true
        return `${item.original_name} ${item.filename} ${item.alt_text ?? ""}`
          .toLowerCase()
          .includes(query)
      })
      .sort((a, b) => {
        if (currentMediaUrl && a.url === currentMediaUrl) return -1
        if (currentMediaUrl && b.url === currentMediaUrl) return 1
        return 0
      })
  }, [currentMediaUrl, data?.media, searchQuery, showVideos])

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

    setUpload({ file, previewUrl: URL.createObjectURL(file) })
    setAltText("")
    dismissErrorToast()
    event.target.value = ""
  }

  async function handleUpload() {
    if (!upload) return

    setUploading(true)
    dismissErrorToast()
    try {
      const item = await uploadMedia(upload.file, altText)
      onSelectMedia(item.url, item.alt_text ?? undefined)
      clearUpload()
      onOpenChange(false)
    } catch (uploadError) {
      showErrorToast(getMediaErrorMessage(uploadError))
    } finally {
      setUploading(false)
    }
  }

  function handleSelectMedia() {
    if (!selectedMedia) return
    onSelectMedia(selectedMedia.url, selectedMedia.alt_text ?? undefined)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>{showVideos ? "Select Media" : "Select Image"}</DialogTitle>
        </DialogHeader>

        <DialogBody>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <SearchIcon className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Search media"
                  className="pl-9"
                />
              </div>

              {showVideos ? (
                <Select value={filterType} onValueChange={handleFilterChange}>
                  <SelectTrigger className="w-full sm:w-36">
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
              <div className="rounded-lg border bg-muted/30 p-3">
                <div className="flex gap-3">
                  <MediaThumbnail
                    url={upload.previewUrl}
                    fileType={
                      upload.file.type.startsWith("video/") ? "video" : "image"
                    }
                    alt={upload.file.name}
                    className="size-20 shrink-0 rounded-md bg-background"
                    compact
                  />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{upload.file.name}</p>
                        <p className="text-xs text-muted-foreground">{formatFileSize(upload.file.size)}</p>
                      </div>
                      <Button type="button" variant="ghost" size="icon-sm" onClick={clearUpload}>
                        <XIcon className="size-4" />
                        <span className="sr-only">Clear upload</span>
                      </Button>
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor="media-picker-alt-text">
                        {upload.file.type.startsWith("video/") ? "Description" : "Alt text"}
                      </Label>
                      <Input
                        id="media-picker-alt-text"
                        value={altText}
                        onChange={(event) => setAltText(event.target.value)}
                        placeholder="Optional"
                      />
                    </div>
                    <Button type="button" onClick={handleUpload} disabled={uploading}>
                      <UploadIcon className="size-4" />
                      Upload and select
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="min-h-[260px] overflow-y-auto rounded-lg border p-3">
              {loading ? null : mediaItems.length === 0 ? (
                <div className="grid h-56 place-items-center text-center text-sm text-muted-foreground">
                  <div>
                    <ImageIcon className="mx-auto mb-3 size-10" />
                    <p>No media found.</p>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                  {mediaItems.map((item) => (
                    <MediaTile
                      key={item.id}
                      item={item}
                      selected={
                        selectedMedia?.id === item.id || currentMediaUrl === item.url
                      }
                      isCurrent={currentMediaUrl === item.url}
                      playing={playingId === item.id}
                      onSelect={() => setSelectedMedia(item)}
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
                    setCurrentPage(Math.max(1, Math.min(page, data.total_pages)))
                  }
                  pageSizeOptions={[pageSize]}
                />
              </div>
            ) : null}
          </div>
        </DialogBody>

        <DialogFooter variant="plain">
          {currentMediaUrl ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                onSelectMedia("")
                onOpenChange(false)
              }}
            >
              Remove
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button type="button" disabled={!selectedMedia} onClick={handleSelectMedia}>
            Select
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * One item in the picker grid. Videos get a play button over the still frame so
 * a clip can be checked before it is chosen — pressing it selects the item as
 * well, since nobody plays a video they are not considering. The tile is a div
 * with the choose-this button filling it, because a play button inside a button
 * is not valid markup.
 */
function MediaTile({
  item,
  selected,
  isCurrent,
  playing,
  onSelect,
  onPlay,
}: {
  item: MediaItem
  selected: boolean
  isCurrent: boolean
  playing: boolean
  onSelect: () => void
  onPlay: () => void
}) {
  return (
    <div
      className={cn(
        "group relative aspect-square overflow-hidden rounded-md border bg-muted transition",
        selected
          ? "border-green-500 ring-2 ring-green-500/20"
          : "hover:border-muted-foreground/40"
      )}
    >
      {playing ? (
        <video
          src={item.url}
          className="h-full w-full bg-black object-contain"
          controls
          autoPlay
          playsInline
          preload="metadata"
        />
      ) : (
        <>
          <button
            type="button"
            className="block h-full w-full text-left outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
            onClick={onSelect}
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
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2 outline-none transition hover:bg-black/75 focus-visible:ring-2 focus-visible:ring-ring"
              onClick={onPlay}
              aria-label={`Play ${item.original_name}`}
            >
              <PlayIcon className="size-5 fill-white text-white" />
            </button>
          ) : null}
        </>
      )}
      {isCurrent ? (
        <span className="pointer-events-none absolute top-2 right-2 rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-medium text-green-700 dark:bg-green-950 dark:text-green-300">
          Current
        </span>
      ) : null}
    </div>
  )
}
