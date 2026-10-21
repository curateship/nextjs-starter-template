import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { draftCarouselSlides } from "@/lib/video/carousel-drafts"
import { findTextOverflow } from "@/lib/video/carousel-layout"
import {
  LINK_REFUSED_MESSAGE,
  PROJECT_SCRIPT_EMPTY_MESSAGE,
} from "@/lib/video/carousel-writing"
import { type CustomShellDb } from "@/server/db"
import { now } from "@/server/auth/security"
import { customShellMedia, type CustomShellUser } from "@/server/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
} from "@/server/test-support"
import {
  translateCarousel,
  writeCarouselCaption,
  writeCarouselDraft,
} from "@/server/video/carousel-writer"
import {
  createOwnedCarousel,
  getOwnedCarouselDetail,
  writeCarousel,
} from "@/server/video/carousels"
import { pageWords, readLinkText } from "@/server/video/link-reader"
import {
  createOwnedProject,
  writeProjectTimeline,
} from "@/server/video/projects"
import { videoVoiceovers } from "@/server/video/schema"

// The writer is stubbed: each test says what it answers, and every prompt
// it was sent is kept to read.
const writer = vi.hoisted(() => ({
  answer: (_prompt: string): unknown => ({}),
  prompts: [] as { feature: string; prompt: string }[],
}))
vi.mock("@/server/video/writer", () => ({
  askWriter: async ({
    feature,
    prompt,
    schema,
  }: {
    feature: string
    prompt: string
    schema: { parse: (value: unknown) => unknown }
  }) => {
    writer.prompts.push({ feature, prompt })
    return schema.parse(writer.answer(prompt))
  },
}))

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
  writer.prompts = []
})

afterEach(async () => {
  await client.close()
})

function slidesOf(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    headline: `Point ${index + 1}`,
    body: `Why point ${index + 1} matters, in one short sentence.`,
  }))
}

describe("a carousel written by AI", () => {
  it("makes exactly the slides asked for, as a new carousel", async () => {
    writer.answer = () => ({ name: "Running tips", slides: slidesOf(7) })
    const made = await writeCarouselDraft({
      userId: user.id,
      source: { kind: "topic", text: "5 mistakes new runners make" },
      slideCount: 7,
      format: "4:5",
      database,
    })
    expect(made).toMatchObject({ name: "Running tips", slide_count: 7, format: "4:5" })
    expect(writer.prompts[0].feature).toBe("carousel_draft")
    expect(writer.prompts[0].prompt).toContain("exactly 7 slides")
  })

  it("works from a project's words, and the carousel is that project's", async () => {
    const project = await createOwnedProject(user.id, "Launch video", database)
    await expect(
      writeCarouselDraft({
        userId: user.id,
        source: { kind: "project", projectId: project.id },
        slideCount: 3,
        format: "1:1",
        database,
      })
    ).rejects.toThrow(PROJECT_SCRIPT_EMPTY_MESSAGE)

    await writeProjectTimeline(
      user.id,
      project.id,
      {
        aspect: "9:16",
        tracks: [
          {
            id: "words",
            muted: false,
            clips: [
              {
                id: "line",
                kind: "text",
                name: "Text",
                text: "Our new shoe is lighter than any we have made",
                fontId: "inter",
                startMs: 0,
                durationMs: 3000,
                trimStartMs: 0,
              },
            ],
          },
        ],
      },
      project.version,
      database
    )
    writer.answer = () => ({ name: "", slides: slidesOf(3) })
    const made = await writeCarouselDraft({
      userId: user.id,
      source: { kind: "project", projectId: project.id },
      slideCount: 3,
      format: "1:1",
      database,
    })
    expect(made).toMatchObject({ project_id: project.id, name: "Launch video" })
    expect(writer.prompts.at(-1)?.prompt).toContain("lighter than any we have made")
  })

  it("never reads the script of someone else's voiceover named on a timeline", async () => {
    const other = await insertUser(database)
    const workspace = await insertWorkspace(database, { userId: other.id })
    const at = now()
    await database.insert(customShellMedia).values({
      id: "their-voice",
      workspaceId: workspace.id,
      userId: other.id,
      filename: "their-voice.mp3",
      originalName: "their-voice.mp3",
      fileSize: 8,
      mimeType: "audio/mpeg",
      fileType: "audio",
      storagePath: `${other.id}/their-voice.mp3`,
      createdAt: at,
      updatedAt: at,
    })
    await database.insert(videoVoiceovers).values({
      mediaId: "their-voice",
      script: "Their private launch plan for next spring",
      voiceId: "rachel",
      voiceName: "Rachel",
      durationMs: 3000,
      captions: [],
      createdAt: at,
    })
    const project = await createOwnedProject(user.id, "Mine", database)
    await writeProjectTimeline(
      user.id,
      project.id,
      {
        aspect: "9:16",
        tracks: [
          {
            id: "voice",
            muted: false,
            clips: [
              {
                id: "line",
                kind: "audio",
                name: "Voice",
                mediaId: "their-voice",
                startMs: 0,
                durationMs: 3000,
                trimStartMs: 0,
                sourceDurationMs: 3000,
              },
            ],
          },
        ],
      },
      project.version,
      database
    )
    await expect(
      writeCarouselDraft({
        userId: user.id,
        source: { kind: "project", projectId: project.id },
        slideCount: 3,
        format: "1:1",
        database,
      })
    ).rejects.toThrow(PROJECT_SCRIPT_EMPTY_MESSAGE)
    expect(writer.prompts.map((sent) => sent.prompt).join("")).not.toContain(
      "private launch plan"
    )
  })

  it("lays words out in boxes as tall as they need, so nothing is flagged", () => {
    const slides = draftCarouselSlides(slidesOf(5), "4:5")
    expect(slides).toHaveLength(5)
    expect(slides[0].backgroundColor).toBe("#111827")
    expect(slides[2].backgroundColor).toBe("#f8fafc")
    expect(findTextOverflow(slides, "4:5").size).toBe(0)
    // The body sits under its headline.
    const [headline, body] = slides[1].items
    expect(body.y).toBeGreaterThan(headline.y + headline.height)
  })
})

