import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/server/media/storage", () => ({
  getPublicMediaUrl: vi.fn(async (key: string) => `https://files.example.com/${key}`),
  getFromR2: vi.fn(async (key: string) => ({
    Body: { transformToByteArray: async () => new TextEncoder().encode(`bytes of ${key}`) },
  })),
}))

import {
  CRM_REPLY_FILE_NOT_FOUND,
  CRM_REPLY_FILES_TOO_BIG,
  loadReplyFiles,
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
})
