import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const storage = vi.hoisted(() => ({
  object: { size: 0, contentType: "" },
  firstBytes: new Uint8Array(),
}))

vi.mock("@/server/media/storage", () => ({
  abortMultipartUpload: vi.fn(async () => undefined),
  completeMultipartUpload: vi.fn(async () => undefined),
  deleteFromR2: vi.fn(async () => undefined),
  describeR2Object: vi.fn(async () => storage.object),
  getFromR2: vi.fn(async () => ({
    Body: { transformToByteArray: async () => storage.firstBytes },
  })),
  getPublicMediaUrl: async (path: string) => `https://media.example.test/${path}`,
  signUploadPart: vi.fn(
    async (path: string, _uploadId: string, partNumber: number) =>
      `https://bucket.example.test/${path}?partNumber=${partNumber}`
  ),
  startMultipartUpload: vi.fn(async () => "upload-1"),
  R2StorageNotConfiguredError: class extends Error {},
}))

import {
  VIDEO_MAX_BYTES,
  VIDEO_UPLOAD_MAX_PARTS,
  VIDEO_UPLOAD_PART_BYTES,
} from "@/lib/media/media-upload"
import {
  abortMultipartUpload,
  completeMultipartUpload,
  deleteFromR2,
  signUploadPart,
  startMultipartUpload,
} from "@/server/media/storage"
import {
  cancelVideoUpload,
  finishVideoUpload,
  signVideoUploadPart,
  startVideoUpload,
} from "@/server/media/video-upload"
import { customShellMedia } from "@/server/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

// An MP4 begins with a size and then "ftyp".
const MP4_START = new Uint8Array([0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70])
const GB = 1024 * 1024 * 1024

let client: PGlite
let database: TestDatabase

beforeEach(async () => {
  const testDatabase = await createTestDatabase()
  client = testDatabase.client
  database = testDatabase.db
  storage.object = { size: 2 * GB, contentType: "video/mp4" }
  storage.firstBytes = MP4_START
  vi.clearAllMocks()
})

afterEach(async () => {
  await client.close()
})

async function finish(userId: string, storagePath: string) {
  const workspace = await insertWorkspace(database)
  return finishVideoUpload(
    {
      userId,
      workspaceId: workspace.id,
      storagePath,
      uploadId: "upload-1",
      parts: [{ partNumber: 1, etag: '"abc"' }],
      originalName: "beach 4k.mp4",
      altText: "  The beach  ",
    },
    database
  )
}

describe("starting a video upload", () => {
  it("opens an upload under the person's own folder and says how to cut the file", async () => {
    const ticket = await startVideoUpload({
      userId: "user-1",
      name: "clip.mov",
      mimeType: "video/quicktime",
      size: 25 * 1024 * 1024,
    })

    expect(ticket.storagePath).toMatch(/^user-1\/[0-9a-f-]+_clip\.mov$/)
    expect(ticket).toMatchObject({
      uploadId: "upload-1",
      partBytes: 10 * 1024 * 1024,
      partCount: 3,
    })
    expect(startMultipartUpload).toHaveBeenCalledWith(
      ticket.storagePath,
      "video/quicktime"
    )
  })

  it("takes a file of exactly the ceiling and refuses one byte more", async () => {
    await expect(
      startVideoUpload({
        userId: "user-1",
        name: "big.mp4",
        mimeType: "video/mp4",
        size: VIDEO_MAX_BYTES,
      })
    ).resolves.toMatchObject({ partCount: VIDEO_UPLOAD_MAX_PARTS })

    await expect(
      startVideoUpload({
        userId: "user-1",
        name: "big.mp4",
        mimeType: "video/mp4",
        size: VIDEO_MAX_BYTES + 1,
      })
    ).rejects.toThrow("Maximum size is 5GB")
  })

  it("hides the bucket's own wording when it will not open the upload", async () => {
    vi.mocked(startMultipartUpload).mockRejectedValueOnce(
      new Error("The AWS Access Key Id you provided does not exist")
    )
    await expect(
      startVideoUpload({ userId: "u", name: "a.mp4", mimeType: "video/mp4", size: 10 })
    ).rejects.toThrow(/^Upload failed$/)
  })

  it("refuses anything that is not a video, and an empty file", async () => {
    await expect(
      startVideoUpload({ userId: "u", name: "a.png", mimeType: "image/png", size: 10 })
    ).rejects.toThrow("Only videos upload in pieces.")
    await expect(
      startVideoUpload({ userId: "u", name: "a.mp4", mimeType: "video/mp4", size: 0 })
    ).rejects.toThrow("File is empty")
    expect(startMultipartUpload).not.toHaveBeenCalled()
  })
})

