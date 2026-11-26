import { beforeEach, describe, expect, it, vi } from "vitest"

const stored = vi.hoisted(() => new Map<string, { data: Uint8Array; type: string }>())

vi.mock("@/server/media/storage", () => ({
  getPublicMediaUrl: vi.fn(async (key: string) => `https://files.example.com/${key}`),
  getFromR2: vi.fn(async (key: string) => {
    const upload = stored.get(key)
    if (key.startsWith("crm-files/") && !upload) throw new Error("NoSuchKey")
    return {
      ContentType: upload?.type,
      Body: { transformToByteArray: async () => upload?.data ?? new TextEncoder().encode(`bytes of ${key}`) },
    }
  }),
  uploadToR2: vi.fn(async (key: string, data: Uint8Array, type: string) => {
    stored.set(key, { data, type })
  }),
  // Never called here, but an app's own code can read it as it loads (Project's
  // task files do), and a stand-in without it fails before any test runs.
  deleteFromR2: vi.fn(async () => {}),
}))

import {
  CRM_REPLY_FILE_NOT_FOUND,
  CRM_REPLY_FILES_TOO_BIG,
  loadReplyFiles,
  replyUploadPrefix,
  safeUploadName,
  storeReplyUpload,
} from "@/server/crm/reply-files"
import { type CustomShellDb } from "@/server/db"
import { customShellMedia, customShellWorkspaces } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/** Files on a CRM reply (CRM task 22), with storage stood in for. */
describe("files on a reply", () => {
  let db: CustomShellDb
  const workspaceId = "ws-crm"
  const otherWorkspaceId = "ws-other"

  beforeEach(async () => {
    db = (await createTestDatabase()).db as unknown as CustomShellDb
    const owner = await insertUser(db, { email: "owner@example.com" })
    for (const id of [workspaceId, otherWorkspaceId]) {
      await db.insert(customShellWorkspaces).values({
        id,
        userId: owner.id,
        name: id,
        settings: {},
        subdomain: `w-${id}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    }
    const media = (id: string, workspace: string, size: number) => ({
      id,
      workspaceId: workspace,
      userId: owner.id,
      filename: `${id}.png`,
      originalName: `${id} photo.png`,
      fileSize: size,
      mimeType: "image/png",
      fileType: "image",
      storagePath: `media/${id}.png`,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await db.insert(customShellMedia).values([
      media("ours", workspaceId, 2000),
      media("big", workspaceId, 11 * 1024 * 1024),
      media("theirs", otherWorkspaceId, 2000),
    ] as never)
  })

  it("reads this site's file, as base64 to send and as an entry for the bubble", async () => {
    const [file] = await loadReplyFiles(workspaceId, ["https://files.example.com/media/ours.png"], db)
    expect(file?.attachment).toMatchObject({ id: "ours", filename: "ours photo.png", contentType: "image/png" })
    expect(Buffer.from(file?.send.content ?? "", "base64").toString()).toBe("bytes of media/ours.png")
  })

  it("refuses another site's file, and an address that is not the library's", async () => {
    await expect(loadReplyFiles(workspaceId, ["https://files.example.com/media/theirs.png"], db)).rejects.toThrow(
      CRM_REPLY_FILE_NOT_FOUND
    )
    await expect(loadReplyFiles(workspaceId, ["https://elsewhere.example.com/x.pdf"], db)).rejects.toThrow(
      CRM_REPLY_FILE_NOT_FOUND
    )
  })

  it("refuses more than 10 MB in all", async () => {
    await expect(loadReplyFiles(workspaceId, ["https://files.example.com/media/big.png"], db)).rejects.toThrow(
      CRM_REPLY_FILES_TOO_BIG
    )
  })

  it("sends nothing extra when no file is picked", async () => {
    expect(await loadReplyFiles(workspaceId, [], db)).toEqual([])
  })

  /** Files from the computer (CRM task 38, part 3). */
  describe("uploaded from the computer", () => {
    const pdf = (bytes: number) => ({ name: "Quote 42.pdf", type: "application/pdf", data: new Uint8Array(bytes) })

    it("keeps a PDF under the site's own folder and sends it under its name", async () => {
      const kept = await storeReplyUpload(workspaceId, pdf(3000))
      expect(kept.key.startsWith(replyUploadPrefix(workspaceId))).toBe(true)
      expect(kept).toMatchObject({ name: "Quote 42.pdf", size: 3000 })

      const [file] = await loadReplyFiles(workspaceId, [], db, [{ key: kept.key, name: kept.name }])
      expect(file.send).toMatchObject({ filename: "Quote 42.pdf", contentType: "application/pdf" })
      expect(file.attachment).toMatchObject({ filename: "Quote 42.pdf", size: 3000, storageKey: kept.key })
    })

    it("refuses another site's upload, and a key walking out of the folder", async () => {
      const theirs = await storeReplyUpload(otherWorkspaceId, pdf(10))
      await expect(loadReplyFiles(workspaceId, [], db, [{ key: theirs.key, name: "x.pdf" }])).rejects.toThrow(
        CRM_REPLY_FILE_NOT_FOUND
      )
      await expect(
        loadReplyFiles(workspaceId, [], db, [{ key: `${replyUploadPrefix(workspaceId)}../../${theirs.key}`, name: "x" }])
      ).rejects.toThrow(CRM_REPLY_FILE_NOT_FOUND)
    })

    it("sends a file with dots inside its name", async () => {
      const kept = await storeReplyUpload(workspaceId, { ...pdf(10), name: "quote..v2.pdf" })
      const [file] = await loadReplyFiles(workspaceId, [], db, [{ key: kept.key, name: kept.name }])
      expect(file.send.filename).toBe("quote..v2.pdf")
    })

    it("refuses one that is gone", async () => {
      await expect(
        loadReplyFiles(workspaceId, [], db, [{ key: `${replyUploadPrefix(workspaceId)}nope/a.pdf`, name: "a.pdf" }])
      ).rejects.toThrow(CRM_REPLY_FILE_NOT_FOUND)
    })

    it("refuses over 10 MB, alone or with the library's files", async () => {
      await expect(storeReplyUpload(workspaceId, pdf(10 * 1024 * 1024 + 1))).rejects.toThrow(CRM_REPLY_FILES_TOO_BIG)
      const nine = await storeReplyUpload(workspaceId, pdf(9.5 * 1024 * 1024))
      const ten = await storeReplyUpload(workspaceId, pdf(1024 * 1024))
      await expect(
        loadReplyFiles(workspaceId, [], db, [
          { key: nine.key, name: "a.pdf" },
          { key: ten.key, name: "b.pdf" },
        ])
      ).rejects.toThrow(CRM_REPLY_FILES_TOO_BIG)
    })

    it("strips folders and characters a mail header cannot carry from the name", () => {
      expect(safeUploadName("C:\\Users\\me\\quote.pdf")).toBe("quote.pdf")
      expect(safeUploadName('../"evil"\nname.pdf')).toBe("evilname.pdf")
      expect(safeUploadName("   ")).toBe("file")
      expect(safeUploadName("..")).toBe("file")
    })
  })
})
