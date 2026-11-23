import { beforeEach, describe, expect, it, vi } from "vitest"

import { COPY_STYLE_LINK_MESSAGE, IDEAS_NEED_WORDS_MESSAGE } from "@/lib/video/thumbnail-ai"
import { newTextLayer, type ThumbnailLayer } from "@/lib/video/thumbnails"

/**
 * The Thumbnail board's AI with everything outside this file stood in for:
 * the records, the models and drawing. What is checked is this file's own
 * work: how many versions a press makes and what is in them, which words
 * reach the models, what is kept, and which host a link is read from.
 */

const state = vi.hoisted(() => ({
  layers: [] as unknown[],
  created: [] as { videoId: string; layers: ThumbnailLayer[] }[],
  edits: [] as { kind: string; words?: string }[],
  budgets: [] as number[],
  writer: [] as string[],
  writerAnswers: [] as unknown[],
  pictureAnswers: [] as unknown[],
  savedChecks: [] as unknown[],
  fetched: [] as string[],
  timeline: { aspect: "16:9", tracks: [] } as unknown,
  copies: [] as { id: string; language: string | null }[],
}))

vi.mock("@/server/video/thumbnails", () => ({
  getOwnedThumbnail: async () => ({ id: "t1", videoId: "v1", shape: "wide", backgroundColor: "#000000", layers: state.layers, title: null, version: 3 }),
  createThumbnail: async (options: { videoId: string; layers: ThumbnailLayer[] }) => {
    state.created.push(options)
    return { id: `new-${state.created.length}`, ...options }
  },
  drawThumbnail: async () => new Uint8Array([1]),
  insertTemplate: async (_owner: string, template: unknown) => ({ id: "tpl", ...(template as object) }),
  keepFrameForBoard: async () => ({ mediaId: "frame", url: "https://f/frame.jpg", name: "frame" }),
  saveThumbnailCheck: async (_owner: string, _id: string, check: unknown) => {
    state.savedChecks.push(check)
  },
}))
vi.mock("@/server/video/project-spend", () => ({
  requireVideoBudget: async (_owner: string, videoId: string, cents: number) => {
    state.budgets.push(cents)
    return { id: videoId, projectId: "p1", name: "My trip", timeline: state.timeline }
  },
  videoSpendMetadata: () => ({ projectId: "p1", videoId: "v1" }),
}))
vi.mock("@/server/video/project-videos", () => ({
  getOwnedVideo: async () => ({ id: "v1", projectId: "p1", name: "My trip", timeline: state.timeline }),
}))
vi.mock("@/server/video/picture-edits", () => ({
  readOwnedPicture: async () => ({ bytes: new Uint8Array([1]), mimeType: "image/png", name: "Pic" }),
  editPicture: async (options: { kind: string; words?: string }) => {
    state.edits.push(options)
    return { media_id: `m${state.edits.length}`, url: `https://f/m${state.edits.length}.png`, name: "Pic", mime_type: "image/png", width: 10, height: 10 }
  },
  keyOutGreen: async (bytes: Uint8Array) => bytes,
}))
vi.mock("@/server/video/writer", () => ({
  askWriter: async (options: { prompt: string }) => {
    state.writer.push(options.prompt)
    return state.writerAnswers.shift()
  },
}))
vi.mock("@/server/video/gemini", () => ({
  requireGeminiKey: async () => "key",
  generateJson: async () => ({ value: state.pictureAnswers.shift(), inputTokens: 1, outputTokens: 1 }),
}))
vi.mock("@/server/ai/usage", () => ({
  runAiCall: async (_context: unknown, call: () => Promise<{ result: unknown }>) => (await call()).result,
}))
vi.mock("@/server/video/render", () => ({
  renderTimelineStills: async () => [new Uint8Array([1])],
}))
vi.mock("sharp", () => ({
  default: () => ({ resize: () => ({ flatten: () => ({ jpeg: () => ({ toBuffer: async () => Buffer.from([1]) }) }) }) }),
}))
vi.mock("@/server/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({ where: async () => [] }),
        where: async () => state.copies,
      }),
    }),
  },
}))

const ai = await import("@/server/video/thumbnail-ai")

const picture = { id: "pic", type: "image", mediaId: "m0", url: "https://f/m0.png", fit: "cover", x: 0, y: 0, width: 1, height: 1, zIndex: 0 }

beforeEach(() => {
  state.layers = [picture, { ...newTextLayer("wide", []), text: "I QUIT" }]
  state.created = []
  state.edits = []
  state.budgets = []
  state.writer = []
  state.writerAnswers = []
  state.pictureAnswers = []
  state.savedChecks = []
  state.timeline = { aspect: "16:9", tracks: [] }
  state.copies = []
  vi.unstubAllGlobals()
})

