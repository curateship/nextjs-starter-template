import { PGlite } from "@electric-sql/pglite"
import sharp from "sharp"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type {
  CarouselSlide,
  CarouselTextItem,
} from "@/lib/video/carousel-schema"
import { TEXT_FONTS } from "@/lib/video/text-fonts"
import { now, uuid } from "@/server/auth/security"
import { type CustomShellDb } from "@/server/db"
import { customShellMedia } from "@/server/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
} from "@/server/test-support"
import {
  carouselSlideSvg,
  findSlidePicture,
  measureAdvance,
  pictureRect,
  renderCarouselSlidePng,
  slidePicture,
} from "@/server/video/carousel-export"

const ONLY_SLIDE = { index: 0, count: 1 }

const textItem: CarouselTextItem = {
  id: "text-1",
  type: "text",
  text: "Safe <words> & symbols",
  x: 0.1,
  y: 0.1,
  width: 0.8,
  height: 0.3,
  zIndex: 2,
  fontId: "inter",
  fontSize: 64,
  color: "#ffffff",
  align: "center",
}

const slide: CarouselSlide = {
  id: "slide-1",
  title: "Test",
  backgroundColor: "#112233",
  items: [
    textItem,
    {
      id: "shadow-1",
      type: "gradient-shadow",
      x: 0,
      y: 0.5,
      width: 1,
      height: 0.5,
      zIndex: 1,
      color: "#000000",
      opacity: 70,
      direction: "up",
    },
  ],
}

describe("carousel slide export", () => {
  it("escapes text before adding it to the SVG", () => {
    const svg = carouselSlideSvg(slide, "4:5", ONLY_SLIDE)

    expect(svg).toContain("Safe &lt;words&gt; &amp; symbols")
    expect(svg).not.toContain("Safe <words>")
  })

  it("renders the chosen format with the bundled font", () => {
    const png = renderCarouselSlidePng(slide, "4:5", ONLY_SLIDE)

    expect([...png.slice(0, 8)]).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ])
    expect(new DataView(png.buffer).getUint32(16)).toBe(1080)
    expect(new DataView(png.buffer).getUint32(20)).toBe(1350)
  })

  it("draws each face with its own font file", () => {
    // The same words in every face. If a family name in an SVG did not match
    // its ttf, that render would silently fall back to Inter and come out
    // pixel-identical to Inter's — so every render must be different.
    const renders = TEXT_FONTS.map((font) => {
      const oneFace = {
        ...slide,
        items: [{ ...textItem, fontId: font.id }],
      }
      expect(carouselSlideSvg(oneFace, "1:1", ONLY_SLIDE)).toContain(
        `font-family="${font.svgFamily}"`
      )
      return renderCarouselSlidePng(oneFace, "1:1", ONLY_SLIDE).join(",")
    })
    expect(new Set(renders).size).toBe(TEXT_FONTS.length)
  })
})

