import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { createDefaultBrandKit } from "@/lib/video/brand-kit"
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
  renderCarouselSlidePng,
} from "@/server/video/carousel-export"
import { saveVideoBrandKit } from "@/server/video/settings"

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
    const svg = carouselSlideSvg(slide, "4:5")

    expect(svg).toContain("Safe &lt;words&gt; &amp; symbols")
    expect(svg).not.toContain("Safe <words>")
  })

  it("renders the chosen format with the bundled font", () => {
    const png = renderCarouselSlidePng(slide, "4:5")

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
      expect(carouselSlideSvg(oneFace, "1:1")).toContain(
        `font-family="${font.svgFamily}"`
      )
      return renderCarouselSlidePng(oneFace, "1:1").join(",")
    })
    expect(new Set(renders).size).toBe(TEXT_FONTS.length)
  })
})

describe("pictures a slide may show", () => {
  const base = "https://video-media.example.test"
  const hadR2PublicUrl = Object.prototype.hasOwnProperty.call(
    process.env,
    "CUSTOM_SHELL_R2_PUBLIC_URL"
  )
  const originalR2PublicUrl = process.env.CUSTOM_SHELL_R2_PUBLIC_URL
  let client: PGlite
  let database: CustomShellDb
  let ownerId: string
  let strangerId: string
  let workspaceId: string

  beforeEach(async () => {
    process.env.CUSTOM_SHELL_R2_PUBLIC_URL = base
    const testDb = await createTestDatabase()
    client = testDb.client
    database = testDb.db
    ownerId = (await insertUser(database)).id
    strangerId = (await insertUser(database)).id
    workspaceId = (await insertWorkspace(database, { userId: ownerId })).id
  })

  afterEach(async () => {
    await client.close()
    if (hadR2PublicUrl) {
      process.env.CUSTOM_SHELL_R2_PUBLIC_URL = originalR2PublicUrl
    } else {
      delete process.env.CUSTOM_SHELL_R2_PUBLIC_URL
    }
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
        filename: "logo.png",
        originalName: "logo.png",
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

  async function useAsLogo(storagePath: string) {
    await saveVideoBrandKit(
      { ...createDefaultBrandKit(), logoUrl: `${base}/${storagePath}` },
      database
    )
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

  it("shows the brand logo whoever uploaded it, until the kit's logo changes", async () => {
    const logo = await insertPicture(strangerId)
    await useAsLogo(logo.storagePath)
    expect((await findSlidePicture(ownerId, logo.id, database))?.id).toBe(
      logo.id
    )

    const newLogo = await insertPicture(strangerId)
    await useAsLogo(newLogo.storagePath)
    expect(await findSlidePicture(ownerId, logo.id, database)).toBeNull()
  })

  it("refuses a video, even one that is the brand logo", async () => {
    const clip = await insertPicture(ownerId, {
      mimeType: "video/mp4",
      fileType: "video",
    })
    await useAsLogo(clip.storagePath)
    expect(await findSlidePicture(ownerId, clip.id, database)).toBeNull()
  })

  it("finds no logo picture behind an address outside the library", async () => {
    const logo = await insertPicture(strangerId)
    await saveVideoBrandKit(
      {
        ...createDefaultBrandKit(),
        logoUrl: `https://elsewhere.example.test/${logo.storagePath}`,
      },
      database
    )
    expect(await findSlidePicture(ownerId, logo.id, database)).toBeNull()
  })
})
