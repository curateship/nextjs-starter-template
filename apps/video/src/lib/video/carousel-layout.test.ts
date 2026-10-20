import { describe, expect, it } from "vitest"

import {
  findTextOverflow,
  matchSlideLayers,
  pushSlideLayout,
  relayoutSlides,
  textOverflows,
} from "@/lib/video/carousel-layout"
import {
  carouselSlidesSchema,
  type CarouselFormat,
  type CarouselGradientShadowItem,
  type CarouselSlide,
  type CarouselSlideItem,
  type CarouselTextItem,
} from "@/lib/video/carousel-schema"

const HEIGHTS: Record<CarouselFormat, number> = {
  "4:5": 1350,
  "1:1": 1080,
  "9:16": 1920,
}

function image(id: string, box: [number, number, number, number]) {
  const [x, y, width, height] = box
  return {
    id,
    type: "image",
    mediaId: "media-1",
    url: "/media-1.png",
    fit: "contain",
    x,
    y,
    width,
    height,
    zIndex: 0,
  } satisfies CarouselSlideItem
}

function text(
  id: string,
  words: string,
  box: [number, number, number, number],
  fontSize = 72
): CarouselTextItem {
  const [x, y, width, height] = box
  return {
    id,
    type: "text",
    text: words,
    x,
    y,
    width,
    height,
    zIndex: 10,
    fontId: "inter",
    fontSize,
    color: "#ffffff",
    align: "left",
  }
}

function slideOf(...items: CarouselSlideItem[]): CarouselSlide {
  return { id: "slide-1", title: "Hook", backgroundColor: "#111827", items }
}

function moved(
  item: CarouselSlideItem,
  from: CarouselFormat,
  to: CarouselFormat
) {
  const [slide] = relayoutSlides([slideOf(item)], from, to)
  expect(carouselSlidesSchema.safeParse([slide]).success).toBe(true)
  return slide.items[0]
}

function pixels(item: CarouselSlideItem, format: CarouselFormat) {
  return {
    x: item.x * 1080,
    y: item.y * HEIGHTS[format],
    width: item.width * 1080,
    height: item.height * HEIGHTS[format],
  }
}

describe("relayoutSlides", () => {
  it("keeps a circle a circle and its centre where it was", () => {
    // 216 by 216 pixels in a 4:5 slide, centred 40 out of 100 down.
    const circle = image("circle", [0.4, 0.32, 0.2, 0.16])
    const story = moved(circle, "4:5", "9:16")
    const box = pixels(story, "9:16")
    expect(box.width).toBeCloseTo(216)
    expect(box.height).toBeCloseTo(216)
    expect(box.x).toBeCloseTo(432)
    expect(story.y + story.height / 2).toBeCloseTo(0.4)
  })

  it("keeps a corner logo's proportions in every shape", () => {
    const logo = image("logo", [0.8, 0.9, 0.16, 0.07])
    for (const to of ["1:1", "9:16"] as const) {
      const box = pixels(moved(logo, "4:5", to), to)
      expect(box.width / box.height).toBeCloseTo(172.8 / 94.5)
    }
  })

  it("keeps a layer that touches the top or bottom against that edge", () => {
    const bottomFade = image("bottom", [0, 0.5800000000000001, 1, 0.42])
    const topFade = image("top", [0, 0, 1, 0.42])
    const bottom = moved(bottomFade, "4:5", "9:16")
    expect(bottom.y + bottom.height).toBeCloseTo(1)
    expect(pixels(bottom, "9:16").height).toBeCloseTo(567)
    const top = moved(topFade, "4:5", "9:16")
    expect(top.y).toBe(0)
    expect(pixels(top, "9:16").height).toBeCloseTo(567)
  })

  it("keeps a layer that covers the slide covering it", () => {
    expect(moved(image("bg", [0, 0, 1, 1]), "4:5", "9:16")).toMatchObject({
      x: 0,
      y: 0,
      width: 1,
      height: 1,
    })
    expect(moved(image("left", [0, 0, 0.5, 1]), "9:16", "1:1")).toMatchObject({
      x: 0,
      y: 0,
      width: 0.5,
      height: 1,
    })
  })

  it("moves a layer that would poke off the slide back on", () => {
    // 192 tall, centred 8 out of 100 down a story: 86 pixels from the top of
    // a square, so its top would sit 10 pixels above the slide.
    const near = image("near", [0.1, 0.03, 0.3, 0.1])
    const square = moved(near, "9:16", "1:1")
    expect(square.y).toBe(0)
    expect(pixels(square, "1:1").height).toBeCloseTo(192)
  })

  it("shrinks a picture taller than the new slide evenly", () => {
    // 432 by 1536 in a story cannot fit a 1080-tall square.
    const tall = image("tall", [0.3, 0.05, 0.4, 0.8])
    const box = pixels(moved(tall, "9:16", "1:1"), "1:1")
    expect(box.height).toBeCloseTo(1080)
    expect(box.width).toBeCloseTo(432 * (1080 / 1536))
    expect(box.x + box.width / 2).toBeCloseTo(540)
  })

  it("cuts a text box taller than the new slide but keeps its width", () => {
    const words = text("words", "Long", [0.1, 0.05, 0.8, 0.8])
    const square = moved(words, "9:16", "1:1")
    expect(square).toMatchObject({ x: 0.1, y: 0, width: 0.8, height: 1 })
  })

  it("grows a layer too short for the new slide to the smallest box", () => {
    // 60 pixels in a square is 3 out of 100 of a story, under the 5 allowed.
    const logo = image("logo", [0.45, 0.4, 0.06, 0.0555])
    const box = pixels(moved(logo, "1:1", "9:16"), "9:16")
    expect(box.height).toBeCloseTo(96)
    expect(box.width / box.height).toBeCloseTo(64.8 / 59.94)
  })

  it("leaves the slides alone when the shape is the same", () => {
    const slides = [slideOf(image("bg", [0, 0, 1, 1]))]
    expect(relayoutSlides(slides, "4:5", "4:5")).toBe(slides)
  })
})

