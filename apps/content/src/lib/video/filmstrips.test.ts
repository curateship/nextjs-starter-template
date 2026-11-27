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

describe("frames along a long video", () => {
  const HOUR = 60 * 60_000

  function hourSheet(sheet: number) {
    return new Response(new Blob([`jpeg-${sheet}`]), {
      status: 200,
      headers: {
        "X-Filmstrip-Columns": "10",
        "X-Filmstrip-Duration-Ms": String(HOUR),
        "X-Filmstrip-Frame-Count": "720",
        "X-Filmstrip-Frame-Height": "160",
        "X-Filmstrip-Frame-Width": "284",
        "X-Filmstrip-Sheets": "6",
        "X-Filmstrip-Rows-Per-Sheet": "12",
      },
    })
  }

  beforeEach(() => {
    let made = 0
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => `blob:sheet-${made++}`)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("fetches every sheet, and shows a frame for every five seconds when there is room", async () => {
    fetchMock.mockImplementation(async (address: string) => {
      const sheet = Number(new URL(address, "http://local").searchParams.get("sheet") ?? 0)
      return hourSheet(sheet)
    })

    const frames = await getVideoFilmstrip(
      nextMediaId(),
      { startMs: 0, durationMs: HOUR },
      new AbortController().signal,
      undefined,
      10_000
    )

    expect(fetchMock).toHaveBeenCalledTimes(6)
    expect(frames).toHaveLength(720)
    // Frame 437 is on the fourth sheet (120 to a sheet), its 78th frame:
    // row 7, column 7.
    const frame = frames.find((one) => one.index === 437)!
    expect(frame).toMatchObject({ column: 7, row: 7, rows: 12, columns: 10 })
    expect(frame.backgroundImage).toBe('url("blob:sheet-3")')
  })

  it("shows only as many frames as the clip has room for", async () => {
    fetchMock.mockImplementation(async () => hourSheet(0))
    const frames = await getVideoFilmstrip(
      nextMediaId(),
      { startMs: 0, durationMs: HOUR },
      new AbortController().signal,
      undefined,
      24
    )
    expect(frames).toHaveLength(24)
  })

  it("reads a strip made before sheets as one picture", async () => {
    fetchMock.mockResolvedValueOnce(ready())
    const frames = await getVideoFilmstrip(
      nextMediaId(),
      WINDOW,
      new AbortController().signal
    )
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(frames.map((frame) => frame.rows)).toEqual([1, 1])
  })
})
