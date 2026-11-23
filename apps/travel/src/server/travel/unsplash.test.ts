import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import { searchPhotos, trackDownload, unsplashEnabled } from "@/server/travel/unsplash"

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })

const result = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  width: 4000,
  height: 3000,
  urls: {
    regular: `https://images.unsplash.com/photo-${id}?w=1080`,
    small: `https://images.unsplash.com/photo-${id}?w=400`,
  },
  links: {
    html: `https://unsplash.com/photos/${id}`,
    download_location: `https://api.unsplash.com/photos/${id}/download?ixid=abc`,
  },
  user: { name: "Aiko Tanaka", links: { html: "https://unsplash.com/@aiko" } },
  ...overrides,
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

describe("unsplash with no key", () => {
  it("says Unsplash is off and never calls it", async () => {
    vi.stubEnv("UNSPLASH_ACCESS_KEY", "")
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    expect(unsplashEnabled()).toBe(false)
    await expect(searchPhotos("kyoto", 1)).rejects.toThrow(TRAVEL_ERRORS.unsplashOff)
    await expect(trackDownload("https://api.unsplash.com/photos/a/download")).rejects.toThrow(
      TRAVEL_ERRORS.unsplashOff
    )
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe("unsplash search", () => {
  beforeEach(() => vi.stubEnv("UNSPLASH_ACCESS_KEY", "test-key"))

  it("returns photos with a credit that links back with the referral tags", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      json({
        results: [
          result("a"),
          result("b", { urls: { regular: "https://evil.example/b.jpg", small: "https://evil.example/b.jpg" } }),
        ],
      })
    )
    vi.stubGlobal("fetch", fetchMock)
    const photos = await searchPhotos("Kyoto temple", 2)
    expect(photos).toHaveLength(1)
    expect(photos[0]).toEqual({
      id: "a",
      thumbUrl: "https://images.unsplash.com/photo-a?w=400",
      url: "https://images.unsplash.com/photo-a?w=1080",
      width: 4000,
      height: 3000,
      credit: {
        name: "Aiko Tanaka",
        profileUrl: "https://unsplash.com/@aiko?utm_source=travel&utm_medium=referral",
        photoPageUrl: "https://unsplash.com/photos/a?utm_source=travel&utm_medium=referral",
      },
      downloadLocation: "https://api.unsplash.com/photos/a/download?ixid=abc",
    })
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const asked = new URL(url)
    expect(asked.origin + asked.pathname).toBe("https://api.unsplash.com/search/photos")
    expect(asked.searchParams.get("query")).toBe("Kyoto temple")
    expect(asked.searchParams.get("page")).toBe("2")
    expect(asked.searchParams.get("per_page")).toBe("20")
    expect((init.headers as Record<string, string>).Authorization).toBe("Client-ID test-key")
  })

  it("says Unsplash failed on a bad answer", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ errors: ["Rate Limit Exceeded"] }, 403)))
    await expect(searchPhotos("kyoto", 1)).rejects.toThrow(TRAVEL_ERRORS.unsplashFailed)
  })
})

describe("unsplash download ping", () => {
  beforeEach(() => vi.stubEnv("UNSPLASH_ACCESS_KEY", "test-key"))

  it("calls Unsplash's own address with the key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({ url: "https://images.unsplash.com/x" }))
    vi.stubGlobal("fetch", fetchMock)
    await trackDownload("https://api.unsplash.com/photos/a/download?ixid=abc")
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("https://api.unsplash.com/photos/a/download?ixid=abc")
    expect((init.headers as Record<string, string>).Authorization).toBe("Client-ID test-key")
  })

  it.each([
    "https://api.unsplash.com.evil.com/x",
    "http://api.unsplash.com/photos/a/download",
    "https://evil.com/?u=https://api.unsplash.com/",
    "https://user:pass@api.unsplash.com/photos/a/download",
    "https://api.unsplash.com:8443/photos/a/download",
    "http://169.254.169.254/latest/meta-data/",
    "not a link",
  ])("refuses %s without calling it", async (link) => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    await expect(trackDownload(link)).rejects.toThrow(TRAVEL_ERRORS.unsplashBadLink)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
