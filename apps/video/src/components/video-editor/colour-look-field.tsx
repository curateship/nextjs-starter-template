import * as React from "react"
import { Trash2Icon } from "lucide-react"

import { FieldLabel } from "@/components/broadcasts/inspector-fields"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Hint } from "@/components/video-assets/hint"
import { useProjectGuest } from "@/components/video-editor/project-guest"
import {
  useEditorRuntime,
  type EditorClip,
} from "@/components/video-editor/editor-store"
import {
  deleteOwnColourLook,
  getColourLookErrorMessage,
  loadColourLooks,
  saveOwnColourLook,
} from "@/lib/api/video/colour-looks"
import { showErrorToast } from "@/lib/toast/error-toast"
import { clipColour, UNTOUCHED_COLOUR } from "@/lib/video/clip-colour"
import { storedPlaybackValue } from "@/lib/video/clip-playback"
import { COLOUR_LOOK_NAME_MAX, type SavedColourLook } from "@/lib/video/colour-looks"
import { clipLook, FILM_LOOKS, type FilmLookId } from "@/lib/video/film-looks"

/** The Select's value for no look, and the start of one of your own looks' values. */
const NONE = "none"
const YOURS = "yours:"

/**
 * The Look field at the top of the Colour card (colour-looks.md): a film look,
 * or one of your own saved looks, which sets the look and the three sliders
 * together in one Undo. "Save as a look" keeps the clip's look and sliders
 * under a name, and lists your looks with a delete each. A guest sent from
 * Project has the film looks only, because saved looks are the owner's.
 */
export function ColourLookField({ clip }: { clip: EditorClip }) {
  const { dispatch } = useEditorRuntime()
  const guest = useProjectGuest() !== null
  const [saved, setSaved] = React.useState<SavedColourLook[]>([])

  React.useEffect(() => {
    if (guest) return
    let live = true
    loadColourLooks()
      .then((looks) => live && setSaved(looks))
      .catch(() => {
        if (live) showErrorToast("Your saved looks could not be loaded. The film looks still work.")
      })
    return () => {
      live = false
    }
  }, [guest])

  function pick(value: string) {
    if (value.startsWith(YOURS)) {
      const own = saved.find((one) => one.id === value.slice(YOURS.length))
      if (!own) return
      dispatch({
        type: "UPDATE_CLIP",
        clipId: clip.id,
        patch: {
          look: own.look ?? undefined,
          brightness: storedPlaybackValue(own.brightness, UNTOUCHED_COLOUR.brightness),
          contrast: storedPlaybackValue(own.contrast, UNTOUCHED_COLOUR.contrast),
          saturation: storedPlaybackValue(own.saturation, UNTOUCHED_COLOUR.saturation),
        },
      })
      return
    }
    dispatch({
      type: "UPDATE_CLIP",
      clipId: clip.id,
      patch: { look: value === NONE ? undefined : (value as FilmLookId) },
    })
  }

  return (
    <div className="grid gap-2.5">
      <FieldLabel htmlFor="clip-look">Look</FieldLabel>
      <Select value={clipLook(clip) ?? NONE} onValueChange={pick}>
        <SelectTrigger id="clip-look" className="w-0 min-w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>None</SelectItem>
          {FILM_LOOKS.map((look) => (
            <SelectItem key={look.id} value={look.id}>
              {look.label} - {look.description}
            </SelectItem>
          ))}
          {saved.map((own) => (
            <SelectItem key={own.id} value={`${YOURS}${own.id}`}>
              Yours: {own.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {guest ? null : (
        <SaveLook clip={clip} saved={saved} onSavedChange={setSaved} />
      )}
    </div>
  )
}

function SaveLook({
  clip,
  saved,
  onSavedChange,
}: {
  clip: EditorClip
  saved: SavedColourLook[]
  onSavedChange: (looks: SavedColourLook[]) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [name, setName] = React.useState("")
  const [busy, setBusy] = React.useState(false)
  const [deleting, setDeleting] = React.useState<SavedColourLook | null>(null)

  async function save() {
    setBusy(true)
    try {
      const colour = clipColour(clip)
      const kept = await saveOwnColourLook({ name, look: clipLook(clip), ...colour })
      onSavedChange(
        [...saved.filter((one) => one.id !== kept.id && one.name !== kept.name), kept].sort((a, b) =>
          a.name.localeCompare(b.name)
        )
      )
      setName("")
      setOpen(false)
    } catch (error) {
      showErrorToast(getColourLookErrorMessage(error))
    } finally {
      setBusy(false)
    }
  }

  async function remove(look: SavedColourLook) {
    try {
      await deleteOwnColourLook(look.id)
      onSavedChange(saved.filter((one) => one.id !== look.id))
    } catch (error) {
      showErrorToast(getColourLookErrorMessage(error))
    } finally {
      setDeleting(null)
    }
  }

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button type="button" variant="outline" className="w-full">
            Save as a look
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="grid w-72 gap-3">
          <form
            className="grid gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              void save()
            }}
          >
            <FieldLabel htmlFor="clip-look-name">Name</FieldLabel>
            <div className="flex gap-2">
              <Input
                id="clip-look-name"
                maxLength={COLOUR_LOOK_NAME_MAX}
                placeholder="Kitchen, evening"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <Button type="submit" disabled={busy}>
                Save
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">
              Keeps this clip's look and its three sliders. The same name replaces the old one.
            </p>
          </form>
          {saved.length ? (
            <ul className="grid gap-1" aria-label="Your looks">
              {saved.map((own) => (
                <li key={own.id} className="flex items-center gap-2 text-sm">
                  <span className="min-w-0 flex-1 truncate">{own.name}</span>
                  <Hint label="Delete">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label={`Delete ${own.name}`}
                      onClick={() => setDeleting(own)}
                    >
                      <Trash2Icon />
                    </Button>
                  </Hint>
                </li>
              ))}
            </ul>
          ) : null}
        </PopoverContent>
      </Popover>
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(next) => (next ? undefined : setDeleting(null))}
        title={`Delete "${deleting?.name ?? ""}"?`}
        description="Clips that used it keep their colour. Only the saved look goes."
        confirmLabel="Delete"
        onConfirm={() => deleting && void remove(deleting)}
      />
    </>
  )
}
