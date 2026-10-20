import { beforeEach, describe, expect, it } from "vitest"

import {
  BROLL_KEY_REFUSED_MESSAGE,
  PEXELS_HOURLY_LIMIT,
} from "@/lib/video/b-roll"
import {
  PEXELS_HOURLY_LIMIT_MESSAGE,
  PEXELS_RATE_LIMITED_MESSAGE,
  downloadPexelsFile,
  forgetPexelsRequests,
  searchPexelsRows,
  testPexelsKey,
} from "@/server/video/pexels"

/** One Pexels video in the API's own shape, with a 720p copy unless told not to. */
function video(id: number, { sharp = true } = {}) {
  return {
    id,
    url: `https://www.pexels.com/video/${id}/`,
    image: `https://images.pexels.com/videos/${id}/pictures/preview-0.jpg`,
    duration: 8,
    width: 1080,
    height: 1920,
    user: { id: 1, name: "Jane Doe", url: "https://www.pexels.com/@jane" },
    video_files: [
      { id: 1, quality: "sd", file_type: "video/mp4", width: 360, height: 640, fps: 25, link: `https://videos.pexels.com/video-files/${id}/sd.mp4` },
      ...(sharp
        ? [{ id: 2, quality: "hd", file_type: "video/mp4", width: 720, height: 1280, fps: 25, link: `https://videos.pexels.com/video-files/${id}/hd.mp4` }]
        : []),
      { id: 3, quality: "uhd", file_type: "video/mp4", width: 2160, height: 3840, fps: 25, link: `https://videos.pexels.com/video-files/${id}/uhd.mp4` },
    ],
    video_pictures: [],
  }
}

/** A fake Pexels that counts requests and answers with `answer(callNumber)`. */
function fakePexels(answer: (call: number, url: URL) => Response = () =>
  Response.json({ videos: [video(1), video(2), video(3), video(4), video(5)] })
) {
  const calls: URL[] = []
  const fetchImpl = (async (input: URL | string) => {
    const url = new URL(String(input))
    calls.push(url)
    return answer(calls.length, url)
  }) as typeof fetch
  return { calls, fetchImpl }
}

const rows = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ id: `s${index + 1}`, phrase: `phrase ${index + 1}` }))

beforeEach(() => forgetPexelsRequests())

