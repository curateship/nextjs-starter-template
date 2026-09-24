import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { Readable } from "node:stream"
import { describe, expect, it, vi } from "vitest"

import { downloadToFile } from "@/server/video/storage-files"

// A stored file that trickles in and would take a minute to finish.
vi.mock("@/server/media/storage", () => ({
  getFromR2: async () => ({
    Body: new Readable({
      read() {
        setTimeout(() => this.push(Buffer.alloc(1024)), 1_000)
      },
    }),
  }),
}))

describe("downloading a stored file", () => {
  it("gives up partway when it is stopped", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "download-stop-"))
    try {
      const stop = new AbortController()
      const download = downloadToFile(
        "video/source.mp4",
        path.join(dir, "source.mp4"),
        stop.signal
      )
      setTimeout(() => stop.abort(), 100)

      const startedAt = Date.now()
      await expect(download).rejects.toThrowError()
      expect(Date.now() - startedAt).toBeLessThan(900)
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
