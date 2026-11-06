import { beforeEach, describe, expect, it } from "vitest"

import {
  PEXELS_HOURLY_LIMIT,
  PEXELS_KEY_REFUSED_MESSAGE,
} from "@/lib/video/pexels"
import {
  PEXELS_HOURLY_LIMIT_MESSAGE,
  PEXELS_RATE_LIMITED_MESSAGE,
  downloadPexelsPhoto,
  forgetPexelsRequests,
  isPexelsPhotoUrl,
  searchPexelsPhotos,
  testPexelsKey,
} from "@/server/video/pexels"

/** A fake Pexels that counts requests and answers with `answer(callNumber)`. */
function fakePexels(answer: (call: number, url: URL) => Response = () =>
  Response.json({ photos: [] })
) {
  const calls: URL[] = []
  const fetchImpl = (async (input: URL | string) => {
    const url = new URL(String(input))
    calls.push(url)
    return answer(calls.length, url)
  }) as typeof fetch
  return { calls, fetchImpl }
}

beforeEach(() => forgetPexelsRequests())

describe("testing a key", () => {
  it("asks for one result", async () => {
    const pexels = fakePexels()
    expect(await testPexelsKey("key", pexels.fetchImpl)).toEqual({ ok: true })
    expect(pexels.calls[0].searchParams.get("per_page")).toBe("1")
  })

  it("passes on a refusal in words", async () => {
    const pexels = fakePexels(() => new Response("", { status: 403 }))
    expect(await testPexelsKey("bad", pexels.fetchImpl)).toEqual({ ok: false, message: PEXELS_KEY_REFUSED_MESSAGE })
  })
})

describe("Pexels photos for carousels", () => {
  function photo(id: number, host = "images.pexels.com") {
    return {
      id,
      url: `https://www.pexels.com/photo/${id}/`,
      width: 3000,
      height: 4000,
      alt: "A runner at dawn",
      photographer: "Jane Doe",
      photographer_url: "https://www.pexels.com/@jane",
      src: {
        medium: `https://${host}/photos/${id}/medium.jpeg`,
        large2x: `https://${host}/photos/${id}/large2x.jpeg`,
      },
    }
  }

  it("asks the photo library once, in the carousel's shape", async () => {
    const pexels = fakePexels(() =>
      Response.json({ photos: [photo(1), photo(2)] })
    )
    const photos = await searchPexelsPhotos({
      apiKey: "key",
      query: "runner",
      orientation: "portrait",
      fetchImpl: pexels.fetchImpl,
    })
    expect(pexels.calls).toHaveLength(1)
    expect(pexels.calls[0].pathname).toBe("/v1/search")
    expect(pexels.calls[0].searchParams.get("orientation")).toBe("portrait")
    expect(photos.map((item) => item.pexelsId)).toEqual([1, 2])
    expect(photos[0].fileUrl).toBe(
      "https://images.pexels.com/photos/1/large2x.jpeg"
    )
  })

  it("leaves out a photo hosted anywhere but Pexels' picture host", async () => {
    const pexels = fakePexels(() =>
      Response.json({ photos: [photo(1), photo(2, "evil.example.com")] })
    )
    const photos = await searchPexelsPhotos({
      apiKey: "key",
      query: "runner",
      orientation: "square",
      fetchImpl: pexels.fetchImpl,
    })
    expect(photos.map((item) => item.pexelsId)).toEqual([1])
  })

  it("never sends more than 200 requests in an hour", async () => {
    const pexels = fakePexels(() => Response.json({ photos: [] }))
    for (let index = 0; index < PEXELS_HOURLY_LIMIT; index += 1) {
      await searchPexelsPhotos({
        apiKey: "key",
        query: "runner",
        orientation: "portrait",
        fetchImpl: pexels.fetchImpl,
      })
    }
    await expect(
      searchPexelsPhotos({
        apiKey: "key",
        query: "runner",
        orientation: "portrait",
        fetchImpl: pexels.fetchImpl,
      })
    ).rejects.toThrow(PEXELS_HOURLY_LIMIT_MESSAGE)
    expect(pexels.calls).toHaveLength(PEXELS_HOURLY_LIMIT)
  })

  it("says the key was refused in words", async () => {
    const pexels = fakePexels(() => new Response("", { status: 401 }))
    await expect(
      searchPexelsPhotos({
        apiKey: "bad",
        query: "runner",
        orientation: "portrait",
        fetchImpl: pexels.fetchImpl,
      })
    ).rejects.toThrow(PEXELS_KEY_REFUSED_MESSAGE)
  })

  it("says so in words when Pexels answers 429", async () => {
    const pexels = fakePexels(() => new Response("Too many", { status: 429 }))
    await expect(
      searchPexelsPhotos({
        apiKey: "key",
        query: "runner",
        orientation: "portrait",
        fetchImpl: pexels.fetchImpl,
      })
    ).rejects.toThrow(PEXELS_RATE_LIMITED_MESSAGE)
  })

  it("never downloads a photo from another host", async () => {
    const pexels = fakePexels()
    await expect(
      downloadPexelsPhoto("https://evil.example.com/a.jpeg", pexels.fetchImpl)
    ).rejects.toThrow("Not a Pexels photo address")
    expect(pexels.calls).toHaveLength(0)
    expect(isPexelsPhotoUrl("http://images.pexels.com/a.jpeg")).toBe(false)
  })
})
