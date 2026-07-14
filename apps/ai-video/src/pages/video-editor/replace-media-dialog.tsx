import * as React from "react"
import {
  AlertCircleIcon,
  ImageIcon,
  Loader2Icon,
  MusicIcon,
  PlusIcon,
  SearchIcon,
  UploadIcon,
  VideoIcon,
} from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  getMediaErrorMessage,
  listMedia,
  uploadMedia,
  type MediaItem,
} from "@/lib/api/media"
import { useEditorRuntime } from "@/pages/video-editor/editor-store"
import { loadMediaDurationMs } from "@/pages/video-editor/timeline-utils"

// Payload handed back to the timeline's REPLACE_CLIP_MEDIA action.
export type ReplacementMedia = {
  mediaId: string
  url: string
  name: string
  fileType: "video" | "image" | "audio"
  sourceDurationMs: number
}

// CapCut-style slot replacement picker. A visual slot (video/image clip) swaps
// between videos and images; an audio slot swaps audio tracks. Either way the
// slot keeps its position/length. `clipKind` is the kind of the slot being
// replaced — audio slots only accept audio, so the type toggle is hidden.
export function ReplaceMediaDialog({
  clipKind,
  open,
  onOpenChange,
  onReplace,
}: {
  clipKind: "video" | "image" | "audio"
  open: boolean
  onOpenChange: (open: boolean) => void
  onReplace: (media: ReplacementMedia) => void
}) {
  const { kind, documentId } = useEditorRuntime()
  const projectId = kind === "project" ? documentId : undefined
  const isAudioSlot = clipKind === "audio"
  const [items, setItems] = React.useState<MediaItem[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  // Tile currently probing its duration before handing back the selection.
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [uploading, setUploading] = React.useState(false)
  // Audio slots are locked to audio; visual slots toggle video/image.
  const [mediaType, setMediaType] = React.useState<"video" | "image" | "audio">(
    isAudioSlot ? "audio" : "video"
  )
  const [search, setSearch] = React.useState("")
  const [debouncedSearch, setDebouncedSearch] = React.useState("")
  const [searchOpen, setSearchOpen] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    const timeout = window.setTimeout(() => {
      setDebouncedSearch(search.trim())
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [search])

  // (Re)load the library when the dialog opens or the media type changes. The
  // previous list stays visible until the fresh one lands.
  React.useEffect(() => {
    if (!open) return
    let active = true

    listMedia({
      fileTypes: [mediaType],
      pageSize: 100,
      projectId,
      search: debouncedSearch || undefined,
      source: projectId ? "upload" : undefined,
    })
      .then((data) => {
        if (!active) return
        setItems(data.media)
        setError(null)
      })
      .catch((loadError) => {
        if (!active) return
        setError(getMediaErrorMessage(loadError))
      })

    return () => {
      active = false
    }
  }, [debouncedSearch, open, mediaType, projectId])

  // Timed media (video/audio) needs its intrinsic length to clamp the slot;
  // images fill any duration, so skip the probe for them.
  async function selectMedia(item: MediaItem) {
    setBusyId(item.id)
    setError(null)
    try {
      const fileType =
        item.file_type === "image"
          ? "image"
          : item.file_type === "audio"
            ? "audio"
            : "video"
      const mediaUrl = item.proxy_url ?? item.url
      const sourceDurationMs =
        fileType === "image" ? 0 : await loadMediaDurationMs(mediaUrl, fileType)
      onReplace({
        mediaId: item.id,
        url: mediaUrl,
        name: item.original_name,
        fileType,
        sourceDurationMs,
      })
    } catch (selectError) {
      setError(getMediaErrorMessage(selectError))
    } finally {
      setBusyId(null)
    }
  }

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = "" // allow re-selecting the same file later
    if (!file) return

    const selectedType = mediaTypeForMime(file.type)
    const expectedMediaLabel = mediaTypeLabel(mediaType)
    if (selectedType !== mediaType) {
      setError(`Choose ${expectedMediaLabel} for this slot.`)
      return
    }

    setUploading(true)
    setError(null)
    try {
      const uploaded = await uploadMedia(file, undefined, { projectId })
      if (uploaded.file_type !== mediaType) {
        setError(`Uploaded file must be ${expectedMediaLabel}.`)
        return
      }
      await selectMedia(uploaded)
    } catch (uploadError) {
      setError(getMediaErrorMessage(uploadError))
    } finally {
      setUploading(false)
    }
  }

  // Closing the search also clears it so no hidden filter lingers.
  function handleSearchOpenChange(next: boolean) {
    setSearchOpen(next)
    if (!next) setSearch("")
  }

  const filtered = items ?? []
  const typeLabel =
    mediaType === "video"
      ? "videos"
      : mediaType === "audio"
        ? "audio"
        : "images"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader className="pb-4">
          {/* pb-4 here (not the body's pt) is the
          gap that PERSISTS below the sticky header — the body's top padding
          scrolls away with the grid. */}
          {/* Title and controls on ONE row — the controls sit beside the title
              in the sticky header so they stay put while the grid scrolls. pr-8
              keeps them clear of the absolute close (X) button. Visual slots
              toggle video/image; an audio slot only accepts audio. */}
          <div className="flex items-center gap-3 pr-8">
            <DialogTitle>
              {isAudioSlot ? "Replace Audio" : "Replace Clip"}
            </DialogTitle>
            <div className="flex items-center gap-1">
              {isAudioSlot ? null : (
                <Select
                  value={mediaType}
                  onValueChange={(value) =>
                    setMediaType(value as "video" | "image")
                  }
                >
                  <SelectTrigger aria-label="Media type" className="w-auto">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="video">
                      <VideoIcon className="size-4 text-muted-foreground" />
                      Videos
                    </SelectItem>
                    <SelectItem value="image">
                      <ImageIcon className="size-4 text-muted-foreground" />
                      Images
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
              <Popover open={searchOpen} onOpenChange={handleSearchOpenChange}>
                <Tooltip>
                  <TooltipTrigger asChild>
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
                  </TooltipTrigger>
                  <TooltipContent>Search</TooltipContent>
                </Tooltip>
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
              <Tooltip>
                <TooltipTrigger asChild>
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
                </TooltipTrigger>
                <TooltipContent>Upload</TooltipContent>
              </Tooltip>
            </div>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept={
              mediaType === "video"
                ? "video/*"
                : mediaType === "audio"
                  ? "audio/*"
                  : "image/*"
            }
            className="hidden"
            onChange={handleUpload}
          />
        </DialogHeader>
        <DialogBody className="pt-0">
          <div className="space-y-4">
            {error ? (
              <div
                role="alert"
                className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive"
              >
                <AlertCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}

            {items === null ? (
              <div className="grid h-48 place-items-center">
                <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="grid h-48 place-items-center text-center text-sm text-muted-foreground">
                <div>
                  {mediaType === "video" ? (
                    <VideoIcon className="mx-auto mb-2 size-8" />
                  ) : mediaType === "audio" ? (
                    <MusicIcon className="mx-auto mb-2 size-8" />
                  ) : (
                    <ImageIcon className="mx-auto mb-2 size-8" />
                  )}
                  <p>
                    {search.trim()
                      ? `No ${typeLabel} match your search.`
                      : `No ${typeLabel} in your library yet. Upload one above.`}
                  </p>
                </div>
              </div>
            ) : (
              // Fluid masonry inside a ScrollArea: column-WIDTH (not a fixed
              // count) so the browser fits as many cards as the modal width
              // allows. The viewport override keeps the inner div block/full so
              // columns size correctly (and don't overflow horizontally).
              <ScrollArea className="max-h-[60vh] [&_[data-slot=scroll-area-viewport]>div]:block! [&_[data-slot=scroll-area-viewport]>div]:w-full">
                <div className="columns-[150px] gap-2">
                  {filtered.map((item) => (
                    <ReplaceMediaTile
                      key={item.id}
                      item={item}
                      busy={busyId === item.id}
                      onSelect={() => selectMedia(item)}
                    />
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

function ReplaceMediaTile({
  item,
  busy,
  onSelect,
}: {
  item: MediaItem
  busy: boolean
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      className="group/tile mb-2 block w-full break-inside-avoid overflow-hidden rounded-md border text-left disabled:opacity-60"
      disabled={busy}
      onClick={onSelect}
    >
      {/* Full-resolution preview that keeps the media's natural aspect (matches
          the editor's media panel). */}
      <div className="relative bg-muted">
        {item.file_type === "image" ? (
          <img
            src={item.url}
            alt={item.original_name}
            className="block w-full"
            draggable={false}
          />
        ) : item.file_type === "audio" ? (
          // Audio has no visual — show a waveform-style icon tile.
          <div className="grid aspect-square w-full place-items-center">
            <MusicIcon className="size-8 text-muted-foreground" />
          </div>
        ) : (
          <video
            src={item.proxy_url ?? item.url}
            className="block w-full"
            muted
            preload="metadata"
          />
        )}
        {item.file_type === "image" ? (
          <ImageIcon className="absolute top-1.5 left-1.5 size-3.5 text-white drop-shadow" />
        ) : item.file_type === "audio" ? (
          <MusicIcon className="absolute top-1.5 left-1.5 size-3.5 text-white drop-shadow" />
        ) : (
          <VideoIcon className="absolute top-1.5 left-1.5 size-3.5 text-white drop-shadow" />
        )}
        {busy ? (
          <div className="absolute inset-0 grid place-items-center bg-black/40">
            <Loader2Icon className="size-5 animate-spin text-white" />
          </div>
        ) : (
          // "+" affordance on hover, like the media panel.
          <div className="pointer-events-none absolute inset-0 grid place-items-center bg-black/40 opacity-0 transition-opacity group-hover/tile:opacity-100">
            <PlusIcon className="size-5 text-white" />
          </div>
        )}
      </div>
      <div className="truncate px-2 py-1.5 text-xs group-hover/tile:underline">
        {item.original_name}
      </div>
    </button>
  )
}

function mediaTypeForMime(mimeType: string) {
  if (mimeType.startsWith("video/")) return "video"
  if (mimeType.startsWith("image/")) return "image"
  if (mimeType.startsWith("audio/")) return "audio"
  return null
}

function mediaTypeLabel(mediaType: "video" | "image" | "audio") {
  if (mediaType === "video") return "a video file"
  if (mediaType === "image") return "an image file"
  return "an audio file"
}
