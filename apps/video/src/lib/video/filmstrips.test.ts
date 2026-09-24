import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  FilmstripFailedError,
  getVideoFilmstrip,
} from "@/lib/video/filmstrips"

const WINDOW = { startMs: 0, durationMs: 4000 }

function building() {
  return new Response(null, { status: 202, headers: { "Retry-After": "2" } })
}

function ready() {
  return new Response(new Blob(["jpeg"]), {
    status: 200,
    headers: {
      "X-Filmstrip-Columns": "2",
      "X-Filmstrip-Duration-Ms": "4000",
      "X-Filmstrip-Frame-Count": "2",
      "X-Filmstrip-Frame-Height": "160",
      "X-Filmstrip-Frame-Width": "284",
    },
  })
}

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers()
  fetchMock = vi.fn()
  vi.stubGlobal("fetch", fetchMock)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

// Each test uses its own file, so the shared cache never carries one test's
// strip into the next.
let fileNumber = 0
function nextMediaId() {
  fileNumber += 1
  return `media-${fileNumber}`
}

describe("getVideoFilmstrip", () => {
  it("waits as long as the route asks between checks, and says it is building", async () => {
    fetchMock
      .mockResolvedValueOnce(building())
      .mockResolvedValueOnce(building())
      .mockResolvedValueOnce(ready())
    const onBuilding = vi.fn()
    const loading = getVideoFilmstrip(
      nextMediaId(),
      WINDOW,
      new AbortController().signal,
      onBuilding
    )

    await vi.advanceTimersByTimeAsync(1999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(onBuilding).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(2000)

    await expect(loading).resolves.toHaveLength(2)
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(onBuilding).toHaveBeenCalledTimes(1)
  })

  it("keeps waiting past two minutes instead of giving up", async () => {
    fetchMock.mockImplementation(async () => building())
    const loading = getVideoFilmstrip(
      nextMediaId(),
      WINDOW,
      new AbortController().signal
    )
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000)
    fetchMock.mockImplementation(async () => ready())
    await vi.advanceTimersByTimeAsync(2000)
    await expect(loading).resolves.toHaveLength(2)
  })

  it("never calls a strip that is already made 'building'", async () => {
    fetchMock.mockResolvedValueOnce(ready())
    const onBuilding = vi.fn()
    await getVideoFilmstrip(
      nextMediaId(),
      WINDOW,
      new AbortController().signal,
      onBuilding
    )
    expect(onBuilding).not.toHaveBeenCalled()
  })

  it("stops asking once the last clip waiting for it goes", async () => {
    fetchMock.mockImplementation(async () => building())
    const controller = new AbortController()
    const loading = getVideoFilmstrip(nextMediaId(), WINDOW, controller.signal)
    loading.catch(() => undefined)
    await vi.advanceTimersByTimeAsync(4000)
    const asked = fetchMock.mock.calls.length

    controller.abort()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetchMock).toHaveBeenCalledTimes(asked)
  })

  it("keeps one wait going when a clip lets go and takes hold in the same moment", async () => {
    fetchMock.mockImplementation(async () => building())
    const mediaId = nextMediaId()
    const first = new AbortController()
    getVideoFilmstrip(mediaId, WINDOW, first.signal).catch(() => undefined)
    await vi.advanceTimersByTimeAsync(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    first.abort()
    getVideoFilmstrip(mediaId, { startMs: 1000, durationMs: 2000 }, new AbortController().signal)
      .catch(() => undefined)
    await vi.advanceTimersByTimeAsync(1999)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("turns a strip the worker gave up on into a FilmstripFailedError", async () => {
    fetchMock.mockResolvedValueOnce(
      Response.json({ detail: "Filmstrip failed" }, { status: 422 })
    )
    await expect(
      getVideoFilmstrip(nextMediaId(), WINDOW, new AbortController().signal)
    ).rejects.toBeInstanceOf(FilmstripFailedError)
  })
})
