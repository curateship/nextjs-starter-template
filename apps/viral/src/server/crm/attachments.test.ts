import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const uploads: string[] = []
let storageMissing = false
vi.mock("@/server/media/storage", async () => {
  class R2StorageNotConfiguredError extends Error {}
  return {
    R2StorageNotConfiguredError,
    uploadToR2: vi.fn(async (key: string) => {
      if (storageMissing) throw new R2StorageNotConfiguredError("no storage")
      uploads.push(key)
    }),
  }
})

import { fetchMessageFiles, safeFileName } from "@/server/crm/attachments"
import { type CustomShellDb } from "@/server/db"
import { setEmailProviderFactoryForTests, type ReceivedFile } from "@/server/email/provider"
import {
  customShellCrmLeads,
  customShellCrmMessages,
  customShellCrmThreads,
  customShellWorkspaces,
} from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/** Fetching the files they send (CRM task 21), with Resend and storage stood in for. */
describe("fetching the files they send", () => {
  let db: CustomShellDb
  let listed: ReceivedFile[] | null
  const workspaceId = "ws-crm"

  beforeEach(async () => {
    uploads.length = 0
    storageMissing = false
    listed = []
    db = (await createTestDatabase()).db as unknown as CustomShellDb
    const owner = await insertUser(db, { email: "owner@example.com" })
    await db.insert(customShellWorkspaces).values({
      id: workspaceId,
      userId: owner.id,
      name: workspaceId,
      settings: {},
      subdomain: `w-${workspaceId}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await db.insert(customShellCrmLeads).values({ id: "lead-1", workspaceId, email: "jane@example.com", stage: "new", createdAt: new Date(), updatedAt: new Date() })
    await db.insert(customShellCrmThreads).values({
      id: "thread-1",
      workspaceId,
      leadId: "lead-1",
      subject: "Plans",
      subjectKey: "plans",
      status: "open",
      lastMessageAt: new Date(),
      lastDirection: "in",
      messageCount: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    await db.insert(customShellCrmMessages).values({
      id: "m-1",
      workspaceId,
      threadId: "thread-1",
      direction: "in",
      fromEmail: "jane@example.com",
      toEmail: "leads@inbox.example.com",
      subject: "Plans",
      providerEmailId: "re_abc",
      attachments: [
        { id: "a-1", filename: "plan.pdf", contentType: "application/pdf", size: null },
        { id: "a-2", filename: "huge.mov", contentType: "video/quicktime", size: null },
      ],
      bodyFetchedAt: new Date(),
      bodyAttempts: 0,
      occurredAt: new Date(),
      createdAt: new Date(),
    })
    setEmailProviderFactoryForTests(() => ({
      send: async () => ({ success: true, messageId: "x" }),
      receiveFiles: async () =>
        listed ? { success: true, files: listed } : { success: false, error: "Resend is down" },
    }))
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new TextEncoder().encode("PDF bytes"), { status: 200 }))
    )
  })

  afterEach(() => {
    setEmailProviderFactoryForTests(null)
    vi.unstubAllGlobals()
  })

  const message = async () => (await db.select().from(customShellCrmMessages).where(eq(customShellCrmMessages.id, "m-1")))[0]

  it("stores a file under the CRM's own path with its real size, and names one too big without fetching it", async () => {
    listed = [
      { id: "a-1", filename: "plan.pdf", contentType: "application/pdf", size: 9, downloadUrl: "https://files.resend.dev/a-1" },
      { id: "a-2", filename: "huge.mov", contentType: "video/quicktime", size: 40 * 1024 * 1024, downloadUrl: "https://files.resend.dev/a-2" },
    ]
    expect(await fetchMessageFiles(workspaceId, "m-1", db)).toBe("fetched")
    const row = await message()
    expect(row?.filesFetchedAt).toBeInstanceOf(Date)
    expect(row?.attachments[0]?.storageKey).toMatch(/^crm-files\/ws-crm\/m-1\/.+-plan\.pdf$/)
    expect(row?.attachments[0]?.size).toBe(9)
    expect(row?.attachments[1]).toMatchObject({ tooBig: true })
    expect(uploads).toHaveLength(1)
  })

  it("tries again next pass, and gives up after five tries", async () => {
    listed = null
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      expect(await fetchMessageFiles(workspaceId, "m-1", db)).toBe("failed")
    }
    // Resend refusing counts a try each time but never marks it done itself.
    expect((await message())?.fileAttempts).toBe(5)
  })

  it("counts no try and changes nothing when the site has no storage", async () => {
    listed = [{ id: "a-1", filename: "plan.pdf", contentType: "application/pdf", size: 9, downloadUrl: "https://files.resend.dev/a-1" }]
    storageMissing = true
    expect(await fetchMessageFiles(workspaceId, "m-1", db)).toBe("no-storage")
    const row = await message()
    expect(row?.fileAttempts).toBe(0)
    expect(row?.filesFetchedAt).toBeNull()
  })

  it("never touches another workspace's message", async () => {
    expect(await fetchMessageFiles("ws-other", "m-1", db)).toBe("nothing")
  })

  it("makes a name safe for a storage key", () => {
    expect(safeFileName("../../etc/passwd")).toBe("....etcpasswd")
    expect(safeFileName("a\u0000b\nc.pdf")).toBe("abc.pdf")
    expect(safeFileName("   ")).toBe("file")
  })
})
