import { describe, expect, it } from "vitest"

import { cleanNoteBody, noteIsEmpty, notePictures, noteText, swapNoteCards } from "@/lib/travel/note-blocks"
import { copiedNotes, readNotes, storedNotes } from "@/lib/travel/notes"
import { readVideoLink, SHORT_TIKTOK_REFUSED, VIDEO_LINK_REFUSED, videoLinkProblem } from "@/lib/travel/video-links"

const credit = { name: "Ana", profileUrl: "https://unsplash.com/@ana", photoPageUrl: "https://unsplash.com/photos/abc" }
const paragraph = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] })
const doc = (...content: unknown[]) => ({ type: "doc", content })

describe("what a Travel note keeps", () => {
  it("keeps the four blocks with only their own values", () => {
    const cleaned = cleanNoteBody(
      doc(
        paragraph("Before"),
        { type: "noteImage", attrs: { src: "https://pub.example.r2.dev/a.jpg", alt: "Gate", credit: null, onclick: "x" } },
        { type: "notePlace", attrs: { activityId: "card-1", extra: true } },
        { type: "noteVideo", attrs: { url: "https://youtu.be/dQw4w9WgXcQ" } },
        { type: "noteMap", attrs: { activityIds: ["card-1", "card-2", "card-1"] } }
      )
    )
    expect(cleaned.content).toEqual([
      paragraph("Before"),
      { type: "noteImage", attrs: { src: "https://pub.example.r2.dev/a.jpg", alt: "Gate", credit: null } },
      { type: "notePlace", attrs: { activityId: "card-1" } },
      { type: "noteVideo", attrs: { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" } },
      { type: "noteMap", attrs: { activityIds: ["card-1", "card-2"] } },
    ])
  })

  it("drops a block it can't trust", () => {
    const cleaned = cleanNoteBody(
      doc(
        { type: "noteImage", attrs: { src: "javascript:alert(1)" } },
        { type: "noteImage", attrs: { src: "http://example.com/a.jpg" } },
        // An Unsplash photo without its credit breaks Unsplash's rules.
        { type: "noteImage", attrs: { src: "https://images.unsplash.com/photo-1", credit: null } },
        { type: "noteImage", attrs: { src: null } },
        { type: "noteVideo", attrs: { url: "https://vimeo.com/123" } },
        { type: "notePlace", attrs: {} },
        { type: "noteMap", attrs: { activityIds: [] } },
        { type: "script", attrs: { src: "https://evil.example" } }
      )
    )
    expect(cleaned.content).toEqual([])
  })

  it("keeps an Unsplash photo that has its credit", () => {
    const cleaned = cleanNoteBody(doc({ type: "noteImage", attrs: { src: "https://images.unsplash.com/photo-1", credit } }))
    expect(cleaned.content?.[0].attrs).toEqual({ src: "https://images.unsplash.com/photo-1", alt: "", credit })
  })

  it("still cleans words by the shell's written-page rules, inside lists too", () => {
    const cleaned = cleanNoteBody(
      doc({
        type: "bulletList",
        content: [
          {
            type: "listItem",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "Tea", marks: [{ type: "link", attrs: { href: "javascript:x" } }] }] },
              { type: "noteImage", attrs: { src: "https://pub.example.r2.dev/tea.jpg" } },
            ],
          },
        ],
      })
    )
    const item = cleaned.content?.[0].content?.[0]
    expect(item?.content?.[0].content?.[0]).toEqual({ type: "text", text: "Tea" })
    expect(item?.content?.[1]).toEqual({ type: "noteImage", attrs: { src: "https://pub.example.r2.dev/tea.jpg", alt: "", credit: null } })
  })

  it("saves a note holding only a block, and saves nothing for an empty one", () => {
    const onlyMap = JSON.stringify(doc({ type: "noteMap", attrs: { activityIds: ["a"] } }))
    expect(storedNotes(onlyMap)).toBe(onlyMap)
    expect(storedNotes(JSON.stringify(doc({ type: "paragraph" })))).toBe("")
    expect(noteIsEmpty(readNotes(onlyMap))).toBe(false)
  })

  it("reads a note's pictures and words", () => {
    const note = readNotes(
      JSON.stringify(
        doc(paragraph("Kyoto"), { type: "noteImage", attrs: { src: "https://pub.example.r2.dev/1.jpg" } }, paragraph("day"))
      )
    )
    expect(notePictures(note).map((picture) => picture.src)).toEqual(["https://pub.example.r2.dev/1.jpg"])
    expect(noteText(note)).toBe("Kyoto day")
  })

  it("points a copied trip's notes at the copies", () => {
    const note = cleanNoteBody(
      doc(
        { type: "notePlace", attrs: { activityId: "old-1" } },
        { type: "notePlace", attrs: { activityId: "gone" } },
        { type: "noteMap", attrs: { activityIds: ["old-1", "gone", "old-2"] } }
      )
    )
    const swapped = swapNoteCards(note, new Map([["old-1", "new-1"], ["old-2", "new-2"]]))
    expect(swapped.content).toEqual([
      { type: "notePlace", attrs: { activityId: "new-1" } },
      { type: "paragraph" },
      { type: "noteMap", attrs: { activityIds: ["new-1", "new-2"] } },
    ])
  })

  it("drops the old trip's cards from a note copied to a saved place or another trip", () => {
    const stored = JSON.stringify(
      doc(
        paragraph("Go early"),
        { type: "notePlace", attrs: { activityId: "old-1" } },
        { type: "noteMap", attrs: { activityIds: ["old-1", "old-2"] } },
        { type: "noteVideo", attrs: { url: "https://youtu.be/dQw4w9WgXcQ" } }
      )
    )
    expect(readNotes(copiedNotes(stored)).content).toEqual([
      paragraph("Go early"),
      { type: "paragraph" },
      { type: "paragraph" },
      { type: "noteVideo", attrs: { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" } },
    ])
    expect(copiedNotes("")).toBe("")
    // A note that was only cards to the old trip copies as no note at all.
    expect(copiedNotes(JSON.stringify(doc({ type: "notePlace", attrs: { activityId: "old-1" } })))).toBe("")
  })
})

