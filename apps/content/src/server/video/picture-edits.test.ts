import sharp from "sharp"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
  PICTURE_EDIT_NOT_FOUND_MESSAGE,
  PICTURE_EDIT_WORDS_MESSAGE,
  pictureEditPrompt,
} from "@/lib/video/picture-edits"
import { nearestImageAspect } from "@/lib/video/asset-factories"

/**
 * Changing a picture with AI, with the model, storage and the library stood
 * in for. What is checked is this file's own work: what is sent, in what
 * shape, what is kept, and that a cut-out really is see-through.
 */

const state = vi.hoisted(() => ({
  generated: [] as { prompt: string; aspectRatio: string; references: unknown[] }[],
  saved: [] as { name: string; mimeType: string; bytes: Uint8Array }[],
  attached: [] as string[],
  media: new Map<string, { storagePath: string; mimeType: string; originalName: string }>(),
  reply: new Uint8Array(),
}))

vi.mock("@/server/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => {
            const row = state.media.get("own")
            return row ? [row] : []
          },
        }),
      }),
    }),
  },
}))
vi.mock("@/server/video/asset-factories/images", () => ({
  generateImage: async (options: (typeof state.generated)[number]) => {
    state.generated.push(options)
    return { bytes: state.reply, mimeType: "image/png" }
  },
}))
vi.mock("@/server/video/asset-factories/media", () => ({
  saveGeneratedAsset: async (options: (typeof state.saved)[number]) => {
    state.saved.push(options)
    return { id: "new", url: "https://files/new.png", originalName: `${options.name}.png`, storagePath: "u/new.png" }
  },
  discardGeneratedAsset: async () => undefined,
}))
vi.mock("@/server/video/media-list", () => ({
  attachMediaToScope: async (_user: string, scope: { id: string }) => {
    state.attached.push(scope.id)
  },
}))
vi.mock("@/server/video/project-spend", () => ({
  requireVideoBudget: async () => ({ id: "v1", projectId: "p1" }),
  videoSpendMetadata: () => ({ projectId: "p1", videoId: "v1" }),
}))
vi.mock("@/server/video/asset-factories/person-board", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/server/video/asset-factories/person-board")>()
  return { ...real, readStoredPicture: async () => state.reply }
})

const { cleanUpOwnedPicture, editPicture, keyOutGreen } = await import(
  "@/server/video/picture-edits"
)

async function picture(width: number, height: number, colour: { r: number; g: number; b: number }) {
  return new Uint8Array(
    await sharp({ create: { width, height, channels: 3, background: colour } }).png().toBuffer()
  )
}

beforeEach(async () => {
  state.generated = []
  state.saved = []
  state.attached = []
  state.media = new Map([["own", { storagePath: "u/own.jpg", mimeType: "image/png", originalName: "Window shot.png" }]])
  state.reply = await picture(160, 90, { r: 120, g: 120, b: 120 })
})

describe("taking a reflection off a picture clip", () => {
  it("sends the picture in its own shape and keeps the clean one on the shelf", async () => {
    const made = await cleanUpOwnedPicture({ userId: "u", videoId: "v1", mediaId: "own", kind: "reflection", model: "gemini-3.1-flash-image" })
    expect(state.generated[0].aspectRatio).toBe("16:9")
    expect(state.generated[0].prompt).toContain("reflections on the glass")
    expect(state.generated[0].references).toHaveLength(1)
    expect(state.saved[0].name).toBe("Window shot without reflection")
    expect(state.attached).toEqual(["p1"])
    expect(made).toMatchObject({ media_id: "new", width: 160, height: 90 })
  })

  it("names what to take out, and refuses without words", async () => {
    await cleanUpOwnedPicture({ userId: "u", videoId: "v1", mediaId: "own", kind: "object", words: "the cup", model: "gemini-3.1-flash-image" })
    expect(state.generated[0].prompt).toMatch(/^Remove the cup from this photo/)
    await expect(
      cleanUpOwnedPicture({ userId: "u", videoId: "v1", mediaId: "own", kind: "object", words: "  ", model: "gemini-3.1-flash-image" })
    ).rejects.toThrow(PICTURE_EDIT_WORDS_MESSAGE)
  })

  it("refuses a picture that is not in the caller's library", async () => {
    state.media.clear()
    await expect(
      cleanUpOwnedPicture({ userId: "u", videoId: "v1", mediaId: "own", kind: "reflection", model: "gemini-3.1-flash-image" })
    ).rejects.toThrow(PICTURE_EDIT_NOT_FOUND_MESSAGE)
    expect(state.generated).toHaveLength(0)
  })
})

describe("a cut-out", () => {
  it("comes back see-through where the model painted green", async () => {
    // A grey square on pure green, as the model is asked to make it.
    const green = await sharp({ create: { width: 40, height: 40, channels: 3, background: { r: 0, g: 255, b: 0 } } })
      .composite([{ input: Buffer.from(await picture(20, 20, { r: 128, g: 128, b: 128 })), left: 10, top: 10 }])
      .png()
      .toBuffer()
    const keyed = await keyOutGreen(new Uint8Array(green))
    const { data, info } = await sharp(keyed).raw().toBuffer({ resolveWithObject: true })
    const alphaAt = (x: number, y: number) => data[(y * info.width + x) * 4 + 3]
    expect(info.channels).toBe(4)
    expect(alphaAt(2, 2)).toBe(0)
    expect(alphaAt(20, 20)).toBe(255)
  })

  it("is kept as a PNG", async () => {
    state.reply = await picture(90, 160, { r: 0, g: 255, b: 0 })
    await editPicture({
      owner: "u",
      video: { id: "v1", projectId: "p1" },
      source: { bytes: state.reply, mimeType: "image/png" },
      kind: "cutout",
      model: "gemini-3.1-flash-image",
      name: "Me cut out",
    })
    expect(state.generated[0].aspectRatio).toBe("9:16")
    expect(state.saved[0].mimeType).toBe("image/png")
  })
})

describe("the words and shapes", () => {
  it("asks every change to leave the rest alone", () => {
    for (const kind of ["reflection", "brighter", "cleaner", "sharpen", "own"] as const) {
      expect(pictureEditPrompt(kind, "warmer")).toContain("Add nothing that was not there")
    }
  })

  it("picks the nearest shape Google can make", () => {
    expect(nearestImageAspect(1920, 1080)).toBe("16:9")
    expect(nearestImageAspect(1280, 1000)).toBe("5:4")
    expect(nearestImageAspect(1000, 1000)).toBe("1:1")
    expect(nearestImageAspect(1080, 1920)).toBe("9:16")
  })
})
