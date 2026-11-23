import {
  DndContext,
  closestCenter,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core"
import {
  SortableContext,
  arrayMove,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable"
import { GripVerticalIcon, XIcon } from "lucide-react"

import { ListingPicker } from "@/components/directory/listing-picker"
import {
  useNavSensors,
  useSortableRow,
} from "@/components/settings/nav-editor-shared"
import { Button } from "@/components/ui/button"
import { DisabledReason } from "@/components/ui/disabled-reason"
import { type GuideListing } from "@/lib/api/directory/guides"
import { MAX_GUIDE_LISTINGS } from "@/lib/directory/guides"
import { focusRing } from "@/lib/layout/focus-ring"
import { mediaImageSrcSet } from "@/lib/media/image-sizes"
import { showErrorToast } from "@/lib/toast/error-toast"

/**
 * The guide's listings, one row each, dragged by the grip into order. The grip
 * also moves a row from the keyboard: Space picks it up, the arrows move it,
 * Space puts it down.
 */
export function GuideListings({
  listings,
  disabled,
  onChange,
}: {
  listings: GuideListing[]
  disabled: boolean
  onChange: (listings: GuideListing[]) => void
}) {
  const sensors = useNavSensors()
  const ids = listings.map((row) => row.id)
  const full = listings.length >= MAX_GUIDE_LISTINGS

  // What a screen reader hears while a row moves: the listing's name and its
  // new place, rather than the ids dnd-kit would read out on its own.
  const titleOf = (id: string | number) =>
    listings.find((row) => row.id === String(id))?.title ?? "The listing"
  const placeOf = (id: string | number | undefined) =>
    id === undefined ? null : ids.indexOf(String(id)) + 1
  const announcements: Announcements = {
    onDragStart: ({ active }) =>
      `Picked up ${titleOf(active.id)}, number ${placeOf(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${titleOf(active.id)} is over number ${placeOf(over.id)}.`
        : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? `${titleOf(active.id)} dropped at number ${placeOf(over.id)}.`
        : `${titleOf(active.id)} dropped where it was.`,
    onDragCancel: ({ active }) =>
      `${titleOf(active.id)} put back where it was.`,
  }

  const handleDragEnd = (event: DragEndEvent) => {
    if (!event.over || event.active.id === event.over.id) return
    const from = ids.indexOf(String(event.active.id))
    const to = ids.indexOf(String(event.over.id))
    if (from === -1 || to === -1) return
    onChange(arrayMove(listings, from, to))
  }

  return (
    <div className="grid gap-3">
      {listings.length ? (
        <DndContext
          id="guide-listings"
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
          accessibility={{ announcements }}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            <ol className="grid gap-2">
              {listings.map((listing, index) => (
                <GuideListingRow
                  key={listing.id}
                  listing={listing}
                  position={index + 1}
                  disabled={disabled}
                  onRemove={() =>
                    onChange(listings.filter((row) => row.id !== listing.id))
                  }
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      ) : (
        <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
          No listings yet. Add the first one.
        </p>
      )}
      <div>
        <DisabledReason
          disabled={full}
          reason={`A guide holds up to ${MAX_GUIDE_LISTINGS} listings.`}
        >
          <ListingPicker
            label="Add a listing"
            inputId="guide-listing-search"
            size="sm"
            disabled={disabled || full}
            onPick={(picked) => {
              if (ids.includes(picked.id)) {
                showErrorToast(`${picked.title} is already in this guide.`)
                return
              }
              onChange([
                ...listings,
                {
                  id: picked.id,
                  title: picked.title,
                  status: picked.status,
                  featuredImage: picked.featuredImage,
                },
              ])
            }}
          />
        </DisabledReason>
      </div>
    </div>
  )
}

function GuideListingRow({
  listing,
  position,
  disabled,
  onRemove,
}: {
  listing: GuideListing
  position: number
  disabled: boolean
  onRemove: () => void
}) {
  const { attributes, listeners, setNodeRef, style } = useSortableRow(
    listing.id
  )
  const notShown =
    listing.status === "draft"
      ? "Draft, so the page leaves it out"
      : listing.status === "closed"
        ? "Closed, so the page leaves it out"
        : null

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex min-w-0 items-center gap-2 rounded-lg border bg-background p-2"
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        disabled={disabled}
        aria-label={`Move ${listing.title}, number ${position}`}
        className={`flex size-8 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground active:cursor-grabbing ${focusRing}`}
      >
        <GripVerticalIcon className="size-4" />
      </button>
      {listing.featuredImage ? (
        <img
          src={listing.featuredImage}
          srcSet={mediaImageSrcSet(listing.featuredImage)}
          sizes="40px"
          alt=""
          className="size-10 shrink-0 rounded-md object-cover"
        />
      ) : (
        <div className="size-10 shrink-0 rounded-md bg-muted" aria-hidden="true" />
      )}
      <div className="grid min-w-0 flex-1 gap-0.5">
        <p className="truncate text-sm font-medium">
          <span className="text-muted-foreground tabular-nums">{position}.</span>{" "}
          {listing.title}
        </p>
        {notShown ? (
          <p className="truncate text-xs text-muted-foreground">{notShown}</p>
        ) : null}
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        disabled={disabled}
        aria-label={`Take ${listing.title} out of the guide`}
        onClick={onRemove}
      >
        <XIcon className="size-4" />
      </Button>
    </li>
  )
}