describe("words looks in the export", () => {
  function only(item: CarouselSlide["items"][number]): CarouselSlide {
    return { ...slide, items: [item] }
  }

  it("draws bold words with a line round them in their own colour", () => {
    const svg = carouselSlideSvg(
      only({
        ...textItem,
        text: "Make it bold",
        marks: [{ start: 8, end: 12, style: "bold" }],
      }),
      "4:5",
      ONLY_SLIDE
    )
    expect(svg).toMatch(
      /<tspan[^>]*stroke="#ffffff"[^>]*stroke-width="2\.88"[^>]*>bold<\/tspan>/
    )
    expect(svg).toMatch(/<tspan[^>]*>Make it <\/tspan>/)
  })

  it("puts a highlight's box under exactly its word", () => {
    const item = {
      ...textItem,
      text: "big win",
      align: "left" as const,
      marks: [{ start: 4, end: 7, style: "highlight" as const }],
      highlightColor: "#ff00ff",
    }
    const svg = carouselSlideSvg(only(item), "4:5", ONLY_SLIDE)
    const font = TEXT_FONTS[0]
    const left = 0.1 * 1080
    const start = left + measureAdvance("big ", font, 64, 0)
    const end = left + measureAdvance("big win", font, 64, 0)
    const spread = 0.08 * 64
    const box = svg.match(/<rect x="([\d.]+)" y="[\d.]+" width="([\d.]+)"[^>]*fill="#ff00ff"\/>/)
    expect(box).not.toBeNull()
    expect(Number(box?.[1])).toBeCloseTo(start - spread, 3)
    expect(Number(box?.[2])).toBeCloseTo(end - start + spread * 2, 3)
  })

  it("paints the highlight colour in the PNG where the word is", async () => {
    const item = {
      ...textItem,
      text: "win",
      align: "left" as const,
      color: "#000000",
      marks: [{ start: 0, end: 3, style: "highlight" as const }],
      highlightColor: "#ff0000",
    }
    const png = renderCarouselSlidePng(only(item), "4:5", ONLY_SLIDE)
    const { data, info } = await sharp(png)
      .raw()
      .toBuffer({ resolveWithObject: true })
    function pixel(x: number, y: number) {
      const at = (Math.round(y) * info.width + Math.round(x)) * info.channels
      return [data[at], data[at + 1], data[at + 2]]
    }
    // Just inside the box's left edge, on the line's middle: red, not the
    // slide's dark blue and not the black letters.
    const middle = 135 + 64 * 0.6
    expect(pixel(0.1 * 1080 - 3, middle)).toEqual([255, 0, 0])
    // Well clear of the word, the slide's own colour shows.
    expect(pixel(0.1 * 1080 - 30, middle)).toEqual([0x11, 0x22, 0x33])
  })

  it("draws an outline as its own pass under the letters", () => {
    const svg = carouselSlideSvg(
      only({ ...textItem, outlineColor: "#000000", outlineWidth: 3 }),
      "4:5",
      ONLY_SLIDE
    )
    const passes = svg.match(/<text /g) ?? []
    expect(passes).toHaveLength(2)
    expect(svg).toContain('stroke="#000000" stroke-linejoin="round"')
    expect(svg).toMatch(/<tspan[^>]*stroke-width="6"/)
  })

  it("fills the layer with its box colour behind the words", () => {
    const svg = carouselSlideSvg(
      only({ ...textItem, boxColor: "#123456" }),
      "4:5",
      ONLY_SLIDE
    )
    expect(svg).toContain(
      `<rect x="108" y="135" width="864" height="405" fill="#123456"/>`
    )
  })

  it("spaces lines by the layer's own line spacing", () => {
    const svg = carouselSlideSvg(
      only({
        ...textItem,
        text: "one\ntwo",
        lineHeight: 2,
      }),
      "4:5",
      ONLY_SLIDE
    )
    const baselines = [...svg.matchAll(/<tspan x="[\d.]+" y="([\d.]+)">/g)].map(
      (match) => Number(match[1])
    )
    expect(baselines[1] - baselines[0]).toBeCloseTo(128, 6)
  })

  it("writes this slide's place in a slide-number layer", () => {
    const svg = carouselSlideSvg(
      only({
        id: "number",
        type: "slide-number",
        x: 0.8,
        y: 0.9,
        width: 0.15,
        height: 0.06,
        zIndex: 20,
        fontId: "inter",
        fontSize: 40,
        color: "#ffffff",
        align: "right",
      }),
      "4:5",
      { index: 2, count: 7 }
    )
    expect(svg).toContain(">3/7</tspan>")
  })

  it("wraps wide capitals by their real width instead of cutting them off", () => {
    // 16 letters fit the 864px box at Inter's average width, but these 15
    // capitals are about 975px wide.
    const svg = carouselSlideSvg(
      only({ ...textItem, text: "WHY MOST BRANDS", fontSize: 96, height: 0.4 }),
      "4:5",
      ONLY_SLIDE
    )
    expect(svg).not.toContain("WHY MOST BRANDS")
    expect(svg).toMatch(/>WHY MOST<\/t/)
    expect(svg).toMatch(/>BRANDS<\/t/)
  })

  it("leaves a hidden layer out", () => {
    const svg = carouselSlideSvg(
      only({ ...textItem, text: "secret", hidden: true }),
      "4:5",
      ONLY_SLIDE
    )
    expect(svg).not.toContain("secret")
  })
})

