import * as React from "react"
import {
  ArrowUpRightIcon,
  CircleIcon,
  FilmIcon,
  ImageUpIcon,
  SmileIcon,
  StickerIcon,
  TypeIcon,
  UserRoundIcon,
} from "lucide-react"
import { toast } from "sonner"

import { InspectorCard } from "@/components/broadcasts/inspector-fields"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useEditorRuntime } from "@/components/video-editor/editor-store"
import { useThumbnails } from "@/components/video-thumbnails/thumbnail-store"
import { aiUnitCostCents } from "@/lib/ai/ai-models"
import { getMediaErrorMessage, uploadMedia } from "@/lib/api/media/media"
import { listActors, type ActorItem } from "@/lib/api/video/actors"
import { loadStickers, type Sticker } from "@/lib/api/video/stickers"
import { addActorToThumbnail } from "@/lib/api/video/thumbnail-ai"
import { frameForBoard, pictureFromLibrary } from "@/lib/api/video/thumbnails"
import { MediaPicker } from "@/components/media/media-picker"
import { formatCents } from "@/lib/video/project-spend"
import { readEmoji } from "@/lib/video/stickers"
import { ACTOR_EXPRESSIONS } from "@/lib/video/thumbnail-ai"
import {
  fullPictureLayer,
  newShapeLayer,
  newTextLayer,
  THUMBNAIL_LAYER_MAX,
  topZ,
  type ThumbnailLayer,
} from "@/lib/video/thumbnails"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * An emoji as a picture: drawn by the browser's own emoji font onto a
 * square, then kept in the library like any picture. The download's drawing
 * has no colour emoji font, so a picture is the only way an emoji comes out
 * of it the way it looks on the board.
 */
async function emojiPicture(emoji: string) {
  const canvas = document.createElement("canvas")
  canvas.width = 512
  canvas.height = 512
  const context = canvas.getContext("2d")
  if (!context) throw new Error("This browser can't draw the emoji.")
  context.textAlign = "center"
  context.textBaseline = "middle"
  context.font = '420px "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif'
  context.fillText(emoji, 256, 280)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
  if (!blob) throw new Error("This browser can't draw the emoji.")
  return new File([blob], `emoji-${[...emoji].map((part) => part.codePointAt(0)?.toString(16)).join("-")}.png`, {
    type: "image/png",
  })
}

/** Everything that adds a layer to the open thumbnail (parts 11, 15 and 19). */
export function AddLayers() {
  const { videoId, clock } = useEditorRuntime()
  const { open, design, change, selectLayer, run, busy, tries, model, addVersion } = useThumbnails()
  const [picking, setPicking] = React.useState(false)
  if (!open || !design) return null
  const full = design.layers.length >= THUMBNAIL_LAYER_MAX
  const shape = open.shape

  function add(layer: ThumbnailLayer) {
    if (full) {
      showErrorToast(`A thumbnail holds up to ${THUMBNAIL_LAYER_MAX} layers.`)
      return
    }
    change((current) => ({ ...current, layers: [...current.layers, { ...layer, zIndex: topZ(current.layers) }] }))
    selectLayer(layer.id)
  }

  function addPicture(media: { mediaId: string; url: string; name?: string }, sticker = false) {
    add({
      ...fullPictureLayer(media, 0),
      ...(sticker ? { fit: "contain" as const, x: 0.6, y: 0.08, width: 0.3, height: 0.3 } : {}),
    })
  }

  async function upload(file: File, sticker = false) {
    try {
      const media = await uploadMedia(file)
      addPicture({ mediaId: media.id, url: media.url, name: media.original_name }, sticker)
    } catch (error) {
      showErrorToast(getMediaErrorMessage(error))
    }
  }

  return (
    <InspectorCard title="Add" description="Drag a layer on the board to move it, and its corner dot to resize it.">
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={busy !== null || full}
          onClick={() =>
            void run("Taking the frame…", async () => {
              clock.pause()
              const frame = await frameForBoard(videoId, clock.getTime())
              addPicture(frame)
            })
          }
        >
          <FilmIcon />
          This frame
        </Button>
        <Button type="button" variant="outline" disabled={full} onClick={() => setPicking(true)}>
          <ImageUpIcon />
          Picture
        </Button>
        <Button type="button" variant="outline" disabled={full} onClick={() => add(newTextLayer(shape, design.layers))}>
          <TypeIcon />
          Words
        </Button>
        <Button type="button" variant="outline" disabled={full} onClick={() => add(newShapeLayer("arrow", design.layers))}>
          <ArrowUpRightIcon />
          Arrow
        </Button>
        <Button type="button" variant="outline" disabled={full} onClick={() => add(newShapeLayer("circle", design.layers))}>
          <CircleIcon />
          Circle
        </Button>
        <StickerButton
          disabled={full}
          onPicture={(sticker) => addPicture(sticker, true)}
          onEmoji={(emoji) => void emojiPicture(emoji).then((file) => upload(file, true), (error) => showErrorToast(error instanceof Error ? error.message : String(error)))}
        />
      </div>
      <MediaPicker
        open={picking}
        onOpenChange={setPicking}
        showVideos={false}
        onSelectMedia={(url) => {
          setPicking(false)
          void run("Adding the picture…", async () => {
            addPicture(await pictureFromLibrary(videoId, url))
          })
        }}
      />
      <ActorPicker
        disabled={busy !== null}
        price={formatCents(aiUnitCostCents(model, tries))}
        onAdd={(actorId, expression) =>
          void run(`Drawing your actor, ${tries} ${tries === 1 ? "version" : "versions"}…`, async () => {
            const rows = await addActorToThumbnail({ thumbnailId: open.id, actorId, expression, model, tries })
            for (const row of rows.reverse()) addVersion(row)
            toast.success(`${rows.length} new ${rows.length === 1 ? "version" : "versions"} on the left.`)
          })
        }
      />
    </InspectorCard>
  )
}