describe("text that does not fit", () => {
  it("flags a box shorter than the lines the export draws", () => {
    // "Your hook goes here" is one 84-pixel line at 72 pixels in an 864-wide box.
    const hook = text("hook", "Your hook goes here", [0.1, 0.6, 0.8, 0.07])
    expect(textOverflows(hook, "4:5")).toBe(false)
    expect(textOverflows({ ...hook, height: 0.04 }, "9:16")).toBe(true)
  })

  it("counts wrapped lines, not typed ones", () => {
    // Five lines of 13 letters in a 540-wide box, 418 pixels tall.
    const words = "A sentence long enough to wrap onto three lines here"
    const narrow = text("narrow", words, [0.1, 0.1, 0.5, 0.1])
    expect(textOverflows(narrow, "4:5")).toBe(true)
    expect(textOverflows({ ...narrow, height: 0.3 }, "4:5")).toBe(true)
    expect(textOverflows({ ...narrow, height: 0.35 }, "4:5")).toBe(false)
  })

  it("ignores blank lines after the words and empty boxes", () => {
    const trailing = text("t", "One line\n\n\n", [0.1, 0.1, 0.8, 0.07])
    expect(textOverflows(trailing, "4:5")).toBe(false)
    expect(textOverflows(text("e", "  ", [0, 0, 0.5, 0.05]), "9:16")).toBe(
      false
    )
  })

  it("names the slide and the layer", () => {
    const fits = text("fits", "Short", [0.1, 0.1, 0.8, 0.2])
    const spills = text("spills", "Far too many words", [0.1, 0.5, 0.3, 0.05])
    const overflow = findTextOverflow(
      [
        slideOf(fits, spills),
        { ...slideOf(fits), id: "slide-2", title: "Clean" },
      ],
      "4:5"
    )
    expect([...overflow.keys()]).toEqual(["slide-1"])
    expect(overflow.get("slide-1")?.map((item) => item.id)).toEqual(["spills"])
  })
})

function shadow(
  id: string,
  box: [number, number, number, number],
  zIndex = 1
): CarouselGradientShadowItem {
  const [x, y, width, height] = box
  return {
    id,
    type: "gradient-shadow",
    color: "#000000",
    opacity: 70,
    direction: "up",
    x,
    y,
    width,
    height,
    zIndex,
  }
}

function deckSlide(id: string, ...items: CarouselSlideItem[]): CarouselSlide {
  return { id, title: id, backgroundColor: "#ffffff", items }
}