describe("video links", () => {
  it("reads each site's links into one plain address and player", () => {
    expect(readVideoLink("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10")?.playerUrl).toBe(
      "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?autoplay=1"
    )
    expect(readVideoLink("https://youtube.com/shorts/dQw4w9WgXcQ")?.url).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ")
    expect(readVideoLink("https://m.youtube.com/watch?v=dQw4w9WgXcQ")?.site).toBe("youtube")
    expect(readVideoLink("https://www.tiktok.com/@ramen.tokyo/video/7301234567890123456?lang=en")).toMatchObject({
      site: "tiktok",
      url: "https://www.tiktok.com/@ramen.tokyo/video/7301234567890123456",
      playerUrl: "https://www.tiktok.com/embed/v2/7301234567890123456",
    })
    expect(readVideoLink("https://www.instagram.com/reel/C1a2B3c4D5e/?igsh=x")).toMatchObject({
      site: "instagram",
      playerUrl: "https://www.instagram.com/reel/C1a2B3c4D5e/embed",
    })
    expect(readVideoLink("https://www.instagram.com/p/C1a2B3c4D5e/")?.url).toBe("https://www.instagram.com/p/C1a2B3c4D5e/")
  })

  it("refuses anything else, saying what to paste", () => {
    expect(readVideoLink("https://vimeo.com/123")).toBeNull()
    expect(readVideoLink("https://www.youtube.com/watch?v=short")).toBeNull()
    expect(readVideoLink("not a link")).toBeNull()
    expect(readVideoLink("https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ")).toBeNull()
    expect(videoLinkProblem("https://vimeo.com/123")).toBe(VIDEO_LINK_REFUSED)
    expect(videoLinkProblem("https://vm.tiktok.com/ZMabc/")).toBe(SHORT_TIKTOK_REFUSED)
  })
})

describe("Project's basic blocks in a Travel note", () => {
  it("keeps a Checklist, Callout, Divider, Fold section and Links with only their own values", () => {
    const cleaned = cleanNoteBody(
      doc(
        { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true, extra: 1 }, content: [paragraph("Pack charger")] }] },
        { type: "noteCallout", attrs: { kind: "shout" }, content: [paragraph("Shoes off"), { type: "noteVideo", attrs: { url: "https://youtu.be/dQw4w9WgXcQ" } }] },
        { type: "horizontalRule", attrs: { color: "red" } },
        { type: "noteFold", attrs: { id: "fold-1" }, content: [{ type: "text", text: "Extra" }] },
        { type: "noteLinks", attrs: { links: [{ label: "Ryokan", url: "https://example.com/r" }, { label: "Bad", url: "http://example.com" }] } }
      )
    )
    expect(cleaned.content).toEqual([
      { type: "taskList", content: [{ type: "taskItem", attrs: { checked: true }, content: [paragraph("Pack charger")] }] },
      // An unknown kind is a Note, and only words go inside.
      { type: "noteCallout", attrs: { kind: "note" }, content: [paragraph("Shoes off")] },
      { type: "horizontalRule" },
      { type: "noteFold", attrs: { id: "fold-1" }, content: [{ type: "text", text: "Extra" }] },
      // Only https addresses stay.
      { type: "noteLinks", attrs: { links: [{ label: "Ryokan", url: "https://example.com/r" }] } },
    ])
  })

  it("drops a Links block with no address it can keep, and an empty Checklist", () => {
    const cleaned = cleanNoteBody(doc({ type: "noteLinks", attrs: { links: [{ url: "javascript:alert(1)" }] } }, { type: "taskList", content: [] }))
    expect(cleaned.content).toEqual([])
  })

  it("counts a Divider as something to save", () => {
    expect(storedNotes(JSON.stringify(doc({ type: "horizontalRule" })))).toBe(JSON.stringify(doc({ type: "horizontalRule" })))
    expect(readNotes(JSON.stringify(doc({ type: "horizontalRule" }))).content).toEqual([{ type: "horizontalRule" }])
  })
})