/** Your own stickers, and any emoji typed in (part 11). */
function StickerButton({
  disabled,
  onPicture,
  onEmoji,
}: {
  disabled: boolean
  onPicture: (sticker: { mediaId: string; url: string; name: string }) => void
  onEmoji: (emoji: string) => void
}) {
  const [stickers, setStickers] = React.useState<Sticker[] | null>(null)
  const [typed, setTyped] = React.useState("")
  const [open, setOpen] = React.useState(false)

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (next && !stickers) {
          loadStickers()
            .then((answer) => setStickers(answer))
            .catch(() => setStickers([]))
        }
      }}
    >
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" disabled={disabled}>
          <StickerIcon />
          Sticker
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="grid w-64 gap-3">
        <div className="grid grid-cols-5 gap-1">
          {(stickers ?? []).map((sticker, index) =>
            sticker.kind === "emoji" ? (
              <Button
                key={`emoji-${index}`}
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Add ${sticker.emoji}`}
                onClick={() => {
                  setOpen(false)
                  onEmoji(sticker.emoji)
                }}
              >
                <span className="text-xl">{sticker.emoji}</span>
              </Button>
            ) : (
              <Button
                key={sticker.mediaId}
                type="button"
                variant="ghost"
                size="icon"
                aria-label={`Add ${sticker.name}`}
                onClick={() => {
                  setOpen(false)
                  onPicture(sticker)
                }}
              >
                <img src={sticker.url} alt="" className="size-7 object-contain" />
              </Button>
            )
          )}
        </div>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            const emoji = readEmoji(typed)
            if (!emoji) {
              showErrorToast("Type or paste one emoji.")
              return
            }
            setTyped("")
            setOpen(false)
            onEmoji(emoji)
          }}
        >
          <Label htmlFor="thumbnail-emoji" className="sr-only">
            Emoji
          </Label>
          <Input id="thumbnail-emoji" value={typed} placeholder="Any emoji" onChange={(event) => setTyped(event.target.value)} />
          <Button type="submit" variant="outline" size="icon" aria-label="Add the emoji">
            <SmileIcon />
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  )
}

/** One of your actors drawn into the thumbnail, cut out (part 19). */
function ActorPicker({
  disabled,
  price,
  onAdd,
}: {
  disabled: boolean
  price: string
  onAdd: (actorId: string, expression: string) => void
}) {
  const [actors, setActors] = React.useState<ActorItem[] | null>(null)
  const [actorId, setActorId] = React.useState("")
  const [expression, setExpression] = React.useState<string>(ACTOR_EXPRESSIONS[0])

  React.useEffect(() => {
    let live = true
    listActors()
      .then((answer) => live && setActors(answer.actors.filter((actor) => actor.status === "active")))
      // A guest has no actors of their own to pick from.
      .catch(() => live && setActors([]))
    return () => {
      live = false
    }
  }, [])

  if (!actors?.length) return null
  const picked = actorId || actors[0].id
  return (
    <div className="grid gap-2 border-t pt-3">
      <Label htmlFor="thumbnail-actor">Your actor</Label>
      <Select value={picked} onValueChange={setActorId}>
        <SelectTrigger id="thumbnail-actor" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {actors.map((actor) => (
            <SelectItem key={actor.id} value={actor.id}>
              {actor.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Label htmlFor="thumbnail-expression">Looking</Label>
      <Input
        id="thumbnail-expression"
        list="thumbnail-expressions"
        value={expression}
        maxLength={120}
        onChange={(event) => setExpression(event.target.value)}
      />
      <datalist id="thumbnail-expressions">
        {ACTOR_EXPRESSIONS.map((one) => (
          <option key={one} value={one} />
        ))}
      </datalist>
      <Button type="button" variant="outline" disabled={disabled} onClick={() => onAdd(picked, expression)}>
        <UserRoundIcon />
        Add the actor · {price}
      </Button>
    </div>
  )
}