describe("searching Pexels for each row", () => {
  it("costs one request per sentence: 14 sentences are 14 requests", async () => {
    const pexels = fakePexels()
    const batch = await searchPexelsRows({
      apiKey: "key",
      rows: rows(14),
      orientation: "portrait",
      fetchImpl: pexels.fetchImpl,
    })
    expect(pexels.calls).toHaveLength(14)
    expect(Object.keys(batch.found)).toHaveLength(14)
    expect(batch.stopped).toBeNull()
  })

  it("asks for the project's orientation, and offers at most four clips a row", async () => {
    const pexels = fakePexels()
    const batch = await searchPexelsRows({
      apiKey: "key",
      rows: [{ id: "s1", phrase: "email inbox" }],
      orientation: "portrait",
      fetchImpl: pexels.fetchImpl,
    })
    expect(pexels.calls[0].searchParams.get("orientation")).toBe("portrait")
    expect(pexels.calls[0].searchParams.get("query")).toBe("email inbox")
    expect(batch.found.s1).toHaveLength(4)
    // The smallest copy at 720p or above, never the 4K one.
    expect(batch.found.s1[0].fileUrl).toBe("https://videos.pexels.com/video-files/1/hd.mp4")
    expect(batch.found.s1[0].previewUrl).toBe("https://videos.pexels.com/video-files/1/sd.mp4")
  })

  it("leaves out clips with no copy at 720p or above", async () => {
    const pexels = fakePexels(() =>
      Response.json({ videos: [{ ...video(1), video_files: video(1).video_files.slice(0, 1) }, video(2, { sharp: false })] })
    )
    const batch = await searchPexelsRows({ apiKey: "key", rows: rows(1), orientation: "portrait", fetchImpl: pexels.fetchImpl })
    // Video 2 still has its 4K copy, which is above 720p; video 1 has only 360p.
    expect(batch.found.s1.map((one) => one.pexelsId)).toEqual([2])
  })

  it("stops at a 429, keeps what it found, and leaves the rest to search later", async () => {
    const pexels = fakePexels((call) =>
      call >= 6 ? new Response("Too many", { status: 429 }) : Response.json({ videos: [video(call)] })
    )
    const batch = await searchPexelsRows({ apiKey: "key", rows: rows(14), orientation: "portrait", fetchImpl: pexels.fetchImpl })
    expect(batch.stopped?.message).toBe(PEXELS_RATE_LIMITED_MESSAGE)
    expect(batch.stopped?.retryAtMs).toBeGreaterThan(Date.now())
    expect(Object.keys(batch.found).length).toBe(5)
    // No new search starts after the stop; only the ones already on their way finish.
    expect(pexels.calls.length).toBeLessThan(14)
  })

  it("never sends more than 200 requests in an hour", async () => {
    const pexels = fakePexels()
    await searchPexelsRows({ apiKey: "key", rows: rows(195), orientation: "landscape", fetchImpl: pexels.fetchImpl })
    const batch = await searchPexelsRows({ apiKey: "key", rows: rows(14), orientation: "landscape", fetchImpl: pexels.fetchImpl })
    expect(pexels.calls).toHaveLength(PEXELS_HOURLY_LIMIT)
    expect(Object.keys(batch.found)).toHaveLength(5)
    expect(batch.stopped?.message).toBe(PEXELS_HOURLY_LIMIT_MESSAGE)
  })

  it("says the key was refused when Pexels answers 401", async () => {
    const pexels = fakePexels(() => new Response("Unauthorized", { status: 401 }))
    const batch = await searchPexelsRows({ apiKey: "bad", rows: rows(3), orientation: "portrait", fetchImpl: pexels.fetchImpl })
    expect(batch.stopped?.message).toBe(BROLL_KEY_REFUSED_MESSAGE)
    expect(batch.found).toEqual({})
  })
})

describe("testing a key", () => {
  it("asks for one result", async () => {
    const pexels = fakePexels()
    expect(await testPexelsKey("key", pexels.fetchImpl)).toEqual({ ok: true })
    expect(pexels.calls[0].searchParams.get("per_page")).toBe("1")
  })

  it("passes on a refusal in words", async () => {
    const pexels = fakePexels(() => new Response("", { status: 403 }))
    expect(await testPexelsKey("bad", pexels.fetchImpl)).toEqual({ ok: false, message: BROLL_KEY_REFUSED_MESSAGE })
  })
})

describe("downloading a file on Place", () => {
  it("refuses any address that is not Pexels' video host, without fetching it", async () => {
    const pexels = fakePexels()
    for (const address of [
      "http://videos.pexels.com/video-files/1/hd.mp4",
      "https://videos.pexels.com.evil.test/1.mp4",
      "https://169.254.169.254/latest/meta-data",
    ]) {
      await expect(downloadPexelsFile(address, pexels.fetchImpl)).rejects.toThrow()
    }
    expect(pexels.calls).toHaveLength(0)
  })

  it("refuses a redirect instead of following it", async () => {
    const pexels = fakePexels(() => new Response(null, { status: 302, headers: { Location: "https://elsewhere.test/" } }))
    await expect(downloadPexelsFile("https://videos.pexels.com/video-files/1/hd.mp4", pexels.fetchImpl)).rejects.toThrow("HTTP 302")
  })

  it("refuses a file over the library's 100MB limit", async () => {
    const pexels = fakePexels(() => new Response("x", { headers: { "Content-Length": String(101 * 1024 * 1024) } }))
    await expect(downloadPexelsFile("https://videos.pexels.com/video-files/1/hd.mp4", pexels.fetchImpl)).rejects.toThrow("100MB")
  })

  it("hands back the bytes", async () => {
    const pexels = fakePexels(() => new Response(new Uint8Array([1, 2, 3])))
    expect(Array.from(await downloadPexelsFile("https://videos.pexels.com/video-files/1/hd.mp4", pexels.fetchImpl))).toEqual([1, 2, 3])
  })
})
