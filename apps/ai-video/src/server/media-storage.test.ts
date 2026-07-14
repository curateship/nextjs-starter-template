import assert from "node:assert/strict"
import { mkdtemp, readFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { Readable } from "node:stream"
import { describe, it } from "node:test"

import { writeBodyToFile } from "./media-storage.ts"

describe("writeBodyToFile", () => {
  it("writes a chunked stored-object body without collecting it first", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "media-storage-test-"))
    const destination = path.join(dir, "video.mp4")

    try {
      const body = Readable.from([
        Buffer.from("first-"),
        Buffer.from("second-"),
        Buffer.from("third"),
      ])

      await writeBodyToFile(body, destination)

      assert.equal((await readFile(destination, "utf8")), "first-second-third")
    } finally {
      await rm(dir, { recursive: true, force: true })
    }
  })
})
