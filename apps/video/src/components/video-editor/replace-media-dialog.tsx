import * as React from "react"
import { Loader2Icon } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  getVideoMediaErrorMessage,
  listVideoMedia,
  type VideoMediaItem,
} from "@/lib/api/video/media"
import { showErrorToast } from "@/lib/toast/error-toast"
import { loadMediaDurationMs } from "@/lib/video/timeline-utils"

/** What the editor needs to swap the footage in a clip. */
export type ReplacementMedia = {
  mediaId: string
  url: string
  name: string
  fileType: "video" | "image" | "audio"
  sourceDurationMs: number
}

/**
 * Swapping the footage in a clip. The clip keeps its place on the timeline and
 * its length; only what plays inside it changes.
 *
 * A picker rather than a form, so it is a plain window: pick a file and it
 * closes. A video's length is read in the browser first, because a clip can
 * never be longer than the file it plays.
 */
export function ReplaceMediaDialog({
  open,
  onOpenChange,
  onReplace,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onReplace: (media: ReplacementMedia) => void
}) {
  const [items, setItems] = React.useState<VideoMediaItem[] | null>(null)
  const [fileType, setFileType] = React.useState<"video" | "image">("video")
  const [search, setSearch] = React.useState("")
  const [debouncedSearch, setDebouncedSearch] = React.useState("")
  const [selected, setSelected] = React.useState<VideoMediaItem | null>(null)
  // True while the chosen file's length is being read.
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 250)
    return () => clearTimeout(timer)
  }, [search])

  // Reload when the window opens or the filters change. The previous list stays
  // on screen until the new one lands, so the grid never blinks empty.
  React.useEffect(() => {
    if (!open) return
    let active = true
    listVideoMedia({
      fileType,
      pageSize: 60,
      search: debouncedSearch || undefined,
    })
      .then((data) => {
        if (active) setItems(data.media)
      })
      .catch((error) => {
        if (active) showErrorToast(getVideoMediaErrorMessage(error))
      })
    return () => {
      active = false
    }
  }, [open, fileType, debouncedSearch])

  async function confirmSelection() {
    if (!selected) {
      showErrorToast("Choose a file before selecting it.")
      return
    }
    setBusy(true)
    try {
      const kind = selected.file_type === "image" ? "image" : "video"
      onReplace({
        mediaId: selected.id,
        url: selected.playback_url,
        name: selected.original_name,
        fileType: kind,
        // A picture fills whatever length the clip already had, so there is
        // nothing to measure.
        sourceDurationMs:
          kind === "image"
            ? 0
            : await loadMediaDurationMs(selected.playback_url, "video"),
      })
    } catch (error) {
      showErrorToast(getVideoMediaErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  const media = items ?? []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Replace media</DialogTitle>
          <DialogDescription>
            The clip keeps where it sits and how long it runs — only the footage
            changes.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <Select
              value={fileType}
              onValueChange={(next) => setFileType(next as "video" | "image")}
            >
              <SelectTrigger className="w-full sm:w-fit" aria-label="File type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="video">Video</SelectItem>
                <SelectItem value="image">Image</SelectItem>
              </SelectContent>
            </Select>
            <Input
              className="sm:flex-1"
              value={search}
              placeholder="Search media"
              aria-label="Search media"
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          {items === null ? (
            <div className="grid place-items-center py-10" role="status">
              <Loader2Icon className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : media.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No {fileType === "video" ? "videos" : "images"} in the library yet.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {media.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={selected?.id === item.id}
                  onClick={() => setSelected(item)}
                  onDoubleClick={() => {
                    setSelected(item)
                    void confirmSelection()
                  }}
                  title={item.original_name}
                  className={
                    selected?.id === item.id
                      ? "relative aspect-video overflow-hidden rounded-lg border-2 border-primary bg-muted outline-none"
                      : "relative aspect-video overflow-hidden rounded-lg border bg-muted outline-none focus-visible:border-ring"
                  }
                >
                  {item.file_type === "image" ? (
                    <img
                      src={item.url}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  ) : (
                    <video
                      src={item.playback_url}
                      muted
                      playsInline
                      preload="metadata"
                      className="size-full object-cover"
                    />
                  )}
                </button>
              ))}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={busy}
            aria-invalid={!selected || undefined}
            onClick={() => void confirmSelection()}
          >
            {busy ? <Loader2Icon className="animate-spin" /> : null}
            Select
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
