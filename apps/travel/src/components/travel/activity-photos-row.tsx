import * as React from "react"
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core"
import { SortableContext, arrayMove, horizontalListSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, Trash2Icon } from "lucide-react"

import { useTrip } from "@/components/travel/trip-context"
import { PhotoCreditLine, UnsplashPicker } from "@/components/travel/unsplash-picker"
import { MediaPicker } from "@/components/media/media-picker"
import { Button } from "@/components/ui/button"
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { saveActivityPhotos, type CardPhoto } from "@/lib/api/travel/activity-photos"
import { cardPhotos } from "@/lib/travel/card-photos"
import type { Activity } from "@/lib/api/travel/trips"
import { useAsyncAction } from "@/lib/hooks/use-async-action"
import { getTravelErrorMessage } from "@/lib/travel/errors"
import { cn } from "@/lib/utils"

/** The most photos one card holds, its picture included. Matches the server's limit. */
const MAX_PHOTOS = 30

/**
 * The row of small photos at the top of an open card (Travel features 3,
 * part 5; Tyler, 5 Nov 2026: "Row of small photos"). A click shows a photo
 * large. Dragging one to the front makes it the card's picture on the board.
 * "+" opens the media library straight away to add one (Tyler, 6 Nov 2026:
 * "this didnt need to open a dropdown. Just open it straight to the media
 * picker"), and Unsplash, when it is set up, is its own button beside it. The
 * row shows once the card has a picture, which is set from the card's ⋮ menu
 * or by a pick.
 */
export function ActivityPhotosRow({ activity }: { activity: Activity }) {
  const { page, refresh, readOnly } = useTrip()
  const photos = cardPhotos(activity, page.photos)
  const [viewing, setViewing] = React.useState<number | null>(null)
  const [adding, setAdding] = React.useState(false)
  const [run, busy] = useAsyncAction(getTravelErrorMessage)
  const sensors = useSensors(
    // A small move before dragging starts, so a click still opens the photo.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )
  if (!photos.length) return null
  const ids = photos.map((photo, index) => `${index}:${photo.url}`)

  function save(next: CardPhoto[], done?: string) {
    return run(async () => {
      await saveActivityPhotos(activity.id, next)
      await refresh()
    }, done)
  }

  function onDragEnd(event: DragEndEvent) {
    const from = ids.indexOf(String(event.active.id))
    const to = event.over ? ids.indexOf(String(event.over.id)) : -1
    if (from < 0 || to < 0 || from === to) return
    void save(arrayMove(photos, from, to), to === 0 ? "That photo is the card's picture now." : undefined)
  }

  function add(photo: CardPhoto) {
    setAdding(false)
    void save([...photos, photo])
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-1">
      {/* A fixed id, so the page drawn on the server and in the browser name the drag area alike. */}
      <DndContext id={`card-photos-${activity.id}`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={horizontalListSortingStrategy} disabled={readOnly || busy}>
          {photos.map((photo, index) => (
            <PhotoThumb key={ids[index]} id={ids[index]} photo={photo} first={index === 0} onOpen={() => setViewing(index)} />
          ))}
        </SortableContext>
      </DndContext>
      {readOnly || photos.length >= MAX_PHOTOS ? null : (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-14"
                aria-label="Add a photo"
                disabled={busy}
                onClick={() => setAdding(true)}
              >
                <PlusIcon className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add a photo</TooltipContent>
          </Tooltip>
          <UnsplashPicker startQuery={activity.place?.name || activity.title} onPick={(photo) => add(photo)} />
          <MediaPicker
            open={adding}
            onOpenChange={setAdding}
            onSelectMedia={(url) => (url ? add({ url, credit: null }) : undefined)}
            showVideos={false}
            defaultCropAspect="wide"
          />
        </>
      )}
      <PhotoViewer
        photos={photos}
        at={viewing}
        title={activity.title}
        readOnly={readOnly}
        busy={busy}
        onMove={setViewing}
        onClose={() => setViewing(null)}
        onRemove={(index) => {
          setViewing(null)
          void save(
            photos.filter((_, each) => each !== index),
            "Photo removed from the card. It's still in your media library."
          )
        }}
      />
    </div>
  )
}

function PhotoThumb({ id, photo, first, onOpen }: { id: string; photo: CardPhoto; first: boolean; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const label = first ? "Open the card's picture" : "Open this photo"
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          ref={setNodeRef}
          type="button"
          aria-label={label}
          style={{ transform: CSS.Transform.toString(transform), transition }}
          className={cn(
            "size-14 shrink-0 overflow-hidden rounded-md border bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
            first && "ring-2 ring-primary",
            isDragging && "opacity-60"
          )}
          {...attributes}
          {...listeners}
          onClick={onOpen}
        >
          <img src={photo.url} alt="" loading="lazy" className="size-full object-cover" />
        </button>
      </TooltipTrigger>
      <TooltipContent>{first ? "The card's picture. Drag another here to swap." : "Drag to reorder"}</TooltipContent>
    </Tooltip>
  )
}

function PhotoViewer({
  photos,
  at,
  title,
  readOnly,
  busy,
  onMove,
  onClose,
  onRemove,
}: {
  photos: CardPhoto[]
  at: number | null
  title: string
  readOnly: boolean
  busy: boolean
  onMove: (index: number) => void
  onClose: () => void
  onRemove: (index: number) => void
}) {
  const photo = at === null ? null : photos[at]
  return (
    <Dialog open={photo !== null} onOpenChange={(next) => (next ? undefined : onClose())}>
      <DialogContent variant="admin" className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            Photo {(at ?? 0) + 1} of {photos.length}
            {at === 0 ? ", the card's picture" : ""}
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {photo ? (
            <figure className="grid gap-1">
              <img src={photo.url} alt="" className="max-h-[70vh] w-full rounded-md bg-muted object-contain" />
              {photo.credit ? <PhotoCreditLine credit={photo.credit} /> : null}
            </figure>
          ) : null}
        </DialogBody>
        <DialogFooter>
          {readOnly || at === null ? null : (
            <Button type="button" variant="destructive" className="sm:mr-auto" disabled={busy} onClick={() => onRemove(at)}>
              <Trash2Icon className="size-4" />
              Remove
            </Button>
          )}
          {photos.length > 1 ? (
            <>
          <Button
            type="button"
            variant="outline"
            aria-label="Previous photo"
            disabled={at === null || at === 0}
            onClick={() => at !== null && onMove(at - 1)}
          >
            <ChevronLeftIcon className="size-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            aria-label="Next photo"
            disabled={at === null || at >= photos.length - 1}
            onClick={() => at !== null && onMove(at + 1)}
          >
            <ChevronRightIcon className="size-4" />
          </Button>
            </>
          ) : null}
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
