import * as React from "react"
import {
  ImageIcon,
  Loader2Icon,
  PlayIcon,
  SearchIcon,
  UploadIcon,
  VideoIcon,
  XIcon,
} from "lucide-react"

import { MediaGridSkeleton } from "@/components/loading-skeleton"
import { PrivateMediaImage } from "@/components/private-media-image"
import { Button } from "@/components/ui/button"
import {
  Dialog,
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
import {
  getMediaErrorMessage,
  listMedia,
  uploadMedia,
  type MediaFileType,
  type MediaItem,
  type MediaListResponse,
} from "@/lib/api/media"
import { cn } from "@/lib/utils"

const imageTypes = ["image/jpeg", "image/jpg", "image/png", "image/gif", "image/webp"]
const videoTypes = ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo", "video/x-matroska"]

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
  const [uploadFile, setUploadFile] = React.useState<File | null>(null)
  const [uploadPreview, setUploadPreview] = React.useState<string | null>(null)
  const [altText, setAltText] = React.useState("")
  const [uploading, setUploading] = React.useState(false)
  const pageSize = 12

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

  function clearUpload() {
    setUploadFile(null)
    setUploadPreview(null)
    setAltText("")
  }

  function handleFilterChange(value: string) {
    setFilterType(value as MediaFilter)
    setCurrentPage(1)
  }

  function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    const allowedTypes = showVideos ? [...imageTypes, ...videoTypes] : imageTypes
    if (!allowedTypes.includes(file.type)) {
      setError(
        showVideos
          ? "Invalid file type. Only images and videos are allowed."
          : "Invalid file type. Only JPEG, PNG, GIF, and WebP images are allowed."
      )
      event.target.value = ""
      return
    }

    const fileType = imageTypes.includes(file.type) ? "image" : "video"
    const maxSize = fileType === "image" ? 10 * 1024 * 1024 : 100 * 1024 * 1024
    if (file.size > maxSize) {
      setError(`File size too large. Maximum size is ${fileType === "image" ? "10MB" : "100MB"}.`)
      event.target.value = ""
      return
    }

    const reader = new FileReader()
    reader.onload = () => setUploadPreview(reader.result?.toString() ?? null)
    reader.readAsDataURL(file)
    setUploadFile(file)
    setAltText("")
    setError(null)
    event.target.value = ""
  }

  async function handleUpload() {
    if (!uploadFile) return

    setUploading(true)
    setError(null)
    try {
      const item = await uploadMedia(uploadFile, altText)
      onSelectMedia(item.url, item.alt_text ?? undefined)
      clearUpload()
      onOpenChange(false)
    } catch (uploadError) {
      setError(getMediaErrorMessage(uploadError))
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
      <DialogContent className="max-h-[85vh] gap-4 overflow-hidden sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{showVideos ? "Select Media" : "Select Image"}</DialogTitle>
        </DialogHeader>

        <div className="flex min-h-0 flex-col gap-4">
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
                  accept={
                    showVideos
                      ? [...imageTypes, ...videoTypes].join(",")
                      : imageTypes.join(",")
                  }
                  onChange={handleFileSelect}
                />
                <UploadIcon className="size-4" />
                Upload
              </label>
            </Button>
          </div>

          {error ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          {uploadFile ? (
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex gap-3">
                <div className="relative grid size-20 shrink-0 place-items-center overflow-hidden rounded-md bg-background">
                  {uploadPreview && uploadFile.type.startsWith("video/") ? (
                    <>
                      <video src={uploadPreview} className="h-full w-full object-contain" muted />
                      <PlayIcon className="absolute size-5 text-white drop-shadow" />
                    </>
                  ) : uploadPreview ? (
                    <img src={uploadPreview} alt="" className="h-full w-full object-contain" />
                  ) : (
                    <ImageIcon className="size-6 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{uploadFile.name}</p>
                      <p className="text-xs text-muted-foreground">{formatFileSize(uploadFile.size)}</p>
                    </div>
                    <Button type="button" variant="ghost" size="icon-sm" onClick={clearUpload}>
                      <XIcon className="size-4" />
                      <span className="sr-only">Clear upload</span>
                    </Button>
                  </div>
                  <div className="grid gap-1.5">
                    <Label htmlFor="media-picker-alt-text">
                      {uploadFile.type.startsWith("video/") ? "Description" : "Alt text"}
                    </Label>
                    <Input
                      id="media-picker-alt-text"
                      value={altText}
                      onChange={(event) => setAltText(event.target.value)}
                      placeholder="Optional"
                    />
                  </div>
                  <Button type="button" onClick={handleUpload} disabled={uploading}>
                    {uploading ? <Loader2Icon className="size-4 animate-spin" /> : <UploadIcon className="size-4" />}
                    {uploading ? "Uploading" : "Upload and select"}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

          <div className="min-h-[260px] overflow-y-auto rounded-lg border p-3">
            {loading ? (
              <MediaGridSkeleton count={8} />
            ) : mediaItems.length === 0 ? (
              <div className="grid h-56 place-items-center text-center text-sm text-muted-foreground">
                <div>
                  <ImageIcon className="mx-auto mb-3 size-10" />
                  <p>No media found.</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                {mediaItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={cn(
                      "group relative aspect-square overflow-hidden rounded-md border bg-muted text-left outline-none transition",
                      selectedMedia?.id === item.id
                        ? "border-primary ring-2 ring-primary/20"
                        : "hover:border-muted-foreground/40"
                    )}
                    onClick={() => setSelectedMedia(item)}
                  >
                    {item.file_type === "video" ? (
                      <div className="relative h-full w-full bg-black">
                        <video src={item.url} className="h-full w-full object-contain" muted preload="metadata" />
                        <VideoIcon className="absolute top-2 left-2 size-4 text-white drop-shadow" />
                      </div>
                    ) : (
                      <PrivateMediaImage
                        src={item.url}
                        alt={item.alt_text ?? item.original_name}
                        className="h-full w-full object-contain"
                      />
                    )}
                    {currentMediaUrl === item.url ? (
                      <span className="absolute top-2 right-2 rounded bg-background px-1.5 py-0.5 text-[10px] font-medium">
                        Current
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            )}
          </div>

          {data && data.total_pages > 1 ? (
            <div className="flex items-center justify-between gap-3 text-sm text-muted-foreground">
              <span>
                Page {data.page} of {data.total_pages}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={currentPage <= 1}
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={currentPage >= data.total_pages}
                  onClick={() => setCurrentPage((page) => page + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        <DialogFooter>
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

function formatFileSize(bytes: number) {
  if (bytes === 0) return "0 Bytes"
  const units = ["Bytes", "KB", "MB", "GB"]
  const index = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${parseFloat((bytes / 1024 ** index).toFixed(2))} ${units[index]}`
}
