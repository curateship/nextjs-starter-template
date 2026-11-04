import { describe, expect, it } from "vitest"

import {
  repeatsThumbnailWords,
  translatedFontSize,
  youtubeVideoId,
} from "./thumbnail-ai"
import {
  thumbnailLayersSchema,
  fillSpots,
  hasTextLook,
  newTextLayer,
  templateLayers,
  thumbnailWords,
  withoutTextLook,
  withTextLook,
} from "./thumbnails"

describe("a YouTube link", () => {
  it("gives its video id from every link shape", () => {
    expect(youtubeVideoId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10")).toBe("dQw4w9WgXcQ")
    expect(youtubeVideoId("https://youtu.be/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
    expect(youtubeVideoId("https://youtube.com/shorts/dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
    expect(youtubeVideoId("https://m.youtube.com/watch?v=dQw4w9WgXcQ")).toBe("dQw4w9WgXcQ")
  })

  it("refuses anything that is not YouTube", () => {
    expect(youtubeVideoId("https://evil.example/watch?v=dQw4w9WgXcQ")).toBeNull()
    expect(youtubeVideoId("https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ")).toBeNull()
    expect(youtubeVideoId("not a link")).toBeNull()
    expect(youtubeVideoId("https://youtube.com/watch?v=short")).toBeNull()
  })
})

describe("titles that match", () => {
  it("counts a title as repeating when it says a word the picture shows", () => {
    expect(repeatsThumbnailWords("I quit my job for this", "I QUIT")).toBe(true)
    expect(repeatsThumbnailWords("The day everything changed", "I QUIT")).toBe(false)
    // Little words don't count.
    expect(repeatsThumbnailWords("The end of the road", "THE BEST")).toBe(false)
  })
})

describe("translated words", () => {
  it("shrink by as much as they grew, and never grow", () => {
    expect(translatedFontSize(120, "BIG DAY", "GRAN DÍA")).toBe(105)
    expect(translatedFontSize(120, "HELLO WORLD", "HOLA")).toBe(120)
  })
})

describe("text looks", () => {
  const layer = { ...newTextLayer("wide", []), text: "I QUIT MY JOB" }

  it("marks the last word for 'one word in yellow' and takes it off again", () => {
    const yellow = withTextLook(layer, "accent")
    expect(yellow.marks).toEqual([{ start: 10, end: 13, style: "accent" }])
    expect(hasTextLook(yellow, "accent")).toBe(true)
    expect(hasTextLook(withoutTextLook(yellow, "accent"), "accent")).toBe(false)
  })

  it("puts a thick outline, a shadow and a box on and off", () => {
    for (const look of ["outline", "shadow", "box"] as const) {
      const on = withTextLook(withoutTextLook(layer, look), look)
      expect(hasTextLook(on, look)).toBe(true)
      expect(hasTextLook(withoutTextLook(on, look), look)).toBe(false)
    }
  })
})

describe("templates", () => {
  const picture = { id: "p", type: "image" as const, mediaId: "m", url: "u", fit: "cover" as const, x: 0.5, y: 0, width: 0.5, height: 1, zIndex: 0 }

  it("leave a spot where each picture was, and keep the words", () => {
    const layers = templateLayers([picture, { ...newTextLayer("wide", []), text: "HI" }])
    expect(layers.map((layer) => layer.type)).toEqual(["spot", "text"])
    expect(thumbnailWords(layers)).toBe("HI")
  })

  it("fill every spot with the frame, cropped into the spot", () => {
    const filled = fillSpots(templateLayers([picture]), { mediaId: "frame", url: "f" })
    expect(filled[0]).toMatchObject({ type: "image", mediaId: "frame", x: 0.5, width: 0.5 })
    expect(fillSpots(templateLayers([picture]), null)).toEqual([])
  })
})

describe("saved layers", () => {
  it("refuse a layer id that could break out of the drawn markup", () => {
    const layer = { ...newTextLayer("wide", []), text: "HI" }
    expect(thumbnailLayersSchema.safeParse([layer]).success).toBe(true)
    expect(thumbnailLayersSchema.safeParse([{ ...layer, id: '"><set onbegin=alert(1)>' }]).success).toBe(false)
  })
})

