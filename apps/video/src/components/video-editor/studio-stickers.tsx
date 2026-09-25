import * as React from "react"
import { ImagePlusIcon, Loader2Icon, PlusIcon, XIcon } from "lucide-react"

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
import { ErrorRow } from "@/components/ui/error-row"
import { FieldLabel } from "@/components/ui/field-label"
import { Input } from "@/components/ui/input"
import { LoadingRow } from "@/components/ui/loading-row"
import {
  addSticker,
  getStickerErrorMessage,
  listStickerPictures,
  STICKER_PICKER_PAGE_SIZE,
  loadStickers,
  removeSticker,
  type Sticker,
  type StickerEntry,
} from "@/lib/api/video/stickers"
import type { VideoMediaItem } from "@/lib/api/video/media"
import { showErrorToast } from "@/lib/toast/error-toast"
import { cn } from "@/lib/utils"
import { STICKER_PICTURE_SCALE } from "@/lib/video/clip-size"
import {
  EMOJI_STICKER_FONT_SIZE,
  readEmoji,
  STICKER_NOT_EMOJI_MESSAGE,
} from "@/lib/video/stickers"
import {
  DEFAULT_TEXT_DURATION_MS,
  editorId,
} from "@/lib/video/timeline-utils"
import { useEditorRuntime } from "@/components/video-editor/editor-store"

/**
 * The stickers in the Text panel: the person's own list, one press from the
 * frame, with a field to add an emoji and a picker for a picture.
 *
 * An emoji lands exactly as the built-in ones always have, as a text clip in
 * the middle of the frame. A picture lands as a picture clip at 30% of the
 * frame, which the preview lets you drag and the inspector lets you resize.
 * The list rules are in src/lib/video/stickers.ts.
 */