describe("a slide picture", () => {
  it("turns a phone photo stored on its side, as the browser does", async () => {
    // 200 wide and 100 tall as stored, with the note "turn a quarter right".
    const sideways = await sharp({
      create: { width: 200, height: 100, channels: 3, background: "#ff0000" },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer()
    const picture = await slidePicture(sideways, "image/jpeg")
    expect(picture).toMatchObject({ width: 100, height: 200 })
    const drawn = Buffer.from(picture.href.split(",")[1], "base64")
    const { width, height, orientation } = await sharp(drawn).metadata()
    expect({ width, height, orientation }).toEqual({
      width: 100,
      height: 200,
      orientation: undefined,
    })
  })

  it("keeps an upright picture's own bytes", async () => {
    const upright = await sharp({
      create: { width: 20, height: 10, channels: 3, background: "#00ff00" },
    })
      .png()
      .toBuffer()
    const picture = await slidePicture(upright, "image/png")
    expect(picture.href).toBe(`data:image/png;base64,${upright.toString("base64")}`)
    expect(picture).toMatchObject({ width: 20, height: 10 })
  })
})

describe("where a cropped picture is drawn", () => {
  const box = { x: 0, y: 0, width: 1000, height: 1000 }
  const wide = { width: 2000, height: 1000 }

  it("covers the box from the middle by default", () => {
    expect(pictureRect({ fit: "cover" }, box, wide)).toEqual({
      x: -500,
      y: 0,
      width: 2000,
      height: 1000,
    })
  })

  it("shows the left edge with the focus at 0", () => {
    expect(pictureRect({ fit: "cover", focusX: 0 }, box, wide).x).toBe(0)
  })

  it("shows the right edge with the focus at 1", () => {
    expect(pictureRect({ fit: "fill", focusX: 1 }, box, wide).x).toBe(-1000)
  })

  it("fits the whole picture inside with Fit, ignoring the focus", () => {
    expect(pictureRect({ fit: "contain", focusX: 0 }, box, wide)).toEqual({
      x: 0,
      y: 250,
      width: 1000,
      height: 500,
    })
  })
})

describe("pictures a slide may show", () => {
  let client: PGlite
  let database: CustomShellDb
  let ownerId: string
  let strangerId: string
  let workspaceId: string

  beforeEach(async () => {
    const testDb = await createTestDatabase()
    client = testDb.client
    database = testDb.db
    ownerId = (await insertUser(database)).id
    strangerId = (await insertUser(database)).id
    workspaceId = (await insertWorkspace(database, { userId: ownerId })).id
  })

  afterEach(async () => {
    await client.close()
  })

  async function insertPicture(
    userId: string,
    overrides: Partial<typeof customShellMedia.$inferInsert> = {}
  ) {
    const timestamp = now()
    const [row] = await database
      .insert(customShellMedia)
      .values({
        id: uuid(),
        workspaceId,
        userId,
        filename: "picture.png",
        originalName: "picture.png",
        fileSize: 100,
        mimeType: "image/png",
        fileType: "image",
        storagePath: `${userId}/${uuid()}.png`,
        createdAt: timestamp,
        updatedAt: timestamp,
        ...overrides,
      })
      .returning()
    return row
  }

  it("shows a person's own picture", async () => {
    const own = await insertPicture(ownerId)
    expect((await findSlidePicture(ownerId, own.id, database))?.id).toBe(
      own.id
    )
  })

  it("refuses somebody else's picture", async () => {
    const theirs = await insertPicture(strangerId)
    expect(await findSlidePicture(ownerId, theirs.id, database)).toBeNull()
  })

  it("refuses a video, even the person's own", async () => {
    const clip = await insertPicture(ownerId, {
      mimeType: "video/mp4",
      fileType: "video",
    })
    expect(await findSlidePicture(ownerId, clip.id, database)).toBeNull()
  })
})
