import { mkdtemp, open, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// The bucket, faked: every command it is sent is kept, and a piece's body is
// measured and dropped, the way R2 would take it.
const bucket = vi.hoisted(() => ({
  sent: [] as { name: string; input: Record<string, unknown> }[],
  pieces: new Map<number, number>(),
  failPiece: null as number | null,
}))

vi.mock("@/server/media/storage-settings", () => {
  const field = (value: string) => ({ value, source: "settings", unreadable: false })
  return {
    getStorageConfig: async () => ({
      accountId: field("account"),
      accessKeyId: field("key"),
      secretAccessKey: field("secret"),
      bucketName: field("bucket"),
      publicUrl: field("https://media.example.test"),
    }),
    STORAGE_FIELD_LABEL: {},
  }
})

vi.mock("@aws-sdk/client-s3", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@aws-sdk/client-s3")>()
  class FakeClient {
    async send(command: { constructor: { name: string }; input: Record<string, unknown> }) {
      const name = command.constructor.name
      bucket.sent.push({ name, input: { ...command.input, Body: undefined } })
      if (name === "CreateMultipartUploadCommand") return { UploadId: "upload-1" }
      if (name === "UploadPartCommand") {
        const partNumber = command.input.PartNumber as number
        if (partNumber === bucket.failPiece) throw new Error("piece refused")
        const body = command.input.Body as Uint8Array
        bucket.pieces.set(partNumber, body.byteLength)
        return { ETag: `"etag-${partNumber}"` }
      }
      return {}
    }
  }
  return { ...actual, S3Client: FakeClient }
})

import { uploadFileToR2 } from "@/server/media/storage"
import { videoUploadPartBytes } from "@/lib/media/media-upload"

const MB = 1024 * 1024
const GB = 1024 * MB

let dir: string

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "disk-upload-"))
  bucket.sent = []
  bucket.pieces = new Map()
  bucket.failPiece = null
})

afterEach(async () => {
  await rm(dir, { recursive: true, force: true })
})

/** A file of this size that takes no room on disk: it reads as zeros. */
async function emptyFileOf(size: number) {
  const file = path.join(dir, "big.mp4")
  const handle = await open(file, "w")
  await handle.truncate(size)
  await handle.close()
  return file
}

describe("sending a file from disk to the bucket", () => {
  it("sends a 3GB file in pieces without holding it in memory", async () => {
    const size = 3 * GB
    const file = await emptyFileOf(size)
    const before = process.memoryUsage().rss
    let highest = before
    const watch = setInterval(() => {
      highest = Math.max(highest, process.memoryUsage().rss)
    }, 20)

    try {
      await uploadFileToR2("video/exports/u/job.mp4", file, "video/mp4")
    } finally {
      clearInterval(watch)
    }

    const partBytes = videoUploadPartBytes(size)
    expect(bucket.pieces.size).toBe(Math.ceil(size / partBytes))
    const total = [...bucket.pieces.values()].reduce((sum, bytes) => sum + bytes, 0)
    expect(total).toBe(size)
    const joined = bucket.sent.find((command) => command.name === "CompleteMultipartUploadCommand")
    expect(
      (joined?.input.MultipartUpload as { Parts: unknown[] }).Parts
    ).toHaveLength(bucket.pieces.size)
    // Well under 1GB more than before: four 10MB pieces at a time, not 3GB.
    expect(highest - before).toBeLessThan(500 * MB)
  }, 120_000)

  it("sends a small file in one request", async () => {
    const file = path.join(dir, "cover.jpg")
    await writeFile(file, Buffer.from("small"))
    await uploadFileToR2("video/export-covers/u/job.jpg", file, "image/jpeg")
    expect(bucket.sent.map((command) => command.name)).toEqual(["PutObjectCommand"])
  })

  it("throws away the pieces already sent when one keeps failing", async () => {
    const file = await emptyFileOf(35 * MB)
    bucket.failPiece = 2
    await expect(
      uploadFileToR2("video/proxies/u/m/lease.mp4", file, "video/mp4")
    ).rejects.toThrow("piece refused")
    const names = bucket.sent.map((command) => command.name)
    expect(names).toContain("AbortMultipartUploadCommand")
    expect(names).not.toContain("CompleteMultipartUploadCommand")
    // Three tries at the failing piece before giving up.
    expect(
      bucket.sent.filter(
        (command) =>
          command.name === "UploadPartCommand" && command.input.PartNumber === 2
      )
    ).toHaveLength(3)
  })
})
