import { rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
  deleteMediaObject,
  getMediaObject,
  mediaObjectExists,
  putMediaObject,
} from "@/server/pomoder-media"

// With no R2 env configured (the case in local dev and CI), media reads/writes
// fall back to local disk. These tests exercise that fallback end to end.
const storageDir = path.join(tmpdir(), `pomoder-media-test-${crypto.randomUUID()}`)

beforeAll(() => {
  process.env.POMODER_LOCAL_STORAGE_DIR = storageDir
})

afterAll(async () => {
  delete process.env.POMODER_LOCAL_STORAGE_DIR
  await rm(storageDir, { recursive: true, force: true })
})

describe("local media storage fallback", () => {
  const key = "users/abc/1234/original.png"
  const bytes = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])

  it("round-trips a full object and reports existence", async () => {
    expect(await mediaObjectExists(key)).toBe(false)
    await putMediaObject(key, bytes, "image/png")
    expect(await mediaObjectExists(key)).toBe(true)

    const object = await getMediaObject(key, null)
    expect(object.ContentLength).toBe(10)
    expect(object.ContentRange).toBeUndefined()
    expect(await object.Body!.transformToByteArray()).toEqual(bytes)
  })

  it("serves byte ranges for streaming playback", async () => {
    await putMediaObject(key, bytes, "image/png")
    const object = await getMediaObject(key, "bytes=2-5")
    expect(object.ContentLength).toBe(4)
    expect(object.ContentRange).toBe("bytes 2-5/10")
    expect(await object.Body!.transformToByteArray()).toEqual(bytes.subarray(2, 6))

    // An open-ended range returns through the end of the file.
    const openEnded = await getMediaObject(key, "bytes=8-")
    expect(openEnded.ContentRange).toBe("bytes 8-9/10")
    expect(await openEnded.Body!.transformToByteArray()).toEqual(bytes.subarray(8))

    // A suffix range returns the last N bytes, not the first N.
    const suffix = await getMediaObject(key, "bytes=-3")
    expect(suffix.ContentRange).toBe("bytes 7-9/10")
    expect(await suffix.Body!.transformToByteArray()).toEqual(bytes.subarray(7))
  })

  it("deletes objects and rejects keys that escape the storage root", async () => {
    await putMediaObject(key, bytes, "image/png")
    await deleteMediaObject(key)
    expect(await mediaObjectExists(key)).toBe(false)
    // Deleting a missing object is a no-op, not an error.
    await expect(deleteMediaObject(key)).resolves.toBeUndefined()

    await expect(putMediaObject("../escape.png", bytes, "image/png")).rejects.toThrow("INVALID_STORAGE_KEY")
    await expect(getMediaObject("users/../../etc/passwd", null)).rejects.toThrow("INVALID_STORAGE_KEY")
  })
})
