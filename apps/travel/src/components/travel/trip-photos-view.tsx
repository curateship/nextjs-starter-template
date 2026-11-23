import { ImagesIcon } from "lucide-react"

import { dayLabel } from "@/components/travel/new-activity"
import { useTrip } from "@/components/travel/trip-context"
import { ScrollArea } from "@/components/ui/scroll-area"
import type { Activity } from "@/lib/api/travel/trips"
import { smallPhoto, tripPhotoGroups, type TripPhoto } from "@/lib/travel/trip-photos"

/**
 * The Photos tab, after Map (Travel features 3, part 6; Tyler, 5 Nov 2026:
 * "Cards and notes"): every card's photos and every picture in the notes, as
 * one grid under a heading per day, then Ideas, then the trip's description
 * and notes. A card's photo opens the card; a picture in the trip's notes
 * opens that note in the left panel. It follows the board's search and Filter.
 */
export function TripPhotosView({ activities }: { activities: Activity[] }) {
  const { page, openActivity, openTripNote } = useTrip()
  const { trip } = page
  const groups = tripPhotoGroups({
    days: trip.days,
    activities,
    photos: page.photos,
    description: trip.description,
    notes: page.notes,
  })

  function open(photo: TripPhoto) {
    if (photo.home.kind === "card") openActivity(photo.home.activityId)
    else openTripNote(photo.home.noteId)
  }

  if (!groups.length) {
    return (
      <div className="grid flex-1 content-center justify-items-center gap-2 p-6 text-center">
        <ImagesIcon className="size-5 text-muted-foreground" aria-hidden />
        <p className="max-w-72 text-sm text-muted-foreground">
          No photos yet. Give a card a picture from its ⋮ menu, or type "/" in any note and pick Image.
        </p>
      </div>
    )
  }

  return (
    <ScrollArea className="min-h-0 flex-1" viewportClassName="h-full">
      <div className="grid gap-4 p-3">
        {groups.map((group) => (
          <section key={group.key} className="grid gap-2">
            <h3 className="text-sm font-medium">
              {group.day === "notes" ? "Trip notes" : group.day === null ? "Ideas" : dayLabel(group.day, trip.startDate)}
              <span className="ml-2 text-muted-foreground">{group.photos.length}</span>
            </h3>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-2">
              {group.photos.map((photo, index) => (
                <li key={`${photo.url}:${index}`}>
                  <button
                    type="button"
                    aria-label={`Open ${photo.caption}`}
                    className="group/photo grid w-full gap-1 text-left focus-visible:outline-none"
                    onClick={() => open(photo)}
                  >
                    <img
                      src={smallPhoto(photo.url)}
                      alt=""
                      loading="lazy"
                      className="aspect-square w-full rounded-md border bg-muted object-cover group-focus-visible/photo:ring-2 group-focus-visible/photo:ring-ring"
                    />
                    <span className="truncate text-xs text-muted-foreground">{photo.caption}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </ScrollArea>
  )
}
