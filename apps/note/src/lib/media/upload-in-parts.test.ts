import { describe, expect, it, vi } from "vitest"

import {
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
      sendFileInParts({ file, partBytes: 10, partCount: 3, signPart, putPart })
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
})
