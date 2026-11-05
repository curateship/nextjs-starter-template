import { describe, expect, it, vi } from "vitest"

import {
  createPauseGate,
  isUploadCancelled,
  sendFileInParts,
  type PutPart,
} from "@/lib/media/upload-in-parts"

const signPart = async (partNumber: number, _size?: number) => `piece-${partNumber}`

// 25 bytes in pieces of 10: two full pieces and one of 5.
const file = new Blob(["a".repeat(25)])

describe("sending a file in pieces", () => {
  it("sends every piece once, reports the bytes, and lists the pieces in order", async () => {
    const sizes: Record<string, number> = {}
    const putPart: PutPart = async (url, body, onBytes) => {
      sizes[url] = body.size
      onBytes(body.size / 2)
      return `"etag-${url}"`
    }
    const progress: number[] = []
    const signed: [number, number][] = []

    const parts = await sendFileInParts({
      file,
      partBytes: 10,
      partCount: 3,
      signPart: async (partNumber, size) => {
        signed.push([partNumber, size])
        return signPart(partNumber)
      },
      putPart,
      onProgress: (fraction) => progress.push(fraction),
    })

    expect(parts).toEqual([
      { partNumber: 1, etag: '"etag-piece-1"' },
      { partNumber: 2, etag: '"etag-piece-2"' },
      { partNumber: 3, etag: '"etag-piece-3"' },
    ])
    expect(sizes).toEqual({ "piece-1": 10, "piece-2": 10, "piece-3": 5 })
    expect(signed.sort()).toEqual([
      [1, 10],
      [2, 10],
      [3, 5],
    ])
    expect(progress[0]).toBe(0)
    expect(progress.at(-1)).toBe(1)
  })

  it("sends a failed piece again and carries on", async () => {
    let failures = 0
    const putPart: PutPart = async (url) => {
      if (url === "piece-2" && failures < 2) {
        failures += 1
        throw new Error("dropped")
      }
      return `"${url}"`
    }

    const parts = await sendFileInParts({
      file,
      partBytes: 10,
      partCount: 3,
      signPart,
      putPart,
      retryDelayMs: 0,
    })
    expect(parts).toHaveLength(3)
    expect(failures).toBe(2)
  })

  it("gives up after three tries with the piece's own reason, and stops the others", async () => {
    const stopped: string[] = []
    const putPart: PutPart = (url, _body, _onBytes, signal) =>
      new Promise((_resolve, reject) => {
        if (url === "piece-1") {
          reject(new Error("The storage bucket answered 403."))
          return
        }
        signal.addEventListener("abort", () => {
          stopped.push(url)
          reject(new DOMException("aborted", "AbortError"))
        })
      })

    await expect(
      sendFileInParts({
        file,
        partBytes: 10,
        partCount: 3,
        signPart,
        putPart,
        retryDelayMs: 0,
      })
    ).rejects.toThrow("The storage bucket answered 403.")
    expect(stopped.sort()).toEqual(["piece-2", "piece-3"])
  })

  it("stops every piece in the air when the caller cancels", async () => {
    const controller = new AbortController()
    const started = vi.fn()
    const putPart: PutPart = (url, _body, _onBytes, signal) =>
      new Promise((_resolve, reject) => {
        started(url)
        signal.addEventListener("abort", () =>
          reject(new DOMException("aborted", "AbortError"))
        )
        if (started.mock.calls.length === 3) controller.abort()
      })

    const error = await sendFileInParts({
      file,
      partBytes: 10,
      partCount: 3,
      signPart,
      putPart,
      signal: controller.signal,
    }).catch((caught: unknown) => caught)

    expect(isUploadCancelled(error)).toBe(true)
    // No piece is sent a second time after a cancel.
    expect(started).toHaveBeenCalledTimes(3)
  })

  it("sends nothing once cancelled while a piece's address was being signed", async () => {
    const controller = new AbortController()
    const putPart = vi.fn<PutPart>(async () => '"never"')

    const error = await sendFileInParts({
      file,
      partBytes: 10,
      partCount: 1,
      signPart: async (partNumber, size) => {
        controller.abort()
        return signPart(partNumber, size)
      },
      putPart,
      signal: controller.signal,
    }).catch((caught: unknown) => caught)

    expect(isUploadCancelled(error)).toBe(true)
    expect(putPart).not.toHaveBeenCalled()
  })

  it("skips the pieces the bucket already holds and starts the count from them", async () => {
    const sentUrls: string[] = []
    const progress: number[] = []
    const parts = await sendFileInParts({
      file,
      partBytes: 10,
      partCount: 3,
      signPart,
      putPart: async (url) => {
        sentUrls.push(url)
        return `"${url}"`
      },
      alreadySent: [{ partNumber: 1, etag: '"held-1"' }],
      onProgress: (fraction) => progress.push(fraction),
    })

    expect(sentUrls.sort()).toEqual(["piece-2", "piece-3"])
    expect(parts).toEqual([
      { partNumber: 1, etag: '"held-1"' },
      { partNumber: 2, etag: '"piece-2"' },
      { partNumber: 3, etag: '"piece-3"' },
    ])
    // The first reading already counts the 10 bytes the bucket holds.
    expect(progress[0]).toBe(10 / 25)
    expect(progress.at(-1)).toBe(1)
  })

  it("lets the pieces in the air land on pause, starts none, and carries on at resume", async () => {
    const gate = createPauseGate()
    const sentUrls: string[] = []
    let releaseFirst!: () => void
    const firstInAir = new Promise<void>((resolve) => {
      releaseFirst = resolve
    })
    // Six pieces of 10, four in the air at once, so pieces 5 and 6 wait
    // for a free slot.
    const big = new Blob(["a".repeat(60)])
    const upload = sendFileInParts({
      file: big,
      partBytes: 10,
      partCount: 6,
      signPart,
      gate,
      putPart: async (url) => {
        sentUrls.push(url)
        await firstInAir
        return `"${url}"`
      },
    })

    await new Promise((resolve) => setTimeout(resolve, 0))
    gate.pause()
    releaseFirst()
    await new Promise((resolve) => setTimeout(resolve, 10))
    // The four in the air landed, and the free slots took nothing new.
    expect(sentUrls.sort()).toEqual(["piece-1", "piece-2", "piece-3", "piece-4"])

    gate.resume()
    await expect(upload).resolves.toHaveLength(6)
    expect(sentUrls.sort()).toEqual([
      "piece-1",
      "piece-2",
      "piece-3",
      "piece-4",
      "piece-5",
      "piece-6",
    ])
  })

  it("starts no new piece while paused and stops when cancelled during the pause", async () => {
    const gate = createPauseGate()
    gate.pause()
    const controller = new AbortController()
    const putPart = vi.fn(async (url: string) => `"${url}"`)
    const upload = sendFileInParts({
      file,
      partBytes: 10,
      partCount: 3,
      signPart,
      putPart,
      gate,
      signal: controller.signal,
    })
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(putPart).not.toHaveBeenCalled()

    controller.abort()
    await expect(upload).rejects.toSatisfy(isUploadCancelled)
  })

  it("waits before trying a piece again", async () => {
    vi.useFakeTimers()
    try {
      let tries = 0
      const upload = sendFileInParts({
        file: new Blob(["a".repeat(5)]),
        partBytes: 10,
        partCount: 1,
        signPart,
        retryDelayMs: 1000,
        putPart: async (url) => {
          tries += 1
          if (tries === 1) throw new Error("dropped")
          return `"${url}"`
        },
      })
      await vi.advanceTimersByTimeAsync(500)
      expect(tries).toBe(1)
      await vi.advanceTimersByTimeAsync(600)
      expect(tries).toBe(2)
      await expect(upload).resolves.toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