export function StickerShelf() {
  const { dispatch, clock } = useEditorRuntime()
  const [stickers, setStickers] = React.useState<Sticker[] | null>(null)
  const [loadFailed, setLoadFailed] = React.useState(false)
  const [refresh, setRefresh] = React.useState(0)
  const [removing, setRemoving] = React.useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = React.useState(false)

  React.useEffect(() => {
    let active = true
    loadStickers()
      .then((loaded) => {
        if (!active) return
        setStickers(loaded)
        setLoadFailed(false)
      })
      .catch(() => {
        if (active) setLoadFailed(true)
      })
    return () => {
      active = false
    }
  }, [refresh])

  function place(sticker: Sticker) {
    dispatch({
      type: "ADD_OVERLAY",
      clip:
        sticker.kind === "emoji"
          ? {
              id: editorId(),
              kind: "text",
              name: "Text",
              text: sticker.emoji,
              fontId: "inter",
              fontSize: EMOJI_STICKER_FONT_SIZE,
              color: "#ffffff",
              y: 0.5,
              trimStartMs: 0,
              startMs: 0,
              durationMs: DEFAULT_TEXT_DURATION_MS,
            }
          : {
              id: editorId(),
              kind: "image",
              name: sticker.name,
              mediaId: sticker.mediaId,
              url: sticker.url,
              scale: STICKER_PICTURE_SCALE,
              trimStartMs: 0,
              startMs: 0,
              durationMs: DEFAULT_TEXT_DURATION_MS,
            },
      atMs: clock.getTime(),
    })
  }

  async function remove(sticker: Sticker) {
    const key = stickerKey(sticker)
    setRemoving(key)
    try {
      setStickers(await removeSticker(entryOf(sticker)))
    } catch (error) {
      showErrorToast(getStickerErrorMessage(error))
    } finally {
      setRemoving(null)
    }
  }

  if (loadFailed) {
    return (
      <ErrorRow
        message="Your stickers could not be loaded."
        onRetry={() => setRefresh((count) => count + 1)}
      />
    )
  }
  if (!stickers) return <LoadingRow label="Loading stickers" />

  return (
    <div className="grid gap-4">
      {stickers.length ? (
        <ul className="grid grid-cols-4 gap-[9px]">
          {stickers.map((sticker) => {
            const key = stickerKey(sticker)
            const label =
              sticker.kind === "emoji" ? sticker.emoji : sticker.name
            return (
              <li key={key} className="group relative">
                <button
                  type="button"
                  className="st-hovcard grid aspect-square w-full cursor-pointer place-items-center overflow-hidden rounded-xl border"
                  style={{ background: "var(--panel2)", fontSize: 22 }}
                  aria-label={`Add ${label}`}
                  title={sticker.kind === "image" ? sticker.name : undefined}
                  onClick={() => place(sticker)}
                >
                  {sticker.kind === "emoji" ? (
                    sticker.emoji
                  ) : (
                    <img
                      src={sticker.url}
                      alt=""
                      loading="lazy"
                      className="size-full object-contain p-1.5"
                    />
                  )}
                </button>
                {/* Shown on hover and on keyboard focus, and always on a touch
                    screen, which has no hover. */}
                <Button
                  type="button"
                  variant="secondary"
                  size="icon-xs"
                  className="absolute -top-1.5 -right-1.5 rounded-full border-border opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                  disabled={removing === key}
                  aria-label={`Remove ${label} from your stickers`}
                  onClick={() => void remove(sticker)}
                >
                  {removing === key ? (
                    <Loader2Icon className="animate-spin" />
                  ) : (
                    <XIcon />
                  )}
                </Button>
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          No stickers. Add an emoji or a picture below.
        </p>
      )}

      <AddEmojiField onAdded={setStickers} />

      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={() => setPickerOpen(true)}
      >
        <ImagePlusIcon />
        Add a picture
      </Button>

      <StickerPictureDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        onAdded={(next) => {
          setStickers(next)
          setPickerOpen(false)
        }}
      />
    </div>
  )
}

function stickerKey(sticker: Sticker) {
  return sticker.kind === "emoji" ? `emoji:${sticker.emoji}` : `image:${sticker.mediaId}`
}

function entryOf(sticker: Sticker): StickerEntry {
  return sticker.kind === "emoji"
    ? { kind: "emoji", emoji: sticker.emoji }
    : { kind: "image", mediaId: sticker.mediaId }
}

/**
 * One emoji at a time. The check runs when Add is pressed, and the server
 * runs the same one, so anything that is not exactly one emoji is refused
 * with the field kept as typed.
 */
function AddEmojiField({ onAdded }: { onAdded: (next: Sticker[]) => void }) {
  const [value, setValue] = React.useState("")
  const [invalid, setInvalid] = React.useState(false)
  const [busy, setBusy] = React.useState(false)

  async function submit() {
    const emoji = readEmoji(value)
    if (!emoji) {
      setInvalid(true)
      showErrorToast(STICKER_NOT_EMOJI_MESSAGE)
      return
    }
    setBusy(true)
    try {
      onAdded(await addSticker({ kind: "emoji", emoji }))
      setValue("")
      setInvalid(false)
    } catch (error) {
      setInvalid(true)
      showErrorToast(getStickerErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <FieldLabel
        htmlFor="sticker-emoji"
        hint="On a Mac, Control-Command-Space opens the emoji picker. On Windows, it is the Windows key and a full stop."
      >
        Add an emoji
      </FieldLabel>
      <div className="flex gap-2">
        <Input
          id="sticker-emoji"
          className="flex-1"
          value={value}
          placeholder="e.g. 🚀"
          autoComplete="off"
          aria-invalid={invalid || undefined}
          onChange={(event) => {
            setValue(event.target.value)
            setInvalid(false)
          }}
        />
        <Button type="submit" variant="outline" disabled={busy}>
          {busy ? <Loader2Icon className="animate-spin" /> : <PlusIcon />}
          Add
        </Button>
      </div>
    </form>
  )
}

/**
 * Choosing a picture for the list. Every picture in the person's library is
 * offered, not only this project's, because a logo is uploaded once and used
 * everywhere. Choosing one adds it to the list; placing it is then one press,
 * the same as an emoji.
 */
function StickerPictureDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdded: (next: Sticker[]) => void
}) {
  const [items, setItems] = React.useState<VideoMediaItem[] | null>(null)
  const [total, setTotal] = React.useState(0)
  const [loadFailed, setLoadFailed] = React.useState(false)
  const [refresh, setRefresh] = React.useState(0)
  const [search, setSearch] = React.useState("")
  const [debouncedSearch, setDebouncedSearch] = React.useState("")
  const [selected, setSelected] = React.useState<VideoMediaItem | null>(null)
  const [busy, setBusy] = React.useState(false)

  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 250)
    return () => clearTimeout(timer)
  }, [search])

  // The previous page stays on screen until the next one lands, so the grid
  // never blinks empty while a search is typed.
  React.useEffect(() => {
    if (!open) return
    let active = true
    listStickerPictures(debouncedSearch)
      .then((page) => {
        if (!active) return
        setItems(page.media)
        setTotal(page.total)
        setLoadFailed(false)
      })
      .catch(() => {
        if (active) setLoadFailed(true)
      })
    return () => {
      active = false
    }
  }, [open, debouncedSearch, refresh])

  async function confirm(item: VideoMediaItem | null) {
    if (!item) {
      showErrorToast("Choose a picture before adding it.")
      return
    }
    setBusy(true)
    try {
      onAdded(await addSticker({ kind: "image", mediaId: item.id }))
      setSelected(null)
    } catch (error) {
      showErrorToast(getStickerErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent variant="admin">
        <DialogHeader>
          <DialogTitle>Add a picture sticker</DialogTitle>
          <DialogDescription>
            It joins your stickers. Placed, it arrives at 30% of the frame's
            size, ready to drag into place.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          <Input
            value={search}
            placeholder="Search pictures"
            aria-label="Search pictures"
            onChange={(event) => setSearch(event.target.value)}
          />

          {loadFailed ? (
            <ErrorRow
              message="Your pictures could not be loaded."
              onRetry={() => setRefresh((count) => count + 1)}
            />
          ) : items === null ? (
            <LoadingRow label="Loading pictures" />
          ) : items.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              {debouncedSearch
                ? "No pictures match that search."
                : "No pictures in your library yet. Upload one from the Media panel."}
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {items.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={selected?.id === item.id}
                  aria-label={item.original_name}
                  title={item.original_name}
                  onClick={() => setSelected(item)}
                  onDoubleClick={() => void confirm(item)}
                  className={cn(
                    "relative aspect-square overflow-hidden rounded-lg bg-muted outline-none",
                    selected?.id === item.id
                      ? "border-2 border-primary"
                      : "border focus-visible:border-ring"
                  )}
                >
                  <img
                    src={item.url}
                    alt=""
                    loading="lazy"
                    className="size-full object-contain p-1"
                  />
                </button>
              ))}
            </div>
          )}
          {items && total > items.length ? (
            <p className="text-center text-sm text-muted-foreground">
              Showing your newest {STICKER_PICKER_PAGE_SIZE} of {total}{" "}
              pictures. Search to find an older one.
            </p>
          ) : null}
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
            onClick={() => void confirm(selected)}
          >
            {busy ? <Loader2Icon className="animate-spin" /> : null}
            Add sticker
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
