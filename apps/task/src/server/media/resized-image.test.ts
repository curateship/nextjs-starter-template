import sharp from "sharp"
import { describe, expect, it, vi } from "vitest"

import {
  isResizedMediaStoragePath,
  mediaImageSrcSet,
} from "@/lib/media/image-sizes"
import {
  resizedImageResponse,
  type ResizedImageStorage,
} from "@/server/media/resized-image"

const OWNER = "11111111-2222-3333-4444-555555555555"
const BASE = "https://media.example.test"

async function widePng(width: number, height: number) {
  return new Uint8Array(
    await sharp({
      create: {
        width,
        height,
        channels: 4,
        background: { r: 30, g: 100, b: 200, alpha: 1 },
      },
    })
      .png()
      .toBuffer()
  )
}

function fakeStorage(files: Map<string, Uint8Array>): ResizedImageStorage {
  return {
    toStoragePath: async (url) =>
      url.startsWith(`${BASE}/`) ? url.slice(BASE.length + 1) : null,
    exists: async (path) => files.has(path),
    read: async (path) => {
      const file = files.get(path)
      if (!file) throw new Error("missing")
      return file
    },
    write: async (path, data) => {
      files.set(path, data)
    },
    publicUrl: async (path) => `${BASE}/${path}`,
  }
}

function ask(source: string, width: number | string) {
  return new Request(
    `https://app.example.test/api/v1/media/resized?src=${encodeURIComponent(source)}&w=${width}`
  )
}

describe("resized public images", () => {
  it("cuts a smaller copy once and points at it from then on", async () => {
    const files = new Map([[`${OWNER}/photo.png`, await widePng(2000, 1000)]])
    const storage = fakeStorage(files)
    const write = vi.spyOn(storage, "write")
    const source = `${BASE}/${OWNER}/photo.png`

    const first = await resizedImageResponse(ask(source, 400), storage)
    expect(first.status).toBe(302)
    expect(first.headers.get("Location")).toBe(
      `${BASE}/${OWNER}/sizes/400/photo.png`
    )

    const copy = files.get(`${OWNER}/sizes/400/photo.png`)
    expect(copy).toBeDefined()
    expect((await sharp(copy!).metadata()).width).toBe(400)
    expect(copy!.byteLength).toBeLessThan(
      files.get(`${OWNER}/photo.png`)!.byteLength
    )

    const second = await resizedImageResponse(ask(source, 400), storage)
    expect(second.headers.get("Location")).toBe(
      `${BASE}/${OWNER}/sizes/400/photo.png`
    )
    expect(write).toHaveBeenCalledTimes(1)
  })

  it("decodes once when many browsers ask for the same copy at once", async () => {
    const files = new Map([[`${OWNER}/photo.png`, await widePng(2000, 1000)]])
    const storage = fakeStorage(files)
    const read = vi.spyOn(storage, "read")
    const write = vi.spyOn(storage, "write")
    const source = `${BASE}/${OWNER}/photo.png`

    const answers = await Promise.all(
      Array.from({ length: 8 }, () =>
        resizedImageResponse(ask(source, 800), storage)
      )
    )

    for (const answer of answers) {
      expect(answer.headers.get("Location")).toBe(
        `${BASE}/${OWNER}/sizes/800/photo.png`
      )
    }
    expect(read).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledTimes(1)
  })

  it("sends a picture already narrower than the ask to the original", async () => {
    const files = new Map([[`${OWNER}/small.png`, await widePng(300, 200)]])
    const source = `${BASE}/${OWNER}/small.png`

    const response = await resizedImageResponse(
      ask(source, 800),
      fakeStorage(files)
    )

    expect(response.headers.get("Location")).toBe(source)
    expect(files.has(`${OWNER}/sizes/800/small.png`)).toBe(false)
  })

  it("falls back to the original when the file cannot be read", async () => {
    const source = `${BASE}/${OWNER}/gone.png`

    const response = await resizedImageResponse(
      ask(source, 800),
      fakeStorage(new Map())
    )

    expect(response.status).toBe(302)
    expect(response.headers.get("Location")).toBe(source)
    expect(response.headers.get("Cache-Control")).toBe("public, max-age=60")
  })

  it("refuses an address outside this app's own storage", async () => {
    const response = await resizedImageResponse(
      ask("https://evil.example/logo.png", 400),
      fakeStorage(new Map())
    )

    expect(response.status).toBe(400)
    expect(response.headers.get("Location")).toBeNull()
  })

  it("refuses a width the pages never ask for", async () => {
    const files = new Map([[`${OWNER}/photo.png`, await widePng(2000, 1000)]])

    const response = await resizedImageResponse(
      ask(`${BASE}/${OWNER}/photo.png`, 999),
      fakeStorage(files)
    )

    expect(response.status).toBe(400)
    expect(files.size).toBe(1)
  })

  it("never cuts a copy of a copy", async () => {
    const copyPath = `${OWNER}/sizes/400/photo.png`
    const files = new Map([[copyPath, await widePng(400, 200)]])
    const source = `${BASE}/${copyPath}`

    expect(isResizedMediaStoragePath(copyPath)).toBe(true)
    const response = await resizedImageResponse(
      ask(source, 400),
      fakeStorage(files)
    )

    expect(response.headers.get("Location")).toBe(source)
    expect(files.size).toBe(1)
  })
})

describe("the srcset a page writes", () => {
  it("offers every width plus the uploaded file", () => {
    const source = `${BASE}/${OWNER}/photo.png`

    expect(mediaImageSrcSet(source)).toBe(
      [
        `/api/v1/media/resized?src=${encodeURIComponent(source)}&w=400 400w`,
        `/api/v1/media/resized?src=${encodeURIComponent(source)}&w=800 800w`,
        `/api/v1/media/resized?src=${encodeURIComponent(source)}&w=1600 1600w`,
        `${source} 2400w`,
      ].join(", ")
    )
  })

  it("offers nothing for a drawing or an animation", () => {
    expect(mediaImageSrcSet(`${BASE}/${OWNER}/logo.svg`)).toBeUndefined()
    expect(mediaImageSrcSet(`${BASE}/${OWNER}/loop.gif`)).toBeUndefined()
  })
})