describe("signing pieces", () => {
  it("signs the piece asked for, for exactly its size", async () => {
    const url = await signVideoUploadPart({
      userId: "user-1",
      storagePath: "user-1/x_clip.mp4",
      uploadId: "upload-1",
      partNumber: 2,
      size: VIDEO_UPLOAD_PART_BYTES,
    })
    expect(url).toBe("https://bucket.example.test/user-1/x_clip.mp4?partNumber=2")
    expect(signUploadPart).toHaveBeenCalledWith(
      "user-1/x_clip.mp4",
      "upload-1",
      2,
      VIDEO_UPLOAD_PART_BYTES
    )
  })

  it("refuses a piece bigger than a piece, or with nothing in it", async () => {
    const base = {
      userId: "user-1",
      storagePath: "user-1/x_clip.mp4",
      uploadId: "upload-1",
      partNumber: 1,
    }
    await expect(
      signVideoUploadPart({ ...base, size: VIDEO_UPLOAD_PART_BYTES + 1 })
    ).rejects.toThrow("Upload piece out of range")
    await expect(signVideoUploadPart({ ...base, size: 0 })).rejects.toThrow(
      "Upload piece out of range"
    )
  })

  it("refuses somebody else's upload, a deeper folder and a piece out of range", async () => {
    const base = { userId: "user-1", uploadId: "upload-1", partNumber: 1, size: 10 }
    await expect(
      signVideoUploadPart({ ...base, storagePath: "user-2/x_clip.mp4" })
    ).rejects.toThrow("Upload not found")
    await expect(
      signVideoUploadPart({ ...base, storagePath: "user-1/favicons/x.png" })
    ).rejects.toThrow("Upload not found")
    await expect(
      signVideoUploadPart({
        ...base,
        storagePath: "user-1/x_clip.mp4",
        partNumber: VIDEO_UPLOAD_MAX_PARTS + 1,
      })
    ).rejects.toThrow("Upload piece out of range")
  })
})

describe("finishing a video upload", () => {
  it("joins the pieces and adds a row with the size and type the bucket reports", async () => {
    const owner = await insertUser(database)
    const storagePath = `${owner.id}/abc_beach-4k.mp4`

    const item = await finish(owner.id, storagePath)

    expect(completeMultipartUpload).toHaveBeenCalledWith(storagePath, "upload-1", [
      { partNumber: 1, etag: '"abc"' },
    ])
    expect(item).toMatchObject({
      filename: "abc_beach-4k.mp4",
      original_name: "beach 4k.mp4",
      alt_text: "The beach",
      file_size: 2 * GB,
      mime_type: "video/mp4",
      file_type: "video",
    })
    expect(deleteFromR2).not.toHaveBeenCalled()
  })

  it("deletes the joined file and adds no row when its first bytes are not a video", async () => {
    const owner = await insertUser(database)
    storage.firstBytes = new TextEncoder().encode("<html>not a video")

    await expect(finish(owner.id, `${owner.id}/abc_fake.mp4`)).rejects.toThrow(
      "File content does not match"
    )
    expect(deleteFromR2).toHaveBeenCalledWith(`${owner.id}/abc_fake.mp4`)
    expect(await database.select().from(customShellMedia)).toEqual([])
  })

  it("deletes a joined file that came out bigger than the ceiling", async () => {
    const owner = await insertUser(database)
    storage.object = { size: VIDEO_MAX_BYTES + 1, contentType: "video/mp4" }

    await expect(finish(owner.id, `${owner.id}/abc_big.mp4`)).rejects.toThrow(
      "Maximum size is 5GB"
    )
    expect(deleteFromR2).toHaveBeenCalledWith(`${owner.id}/abc_big.mp4`)
    expect(await database.select().from(customShellMedia)).toEqual([])
  })

  it("deletes the joined file when the row will not save", async () => {
    // No such user, so the row's owner reference fails.
    await expect(finish("missing-user", "missing-user/abc_clip.mp4")).rejects.toThrow()
    expect(deleteFromR2).toHaveBeenCalledWith("missing-user/abc_clip.mp4")
  })

  it("touches nothing when the pieces cannot be joined", async () => {
    const owner = await insertUser(database)
    vi.mocked(completeMultipartUpload).mockRejectedValueOnce(new Error("NoSuchUpload"))

    await expect(finish(owner.id, `${owner.id}/abc_clip.mp4`)).rejects.toThrow(
      "NoSuchUpload"
    )
    expect(deleteFromR2).not.toHaveBeenCalled()
  })
})

describe("cancelling a video upload", () => {
  it("throws the pieces away, and only for the person's own upload", async () => {
    await cancelVideoUpload({
      userId: "user-1",
      storagePath: "user-1/x_clip.mp4",
      uploadId: "upload-1",
    })
    expect(abortMultipartUpload).toHaveBeenCalledWith("user-1/x_clip.mp4", "upload-1")

    await expect(
      cancelVideoUpload({
        userId: "user-1",
        storagePath: "user-2/x_clip.mp4",
        uploadId: "upload-1",
      })
    ).rejects.toThrow("Upload not found")
  })
})