describe("a picture press", () => {
  it("makes one new version per try, each with only the picture changed", async () => {
    const rows = await ai.changeBoardPicture({ owner: "u", thumbnailId: "t1", layerId: "pic", kind: "brighter", model: "gemini-3.1-flash-image", tries: 4 })
    expect(rows).toHaveLength(4)
    // Four pictures at 6.7¢ is 26.8¢, which the meter rounds to 27¢.
    expect(state.budgets[0]).toBe(27)
    const mediaIds = state.created.map((row) => (row.layers.find((layer) => layer.id === "pic") as { mediaId: string }).mediaId)
    expect(new Set(mediaIds).size).toBe(4)
    expect(state.created[0].layers.find((layer) => layer.type === "text")).toMatchObject({ text: "I QUIT" })
  })

  it("fits a cut-out inside its box rather than cropping it", async () => {
    await ai.changeBoardPicture({ owner: "u", thumbnailId: "t1", layerId: "pic", kind: "cutout", model: "gemini-3.1-flash-image", tries: 1 })
    expect(state.created[0].layers.find((layer) => layer.id === "pic")).toMatchObject({ fit: "contain" })
  })
})

describe("titles", () => {
  it("drops every title that repeats the thumbnail's words and keeps five", async () => {
    state.writerAnswers = [{ titles: ["Why I quit", "The day it ended", "One", "Two", "Three", "Four", "Five"] }]
    const titles = await ai.titlesForThumbnail("u", "t1")
    expect(titles).toEqual(["The day it ended", "One", "Two", "Three", "Four"])
    expect(state.writer[0]).toContain('already says: "I QUIT"')
  })
})

describe("the check", () => {
  it("keeps the three marks with the version they were made on", async () => {
    state.pictureAnswers = [{ marks: [{ thing: "face", mark: 4, fix: "Bigger face" }, { thing: "text", mark: 8.4, fix: "Fine" }, { thing: "colour", mark: 6, fix: "More red" }] }]
    const check = await ai.checkThumbnail("u", "t1")
    expect(check.marks.map((mark) => mark.thing)).toEqual(["text", "face", "colour"])
    expect(check.marks[0].mark).toBe(8)
    expect(check.version).toBe(3)
    expect(state.savedChecks).toHaveLength(1)
  })
})

describe("ideas", () => {
  it("asks for words first when the video has neither a script nor a transcript", async () => {
    await expect(ai.ideasFromVideo({ owner: "u", videoId: "v1" })).rejects.toThrow(IDEAS_NEED_WORDS_MESSAGE)
  })

  it("spaces its frames 5 seconds apart, and spreads 60 over a long video", () => {
    expect(ai.ideaFrameStep(60_000)).toBe(5_000)
    expect(ai.ideaFrameStep(60 * 60_000)).toBe(60_000)
  })
})

describe("copying a style", () => {
  it("reads a link's thumbnail from YouTube's picture host only", async () => {
    const fetches: string[] = []
    vi.stubGlobal("fetch", async (address: URL) => {
      fetches.push(String(address))
      return new Response(new Uint8Array([1, 2, 3]))
    })
    state.pictureAnswers = [{ background_color: "#101010", pictures: [{ x: 0.5, y: 0, width: 0.5, height: 1 }], texts: [] }]
    const template = await ai.copyStyle({ owner: "u", videoId: "v1", shape: "wide", link: "https://youtu.be/dQw4w9WgXcQ" })
    expect(fetches).toEqual(["https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg"])
    expect((template as unknown as { layers: ThumbnailLayer[] }).layers.map((layer) => layer.type)).toEqual(["spot"])
  })

  it("refuses a link that is not a YouTube video before fetching anything", async () => {
    const fetches: string[] = []
    vi.stubGlobal("fetch", async (address: URL) => {
      fetches.push(String(address))
      return new Response("")
    })
    await expect(ai.copyStyle({ owner: "u", videoId: "v1", shape: "wide", link: "https://evil.example/x.jpg" })).rejects.toThrow(COPY_STYLE_LINK_MESSAGE)
    expect(fetches).toEqual([])
  })
})

describe("another language", () => {
  it("puts translated words on the language copy and leaves the original alone", async () => {
    state.copies = [{ id: "v-es", language: "Spanish" }]
    state.writerAnswers = [{ lines: ["LO DEJÉ TODO"] }]
    await ai.translateThumbnail({ owner: "u", thumbnailId: "t1", copyVideoId: "v-es" })
    expect(state.created[0].videoId).toBe("v-es")
    const text = state.created[0].layers.find((layer) => layer.type === "text") as { text: string; fontSize: number }
    expect(text.text).toBe("LO DEJÉ TODO")
    expect(text.fontSize).toBeLessThan(120)
    expect((state.layers[1] as { text: string }).text).toBe("I QUIT")
  })
})