describe("the post caption", () => {
  it("is written from the slides, with any hashtags taken out", async () => {
    const carousel = await createOwnedCarousel(user.id, "Post", database)
    writer.answer = () => ({
      caption: "Swipe for our #1 tip. #running #fitness\n\nSave it.",
    })
    const caption = await writeCarouselCaption({
      userId: user.id,
      carouselId: carousel.id,
      database,
    })
    expect(caption).not.toContain("#running")
    expect(caption).not.toContain("#fitness")
    expect(caption).toContain("Swipe for our #1 tip.")
    expect(writer.prompts[0].prompt).toContain("Your hook goes here")
  })
})

describe("translated copies", () => {
  it("makes one copy per language and leaves the original alone", async () => {
    const carousel = await createOwnedCarousel(user.id, "Tips", database)
    const detail = await getOwnedCarouselDetail(user.id, carousel.id, database)
    await writeCarousel(
      user.id,
      carousel.id,
      {
        slides: detail.slides.map((slide) => ({
          ...slide,
          items: slide.items.map((item) =>
            item.type === "text"
              ? { ...item, text: "Hello world", marks: [{ start: 0, end: 5, style: "bold" as const }] }
              : item
          ),
        })),
        format: detail.format,
        caption: "",
        expectedVersion: detail.version,
      },
      database
    )
    const before = await getOwnedCarouselDetail(user.id, carousel.id, database)
    writer.answer = (prompt) => ({
      texts: [prompt.includes("Spanish") ? "Hola mundo" : "Bonjour le monde"],
    })
    const { made: copies, failed } = await translateCarousel({
      userId: user.id,
      carouselId: carousel.id,
      languages: ["Spanish", "French"],
      database,
    })
    expect(failed).toEqual([])
    expect(copies.map((copy) => copy.name)).toEqual(["Tips (Spanish)", "Tips (French)"])
    const spanish = await getOwnedCarouselDetail(user.id, copies[0].id, database)
    expect(spanish.slides[0].items[0]).toMatchObject({ text: "Hola mundo" })
    expect(spanish.slides[0].items[0]).not.toHaveProperty("marks")
    const after = await getOwnedCarouselDetail(user.id, carousel.id, database)
    expect(after.version).toBe(before.version)
    expect(after.slides[0].items[0]).toMatchObject({ text: "Hello world" })
  })
})

describe("reading a web page", () => {
  const publicTarget = (address: string) => ({
    url: new URL(address),
    address: "93.184.216.34",
    family: 4 as const,
  })

  it("refuses an address on this machine or a private network", async () => {
    await expect(readLinkText("http://127.0.0.1/admin")).rejects.toThrow(
      LINK_REFUSED_MESSAGE
    )
    await expect(readLinkText("https://192.168.1.10/")).rejects.toThrow(
      LINK_REFUSED_MESSAGE
    )
    await expect(readLinkText("https://localhost/")).rejects.toThrow(
      LINK_REFUSED_MESSAGE
    )
  })

  it("checks every redirect again before following it", async () => {
    const resolved: string[] = []
    await expect(
      readLinkText("https://example.com/post", {
        resolve: async (address) => {
          resolved.push(address)
          if (address.includes("internal")) throw new Error("private")
          return publicTarget(address)
        },
        get: async () => ({
          status: 302,
          location: "https://internal.example/secret",
          type: "",
          body: "",
        }),
      })
    ).rejects.toThrow(LINK_REFUSED_MESSAGE)
    expect(resolved).toEqual([
      "https://example.com/post",
      "https://internal.example/secret",
    ])
  })

  it("keeps a page's words and leaves its scripts and menus out", async () => {
    const words = await readLinkText("https://example.com/post#top", {
      resolve: async (address) => publicTarget(address),
      get: async () => ({
        status: 200,
        location: null,
        type: "text/html; charset=utf-8",
        body: "<html><head><title>Run better</title><script>steal()</script></head><body><nav>Home Shop</nav><article><h1>Five habits</h1><p>Start slow &amp; build up over six weeks.</p></article></body></html>",
      }),
    })
    expect(words).toContain("Run better")
    expect(words).toContain("Start slow & build up over six weeks.")
    expect(words).not.toContain("steal")
    expect(words).not.toContain("Home Shop")
    expect(pageWords("<p>a&#33;</p>")).toContain("a!")
  })

  it("reads the article's words, with lines kept and a stray < left alone", () => {
    const words = pageWords(
      "<TITLE>Tips</TITLE><header>Menu</header><Article><H2>One</H2><p>2 < 3, so</p><br>go<form><input></form></Article><footer>x</footer>"
    )
    const lines = words.split("\n").map((line) => line.trim()).filter(Boolean)
    expect(lines).toEqual(["Tips", "One", "2 < 3, so", "go"])
    expect(pageWords("<p>Keep this <nav")).toContain("Keep this <nav")
  })

  it("reads 2MB of tags that are never closed in well under a second", () => {
    for (const tag of ["<nav", "<nav>", "<article><nav>", "<a "]) {
      const page = tag.repeat(Math.floor((2 * 1024 * 1024) / tag.length))
      const started = performance.now()
      pageWords(page)
      expect(performance.now() - started).toBeLessThan(1_000)
    }
  })
})