describe("pushSlideLayout", () => {
  const headline = {
    ...text("src-head", "Headline", [0.05, 0.6, 0.9, 0.15], 96),
    fontId: "playfair-display",
    color: "#facc15",
    align: "center",
  } satisfies CarouselTextItem
  const body = {
    ...text("src-body", "Body", [0.05, 0.78, 0.9, 0.12], 40),
    zIndex: 11,
  }
  const photo = { ...image("src-photo", [0, 0, 1, 1]), fit: "cover" } as const
  const source = deckSlide(
    "source",
    photo,
    shadow("src-fade", [0, 0.5, 1, 0.5]),
    headline,
    body
  )

  it("moves and restyles text but never changes the words", () => {
    const target = deckSlide(
      "target",
      text("t-head", "A different hook", [0.2, 0.1, 0.5, 0.1]),
      { ...text("t-body", "Different body copy", [0.2, 0.3, 0.5, 0.1]), zIndex: 12 }
    )
    const [, pushed] = pushSlideLayout(
      [source, target],
      "source",
      new Set(["target"])
    )
    expect(carouselSlidesSchema.safeParse([pushed]).success).toBe(true)
    expect(pushed.items[0]).toEqual({
      ...target.items[0],
      x: 0.05,
      y: 0.6,
      width: 0.9,
      height: 0.15,
      fontId: "playfair-display",
      fontSize: 96,
      color: "#facc15",
      align: "center",
    })
    expect(pushed.items[1]).toMatchObject({
      id: "t-body",
      text: "Different body copy",
      y: 0.78,
      fontSize: 40,
      zIndex: 12,
    })
  })

  it("gives a picture the box and fit but keeps the picture", () => {
    const own = {
      ...image("t-photo", [0.2, 0.2, 0.4, 0.4]),
      mediaId: "media-9",
      url: "/media-9.png",
      altText: "A dog",
    }
    const [, pushed] = pushSlideLayout(
      [source, deckSlide("target", own)],
      "source",
      new Set(["target"])
    )
    expect(pushed.items[0]).toEqual({
      ...own,
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      fit: "cover",
    })
  })

  it("copies every shadow setting, including a missing direction", () => {
    const { direction: _direction, ...plain } = shadow("src-fade", [0, 0, 1, 1])
    const [, pushed] = pushSlideLayout(
      [
        deckSlide("source", plain),
        deckSlide("target", { ...shadow("t-fade", [0, 0.6, 1, 0.4]), color: "#ffffff", opacity: 20 }),
      ],
      "source",
      new Set(["target"])
    )
    expect(pushed.items[0]).toEqual({
      id: "t-fade",
      type: "gradient-shadow",
      color: "#000000",
      opacity: 70,
      x: 0,
      y: 0,
      width: 1,
      height: 1,
      zIndex: 1,
    })
  })

  it("updates what matches on a slide with fewer layers and leaves the rest", () => {
    const loneText = text("t-only", "Only words", [0.3, 0.3, 0.3, 0.1])
    const extraText = {
      ...text("t-extra", "Third text", [0.1, 0.1, 0.2, 0.1]),
      zIndex: 30,
    }
    const target = deckSlide(
      "target",
      loneText,
      { ...text("t-second", "Second", [0.4, 0.4, 0.2, 0.1]), zIndex: 20 },
      extraText
    )
    const [, pushed] = pushSlideLayout(
      [source, target],
      "source",
      new Set(["target"])
    )
    expect(pushed.items.map((item) => item.y)).toEqual([0.6, 0.78, 0.1])
    // The source has two texts, so the third keeps everything it had.
    expect(pushed.items[2]).toBe(extraText)
  })

  it("matches by z-order within a kind, not by list order", () => {
    const top = { ...text("t-top", "Top", [0.5, 0.5, 0.2, 0.1]), zIndex: 40 }
    const bottom = { ...text("t-bottom", "Bottom", [0.5, 0.5, 0.2, 0.1]), zIndex: 5 }
    const matches = matchSlideLayers(source, deckSlide("target", top, bottom))
    expect(matches.get("t-bottom")?.id).toBe("src-head")
    expect(matches.get("t-top")?.id).toBe("src-body")
  })

  it("changes exactly the slides picked and never the source", () => {
    const slides = [
      source,
      ...["a", "b", "c", "d", "e"].map((id) =>
        deckSlide(id, text(`${id}-text`, id, [0.3, 0.3, 0.3, 0.1]))
      ),
    ]
    const pushed = pushSlideLayout(slides, "source", new Set(["a", "c", "e", "source"]))
    const changed = pushed.filter((slide, index) => slide !== slides[index])
    expect(changed.map((slide) => slide.id)).toEqual(["a", "c", "e"])
    expect(pushed[0]).toBe(source)
    for (const slide of pushed) expect(slide.backgroundColor).toBe("#ffffff")
  })

  it("leaves a slide with nothing to match untouched", () => {
    const empty = deckSlide("target")
    const [, pushed] = pushSlideLayout([source, empty], "source", new Set(["target"]))
    expect(pushed).toBe(empty)
  })

  it("can push a tight layout that the overflow check then names", () => {
    const tight = text("src", "Hi", [0.1, 0.1, 0.3, 0.05], 40)
    const long = text("t-long", "A long sentence that will not fit in a small box", [0, 0, 1, 0.5], 72)
    const pushed = pushSlideLayout(
      [deckSlide("source", tight), deckSlide("target", long)],
      "source",
      new Set(["target"])
    )
    expect([...findTextOverflow(pushed, "4:5").keys()]).toEqual(["target"])
  })
})
