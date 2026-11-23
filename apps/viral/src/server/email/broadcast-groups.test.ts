import { beforeEach, describe, expect, it } from "vitest"

import { type CustomShellDb } from "@/server/db"
import { countBroadcastGroups, listWorkspaceBroadcasts } from "@/server/email/broadcasts"
import { customShellBroadcasts, customShellWorkspaces } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * The CRM Broadcasts tab's pills: Drafts, Scheduled and Sent, where Sent
 * holds a send still going or paused too.
 */
describe("the Broadcasts pills", () => {
  let db: CustomShellDb
  const workspaceId = "ws-groups"

  beforeEach(async () => {
    db = (await createTestDatabase()).db as unknown as CustomShellDb
    const owner = await insertUser(db, { email: "owner@example.com" })
    for (const id of [workspaceId, "ws-groups-other"]) {
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
    const base = {
      subject: "Hello",
      blocks: [],
      renderedHtml: "<p>Hello</p>",
      audienceFilter: { kind: "all" },
      totalRecipients: 0,
      createdAt: new Date(),
    }
    const statuses = ["draft", "draft", "scheduled", "sending", "paused", "sent"]
    await db.insert(customShellBroadcasts).values([
      ...statuses.map((status, index) => ({
        ...base,
        id: `bc-${index}`,
        workspaceId,
        name: `Newsletter ${index}`,
        status,
        updatedAt: new Date(Date.UTC(2026, 9, index + 1)),
      })),
      { ...base, id: "bc-other", workspaceId: "ws-groups-other", name: "Not ours", status: "draft", updatedAt: new Date() },
    ])
  })

  it("counts each pill, Sent taking sending and paused too", async () => {
    expect(await countBroadcastGroups(workspaceId, db)).toEqual({ drafts: 2, scheduled: 1, sent: 3 })
  })

  it("lists only the pill's newsletters, newest change first", async () => {
    const sent = await listWorkspaceBroadcasts(workspaceId, { group: "sent" }, db)
    expect(sent.broadcasts.map((row) => row.id)).toEqual(["bc-5", "bc-4", "bc-3"])
    expect(sent.total).toBe(3)
    const drafts = await listWorkspaceBroadcasts(workspaceId, { group: "drafts" }, db)
    expect(drafts.broadcasts.map((row) => row.id)).toEqual(["bc-1", "bc-0"])
  })

  it("lists every status with no pill named", async () => {
    expect((await listWorkspaceBroadcasts(workspaceId, {}, db)).total).toBe(6)
  })
})
