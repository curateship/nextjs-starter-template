import * as React from "react"
import { ArrowLeftIcon } from "lucide-react"

import { SavingDocument } from "@/components/travel/saving-document"
import { ActivityTypeSelect } from "@/components/travel/type-icon"
import { PhotoCreditLine, UnsplashPicker } from "@/components/travel/unsplash-picker"
import { ImageUpload } from "@/components/shared/image-upload"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { editSavedPlace, type SavedPlace } from "@/lib/api/travel/saved-places"
import type { ActivityType } from "@/lib/api/travel/types"
import { getTravelErrorMessage } from "@/lib/travel/errors"
import { showErrorToast } from "@/lib/toast/error-toast"

/** A pause in typing this long saves (UI standard, "Settings"). */
const TYPING_SAVE_MS = 700

type Patch = Partial<Pick<SavedPlace, "title" | "typeId" | "notes" | "photoUrl" | "photoCredit">>

/**
 * One saved place, open inside the Saved places window (Travel features 4,
 * part 11; Tyler, 6 Nov 2026: "Opens in the window"): its name, type, picture
 * and notes, each saving itself. The name saves 700ms after the last letter
 * or when it's left; a type or picture the moment it's picked. A refused save
 * says why and keeps what was typed. Back to saved places returns to the list.
 */
export function SavedPlaceEditor({
  place,
  types,
  onChange,
  onBack,
}: {
  place: SavedPlace
  types: readonly ActivityType[]
  /** The place as saved, after each change the server took. */
  onChange: (place: SavedPlace) => void
  /** Back to the list, inside the Saved places window; left out on the Trips dashboard's right panel. */
  onBack?: () => void
}) {
  const [title, setTitle] = React.useState(place.title)
  const [invalid, setInvalid] = React.useState(false)
  const timer = React.useRef(0)
  // A name typed and not yet saved, so closing the window inside the pause still saves it.
  const pending = React.useRef<string | null>(null)
  const latest = React.useRef(place)
  React.useEffect(() => {
    latest.current = place
  })
  const idBase = `saved-${place.id}`

  const save = React.useCallback(
    async (patch: Patch) => {
      try {
        await editSavedPlace({ savedPlaceId: place.id, ...patch })
        onChange({ ...latest.current, ...patch })
      } catch (error) {
        showErrorToast(getTravelErrorMessage(error))
      }
    },
    [onChange, place.id]
  )

  const saveTitle = React.useCallback(
    (next: string) => {
      window.clearTimeout(timer.current)
      pending.current = null
      const trimmed = next.trim()
      if (!trimmed) {
        setInvalid(true)
        showErrorToast("Give the place a name.")
        return
      }
      if (trimmed !== latest.current.title) void save({ title: trimmed })
    },
    [save]
  )

  // Leaving the place, by Back, Done or Escape, saves a name still waiting on its pause.
  const saveTitleRef = React.useRef(saveTitle)
  React.useEffect(() => {
    saveTitleRef.current = saveTitle
  })
  React.useEffect(
    () => () => {
      if (pending.current !== null && pending.current.trim()) saveTitleRef.current(pending.current)
    },
    []
  )

  return (
    <div className="grid gap-4">
      {onBack ? (
        <div>
          <Button type="button" variant="link" size="sm" className="px-1" onClick={onBack}>
            <ArrowLeftIcon className="size-4" />
            Back to saved places
          </Button>
        </div>
      ) : null}
      <div className="grid gap-2">
        <Label htmlFor={`${idBase}-name`}>Name</Label>
        <Input
          id={`${idBase}-name`}
          value={title}
          maxLength={200}
          aria-invalid={invalid || undefined}
          onChange={(event) => {
            const next = event.target.value
            setTitle(next)
            setInvalid(false)
            window.clearTimeout(timer.current)
            pending.current = next
            if (next.trim()) timer.current = window.setTimeout(() => saveTitle(next), TYPING_SAVE_MS)
          }}
          onBlur={() => saveTitle(title)}
          onKeyDown={(event) => {
            if (event.key === "Enter") saveTitle(title)
          }}
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor={`${idBase}-type`}>Type</Label>
        <ActivityTypeSelect
          id={`${idBase}-type`}
          types={types}
          value={place.typeId}
          className="sm:w-auto"
          onChange={(typeId) => void save({ typeId })}
        />
      </div>
      <div className="grid gap-2">
        <Label>Picture</Label>
        <ImageUpload
          label="Picture"
          showLabel={false}
          value={place.photoUrl ?? ""}
          aspect="video"
          fit="cover"
          emptyLabel="Upload a picture"
          onChange={(url) => void save({ photoUrl: url || null, photoCredit: null })}
        />
        {place.photoCredit ? <PhotoCreditLine credit={place.photoCredit} /> : null}
        <div>
          <UnsplashPicker
            startQuery={place.place?.name || place.title}
            onPick={(photo) => void save({ photoUrl: photo.url, photoCredit: photo.credit })}
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label>Notes</Label>
        <SavingDocument
          key={place.id}
          value={place.notes}
          cards={false}
          placeholder="Write something about this place"
          onSave={(notes) => save({ notes })}
        />
      </div>
    </div>
  )
}
