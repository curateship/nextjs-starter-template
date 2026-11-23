import { boardColumns, dayOfColumn, type BoardActivity } from "@/lib/travel/board"
import { cardPhotos, type RowPhoto } from "@/lib/travel/card-photos"
import { notePictures } from "@/lib/travel/note-blocks"
import { readNotes } from "@/lib/travel/notes"
import type { PhotoCredit } from "@/lib/travel/rules"

/** Where a photo on the Photos tab lives, so a click opens it there. */
export type PhotoHome = { kind: "card"; activityId: string } | { kind: "note"; noteId: string | null }

export type TripPhoto = RowPhoto & { home: PhotoHome; caption: string }

/** One heading of the Photos tab: a day, Ideas, or the trip's own notes. */
export type TripPhotoGroup = { key: string; day: number | null | "notes"; photos: TripPhoto[] }

type PhotoCard = BoardActivity & {
  id: string
  title: string
  notes: string
  photoUrl: string | null
  photoCredit: PhotoCredit | null
}

/**
 * Every photo on a trip for its Photos tab (Travel features 3, part 6; Tyler,
 * 5 Nov 2026: "Cards and notes"): each card's row of photos and the pictures
 * in its notes, day by day as the board orders them, then Ideas, then the
 * pictures in the trip's description and notes. Headings with no photo are
 * left out.
 */
export function tripPhotoGroups(input: {
  days: number
  activities: readonly PhotoCard[]
  photos: readonly (RowPhoto & { activityId: string })[]
  description: string
  notes: readonly { id: string; body: string }[]
}): TripPhotoGroup[] {
  const columns = [...boardColumns(input.days, input.activities).entries()]
  const ordered = [...columns.slice(1), columns[0]]
  const groups: TripPhotoGroup[] = ordered.map(([key, cards]) => ({
    key,
    day: dayOfColumn(key),
    photos: cards.flatMap((card) => {
      const home: PhotoHome = { kind: "card", activityId: card.id }
      const fromNotes = notePictures(readNotes(card.notes)).map(({ src, credit }) => ({ url: src, credit }))
      return [...cardPhotos(card, input.photos), ...fromNotes].map((photo) => ({ ...photo, home, caption: card.title }))
    }),
  }))
  const tripNotes: TripPhoto[] = [
    ...notePictures(readNotes(input.description)).map(({ src, credit }) => ({
      url: src,
      credit,
      home: { kind: "note" as const, noteId: null },
      caption: "Trip description",
    })),
    ...input.notes.flatMap((note) =>
      notePictures(readNotes(note.body)).map(({ src, credit }) => ({
        url: src,
        credit,
        home: { kind: "note" as const, noteId: note.id },
        caption: "Trip note",
      }))
    ),
  ]
  groups.push({ key: "notes", day: "notes", photos: tripNotes })
  return groups.filter((group) => group.photos.length)
}

/** A smaller copy for the grid when the host makes one (Unsplash); an uploaded photo is shown as it is. */
export function smallPhoto(url: string) {
  try {
    const parsed = new URL(url)
    if (parsed.hostname !== "images.unsplash.com") return url
    parsed.searchParams.set("w", "480")
    parsed.searchParams.set("q", "70")
    return parsed.toString()
  } catch {
    return url
  }
}
