import { describe, expect, it } from "vitest"

import { smallPhoto, tripPhotoGroups } from "@/lib/travel/trip-photos"

const picture = (src: string) => JSON.stringify({ type: "doc", content: [{ type: "noteImage", attrs: { src } }] })
const card = (id: string, day: number | null, patch: { photoUrl?: string; notes?: string } = {}) => ({
  id,
  day,
  position: 0,
  startTime: null,
  durationMinutes: null,
  title: id,
  notes: patch.notes ?? "",
  photoUrl: patch.photoUrl ?? null,
  photoCredit: null,
})

describe("the Photos tab (Travel features 3, part 6)", () => {
  it("shows cards' photos and note pictures day by day, then Ideas, then the trip's notes", () => {
    const groups = tripPhotoGroups({
      days: 3,
      activities: [
        card("idea", null, { photoUrl: "https://r2.example/idea.jpg" }),
        card("temple", 2, { photoUrl: "https://r2.example/temple.jpg", notes: picture("https://r2.example/gate.jpg") }),
        card("bare", 1),
      ],
      photos: [{ activityId: "temple", url: "https://r2.example/temple-2.jpg", credit: null }],
      description: picture("https://r2.example/cover.jpg"),
      notes: [{ id: "note-1", body: picture("https://r2.example/map.jpg") }],
    })
    expect(groups.map((group) => [group.day, group.photos.map((photo) => photo.url)])).toEqual([
      [2, ["https://r2.example/temple.jpg", "https://r2.example/temple-2.jpg", "https://r2.example/gate.jpg"]],
      [null, ["https://r2.example/idea.jpg"]],
      ["notes", ["https://r2.example/cover.jpg", "https://r2.example/map.jpg"]],
    ])
    expect(groups[0].photos[2].home).toEqual({ kind: "card", activityId: "temple" })
    expect(groups[2].photos.map((photo) => photo.home)).toEqual([
      { kind: "note", noteId: null },
      { kind: "note", noteId: "note-1" },
    ])
  })

  it("is empty when nothing has a photo", () => {
    expect(tripPhotoGroups({ days: 2, activities: [card("a", 1)], photos: [], description: "", notes: [] })).toEqual([])
  })

  it("asks Unsplash for a small copy and leaves uploads alone", () => {
    expect(smallPhoto("https://images.unsplash.com/photo-1?ixid=x")).toBe("https://images.unsplash.com/photo-1?ixid=x&w=480&q=70")
    expect(smallPhoto("https://r2.example/a.jpg")).toBe("https://r2.example/a.jpg")
  })
})
