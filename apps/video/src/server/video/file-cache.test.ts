import { mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { DiskFullError, DISK_MARGIN_BYTES } from "@/server/video/disk-space"
import { cacheBytesForDisk, FileCache } from "@/server/video/file-cache"

const GB = 1024 * 1024 * 1024
const PLENTY = 500 * GB

type Download = (storagePath: string, filePath: string) => Promise<void>

let dir: string
let download: ReturnType<typeof vi.fn<Download>>

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "file-cache-"))
  // Stands in for a download from the bucket: writes as many bytes as the
  // stored file's name says.
  download = vi.fn<Download>(async (storagePath, filePath) => {
    const size = Number(storagePath.match(/(\d+)b/)?.[1] ?? 10)
    await writeFile(filePath, Buffer.alloc(size))
  })
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

function cache(maxBytes = 1000, freeBytes = PLENTY) {
  return new FileCache({
    dir,
    maxBytes,
    download,
    readFree: async () => freeBytes,
  })
}

describe("the kept copies of stored files", () => {
  it("downloads a file once and hands the kept copy to every later job", async () => {
    const files = cache()
    const first = await files.open("user/a_100b.mp4", 100)
    await first.release()
    const second = await files.open("user/a_100b.mp4", 100)
    await second.release()

    expect(download).toHaveBeenCalledTimes(1)
    expect(second.path).toBe(first.path)
  })

  it("shares one download between two jobs asking at once", async () => {
    const files = cache()
    const [one, two] = await Promise.all([
      files.open("user/a_100b.mp4", 100),
      files.open("user/a_100b.mp4", 100),
    ])
    expect(download).toHaveBeenCalledTimes(1)
    expect(one.path).toBe(two.path)
  })

  it("finds a kept copy without downloading, and says when there is none", async () => {
    const files = cache()
    expect(await files.peek("user/a_100b.mp4")).toBeNull()
    await (await files.open("user/a_100b.mp4", 100)).release()
    expect((await files.peek("user/a_100b.mp4"))?.path).toBe(files.pathFor("user/a_100b.mp4"))
    expect(download).toHaveBeenCalledTimes(1)
  })

  it("makes room by deleting the copies used longest ago, never one in use", async () => {
    const files = cache(300)
    const old = await files.open("user/old_100b.mp4", 100)
    await old.release()
    const busy = await files.open("user/busy_100b.mp4", 100)
    const recent = await files.open("user/recent_100b.mp4", 100)
    await recent.release()
    // The busy one is oldest of all, but a job is reading it.
    await utimes(busy.path, new Date(1000), new Date(1000))
    await utimes(old.path, new Date(2000), new Date(2000))

    await (await files.open("user/new_100b.mp4", 100)).release()

    const left = await readdir(dir)
    expect(left).toContain(path.basename(busy.path))
    expect(left).toContain(path.basename(recent.path))
    expect(left).not.toContain(path.basename(old.path))
    await busy.release()
  })

  it("does not keep a file bigger than the whole folder may be", async () => {
    const files = cache(50)
    const once = await files.open("user/huge_100b.mp4", 100)
    expect(await readdir(dir)).toHaveLength(1)
    await once.release()
    expect(await readdir(dir)).toEqual([])
    expect(await files.peek("user/huge_100b.mp4")).toBeNull()
  })

  it("waits for room instead of filling the disk", async () => {
    const files = cache(PLENTY, DISK_MARGIN_BYTES + 50)
    await expect(files.open("user/a_100b.mp4", 100)).rejects.toBeInstanceOf(DiskFullError)
    expect(download).not.toHaveBeenCalled()
    expect(await readdir(dir)).toEqual([])
  })

  it("leaves nothing behind when a download fails", async () => {
    const files = cache()
    download.mockImplementationOnce(async (_storagePath, filePath) => {
      await writeFile(filePath, "half")
      throw new Error("connection dropped")
    })
    await expect(files.open("user/a_100b.mp4", 100)).rejects.toThrow("connection dropped")
    expect(await readdir(dir)).toEqual([])
  })

  it("sweeps out copies of files that were deleted, but not one in use", async () => {
    const files = cache()
    await (await files.open("user/kept_10b.mp4", 10)).release()
    await (await files.open("user/deleted_10b.mp4", 10)).release()
    const reading = await files.open("user/reading_10b.mp4", 10)

    await files.sweep(["user/kept_10b.mp4"])

    const left = await readdir(dir)
    expect(left.sort()).toEqual(
      [
        path.basename(files.pathFor("user/kept_10b.mp4")),
        path.basename(reading.path),
      ].sort()
    )
    await reading.release()
  })
})

describe("how big the kept copies may grow", () => {
  it("takes a quarter of the disk, and never more than 100GB", () => {
    expect(cacheBytesForDisk(200 * GB)).toBe(50 * GB)
    expect(cacheBytesForDisk(2000 * GB)).toBe(100 * GB)
  })
})

describe("the disk check", () => {
  it("says in words how much room it needs and how much there is", () => {
    const error = new DiskFullError(22 * GB, 8 * GB)
    expect(error.message).toBe(
      "Waiting for room on the server's disk: this needs 22 GB free and 8 GB is. It tries again in a minute."
    )
  })
})
