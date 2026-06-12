import * as React from "react"
import { AlertCircleIcon, Loader2Icon, UploadIcon, VideoIcon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  getMediaErrorMessage,
  listMedia,
  uploadMedia,
  type MediaItem,
} from "@/lib/api/media"
import { loadMediaDurationMs } from "@/pages/video-editor/timeline-utils"
import { getVideoThumbnail } from "@/pages/video-editor/video-thumbnails"

// Payload handed back to the timeline's REPLACE_CLIP_MEDIA action.
export type ReplacementMedia = {
  mediaId: string
  url: string
  name: string
  sourceDurationMs: number
}

// CapCut-style slot replacement picker: choose one of your video uploads (or
// upload on the spot) to drop into a template slot. Video-only — slots keep
// their kind.
export function ReplaceMediaDialog({
  open,
  onOpenChange,
  onReplace,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onReplace: (media: ReplacementMedia) => void
}) {
  const [items, setItems] = React.useState<MediaItem[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  // Tile currently probing its duration before handing back the selection.
  const [busyId, setBusyId] = React.useState<string | null>(null)
  const [uploading, setUploading] = React.useState(false)
  const fileInputRef = React.useRef<HTMLInputElement>(null)

  // (Re)load the video library each time the dialog opens; the previous list
  // stays visible until the fresh one lands, so no state resets are needed.
  React.useEffect(() => {
    if (!open) return
    let active = true

    listMedia({ fileType: "video", pageSize: 100 })
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
  }, [open])

  // The slot needs the replacement's intrinsic length to clamp its duration.
  async function selectMedia(item: MediaItem) {
    setBusyId(item.id)
    setError(null)
    try {
      const sourceDurationMs = await loadMediaDurationMs(item.url, "video")
      onReplace({
        mediaId: item.id,
        url: item.url,
        name: item.original_name,
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

    setUploading(true)
    setError(null)
    try {
      const uploaded = await uploadMedia(file)
      await selectMedia(uploaded)
    } catch (uploadError) {
      setError(getMediaErrorMessage(uploadError))
    } finally {
      setUploading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Replace Clip</DialogTitle>
        </DialogHeader>
        <DialogBody>
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

            <div className="flex items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                Pick a video — the slot keeps its position and length.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? (
                  <Loader2Icon className="size-4 animate-spin" />
                ) : (
                  <UploadIcon className="size-4" />
                )}
                Upload
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={handleUpload}
              />
            </div>

            {items === null ? (
              <div className="grid h-48 place-items-center">
                <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : items.length === 0 ? (
              <div className="grid h-48 place-items-center text-center text-sm text-muted-foreground">
                <div>
                  <VideoIcon className="mx-auto mb-2 size-8" />
                  <p>No videos in your library yet. Upload one above.</p>
                </div>
              </div>
            ) : (
              <div className="grid max-h-[50vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
                {items.map((item) => (
                  <ReplaceMediaTile
                    key={item.id}
                    item={item}
                    busy={busyId === item.id}
                    onSelect={() => selectMedia(item)}
                  />
                ))}
              </div>
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
  // Same frame extraction the timeline chips use, cached per mediaId.
  const [thumbUrl, setThumbUrl] = React.useState<string | null>(null)
  React.useEffect(() => {
    let active = true
    getVideoThumbnail(item.id)
      .then((url) => {
        if (active) setThumbUrl(url)
      })
      .catch(() => undefined)
    return () => {
      active = false
    }
  }, [item.id])

  return (
    <button
      type="button"
      className="group/tile overflow-hidden rounded-md border text-left"
      disabled={busy}
      onClick={onSelect}
    >
      <div
        className="grid aspect-video w-full place-items-center bg-muted bg-cover bg-center"
        style={thumbUrl ? { backgroundImage: `url("${thumbUrl}")` } : undefined}
      >
        {busy ? (
          <Loader2Icon className="size-5 animate-spin text-white drop-shadow" />
        ) : thumbUrl ? null : (
          <VideoIcon className="size-5 text-muted-foreground" />
        )}
      </div>
      <div className="truncate px-2 py-1.5 text-xs group-hover/tile:underline">
        {item.original_name}
      </div>
    </button>
  )
}
