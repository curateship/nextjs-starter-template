import { describe, expect, it } from "vitest"

import { thumbnailLayersSchema } from "@/lib/video/thumbnails"

import { thumbnailAnswerSchema, thumbnailLayersFrom } from "./thumbnail-answer"

/** The Pomodoro thumbnail: the scene, a shade, the title, a ring and 25/05. */
const answer = thumbnailAnswerSchema.parse({
  base: "P1",
  shade: "top",
  layers: [
    { type: "text", text: "STUDY POMODORO", font: "fredoka", size: 96, x: 0.5, y: 0.08 },
    { type: "ring", x: 0.5, y: 0.55, size: 0.55, width: 8 },
    { type: "text", text: "25/05", font: "fredoka", size: 200, x: 0.5, y: 0.55 },
  ],
})

describe("an AI thumbnail's board", () => {
  const layers = thumbnailLayersFrom(answer, { mediaId: "cafe", url: "https://x/cafe.jpg", name: "Café" }, "wide")

  it("is layers the Thumbnail board takes, the picture under everything", () => {
    expect(thumbnailLayersSchema.parse(layers)).toHaveLength(5)
    expect(layers[0]).toMatchObject({ type: "image", mediaId: "cafe", fit: "cover", zIndex: 0 })
    expect(layers[1]).toMatchObject({ type: "gradient-shadow", y: 0 })
  })

  it("puts the words centred where the answer says, in its font", () => {
    const title = layers.find((layer) => layer.type === "text" && layer.text === "STUDY POMODORO")!
    expect(title).toMatchObject({ fontId: "fredoka", fontSize: 96, align: "center" })
    expect(title.x + title.width / 2).toBeCloseTo(0.5)
    expect(title.y + title.height / 2).toBeCloseTo(0.08)
  })

  it("draws the ring as a true circle on a wide board", () => {
    const ring = layers.find((layer) => layer.type === "shape")!
    // As many pixels across as down: 0.55 of 720 high is 0.309 of 1280 wide.
    expect(ring.height * 720).toBeCloseTo(ring.width * 1280)
    expect(ring.x + ring.width / 2).toBeCloseTo(0.5)
    expect(ring).toMatchObject({ shape: "circle", lineWidth: 8, color: "#ffffff" })
  })
})
