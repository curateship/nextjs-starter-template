import { describe, expect, it } from "vitest"

import {
  describePixabayRefusal,
  readPixabayLines,
  readPixabayLink,
  splitPixabayText,
  waitsForPixabayFile,
} from "@/lib/pomodoro/pixabay-links"

/** The pasted-link reader both the import window and the server use. */

describe("readPixabayLink", () => {
  it("reads a photo and an illustration as stills on Themes", () => {
    expect(
      readPixabayLink("https://pixabay.com/photos/forest-fog-trees-195893/", "theme")
    ).toEqual({
      ok: true,
      link: {
        id: "195893",
        family: "image",
        pageUrl: "https://pixabay.com/photos/forest-fog-trees-195893/",
        label: "Forest fog trees",
        descriptor: "static",
      },
    })
    expect(
      readPixabayLink("https://pixabay.com/illustrations/night-sky-stars-1234/", "theme")
    ).toMatchObject({ ok: true, link: { family: "image", descriptor: "static" } })
  })

  it("reads a video as a film on Themes", () => {
    expect(
      readPixabayLink("https://pixabay.com/videos/rain-window-glass-28470/", "theme")
    ).toMatchObject({
      ok: true,
      link: { id: "28470", family: "video", descriptor: "video", label: "Rain window glass" },
    })
  })

  it("reads music and sound effects on Sounds, and says a repeated word once", () => {
    expect(
      readPixabayLink("https://pixabay.com/music/lofi-lofi-chill-vlog-beats-573883/", "sound")
    ).toMatchObject({
      ok: true,
      link: { id: "573883", family: "audio", descriptor: "music", label: "Lofi chill vlog beats" },
    })
    expect(
      readPixabayLink("https://pixabay.com/sound-effects/rain-and-thunder-16705/", "sound")
    ).toMatchObject({ ok: true, link: { descriptor: "ambient", label: "Rain and thunder" } })
  })

  it("names a link with no words in it after its number", () => {
    expect(readPixabayLink("https://pixabay.com/videos/id-11722/", "theme")).toMatchObject({
      ok: true,
      link: { id: "11722", label: "Pixabay 11722" },
    })
  })

  it("drops a language, www, the query string and a missing https", () => {
    const result = readPixabayLink(
      "www.pixabay.com/de/photos/wald-nebel-195893/?utm_source=link",
      "theme"
    )
    expect(result).toMatchObject({
      ok: true,
      link: { id: "195893", pageUrl: "https://pixabay.com/photos/wald-nebel-195893/" },
    })
  })

  it("refuses a link for the other page and says which page takes it", () => {
    expect(readPixabayLink("https://pixabay.com/photos/sea-1/", "sound")).toEqual({
      ok: false,
      reason: "is a photo, paste it on Themes",
    })
    expect(readPixabayLink("https://pixabay.com/videos/sea-1/", "sound")).toMatchObject({
      reason: "is a film, paste it on Themes",
    })
    expect(readPixabayLink("https://pixabay.com/music/beats-1/", "theme")).toMatchObject({
      reason: "is a music link, paste it on Sounds",
    })
  })

  it("refuses vectors, bare numbers, searches, profiles and other sites", () => {
    expect(readPixabayLink("https://pixabay.com/vectors/tree-1/", "theme")).toMatchObject({
      reason: "is a vector, and vectors are not used as themes",
    })
    expect(readPixabayLink("573883", "sound")).toMatchObject({
      reason: "is a number, not the page link",
    })
    expect(
      readPixabayLink("https://pixabay.com/photos/search/forest/", "theme")
    ).toMatchObject({ reason: "is a search, not one item" })
    expect(readPixabayLink("https://pixabay.com/users/someone-12345/", "theme")).toMatchObject({
      reason: "is a search, not one item",
    })
    expect(readPixabayLink("https://pixabay.com/photos/", "theme")).toMatchObject({
      reason: "is a search, not one item",
    })
    expect(readPixabayLink("https://unsplash.com/photos/forest-1/", "theme")).toMatchObject({
      reason: "is not a pixabay.com link",
    })
    expect(readPixabayLink("https://pixabay.com.evil.test/photos/a-1/", "theme")).toMatchObject({
      reason: "is not a pixabay.com link",
    })
    expect(readPixabayLink("ftp://pixabay.com/photos/a-1/", "theme")).toMatchObject({
      reason: "is not a pixabay.com link",
    })
    expect(readPixabayLink("not a link at all", "theme")).toMatchObject({ ok: false })
  })
})

describe("readPixabayLines", () => {
  it("numbers lines as typed and refuses the second copy of an item", () => {
    const lines = splitPixabayText(
      [
        "https://pixabay.com/photos/forest-1/",
        "",
        "https://pixabay.com/de/photos/wald-1/",
        "https://pixabay.com/videos/forest-1/",
      ].join("\n")
    )
    const results = readPixabayLines(lines, "theme")
    expect(results.map((result) => [result.line, result.ok])).toEqual([
      [1, true],
      [3, false],
      // A film and a photo with the same number are different items.
      [4, true],
    ])
    expect(describePixabayRefusal(results[1] as { line: number; reason: string })).toBe(
      "Line 3 repeats line 1."
    )
  })
})

describe("waitsForPixabayFile", () => {
  const sound = {
    kind: "sound" as const,
    fileUrl: null,
    fileStatus: "ready",
    sourceUrl: "https://pixabay.com/music/beats-1/",
  }

  it("is a Pixabay sound with no file, and not one whose MP3 is being prepared", () => {
    expect(waitsForPixabayFile(sound)).toBe(true)
    expect(waitsForPixabayFile({ ...sound, fileStatus: "failed" })).toBe(true)
    expect(waitsForPixabayFile({ ...sound, fileStatus: "queued" })).toBe(false)
    expect(waitsForPixabayFile({ ...sound, fileUrl: "https://files.test/a.mp3" })).toBe(false)
    expect(waitsForPixabayFile({ ...sound, sourceUrl: "https://freesound.org/s/1/" })).toBe(false)
    expect(waitsForPixabayFile({ ...sound, kind: "theme" })).toBe(false)
  })
})
