import { beforeEach, describe, expect, it } from "vitest"

import {
  addInboundAddress,
  isInboundAddress,
  listInboundAddresses,
  removeInboundAddress,
  renameInboundAddress,
} from "@/server/crm/addresses"
import { getCrmReplySender } from "@/server/crm/sender"
import { type CustomShellDb } from "@/server/db"
import { getEmailSettings, saveInboundAddress } from "@/server/email/settings"
import { customShellWorkspaces } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * The addresses mail arrives at (CRM task 18, built in task 36), against a
 * real database. The Settings → Email address has to stay the first one on
 * the list through every add and remove, because the reply sender falls back
 * to it.
 */
describe("the addresses mail arrives at", () => {
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
  })

  it("starts empty, and the first address added becomes the Settings → Email one", async () => {
    expect(await listInboundAddresses(workspaceId, db)).toEqual([])
    const added = await addInboundAddress(workspaceId, { address: " Sales@Inbox.Example.com ", label: "Sales" }, db)
    expect(added).toMatchObject({ added: true, address: { address: "sales@inbox.example.com", label: "Sales" } })
    expect((await getEmailSettings(workspaceId, db))?.inboundAddress).toBe("sales@inbox.example.com")
  })

  it("refuses the same address twice, capitals aside, and a string that is not an address", async () => {
    await addInboundAddress(workspaceId, { address: "sales@inbox.example.com" }, db)
    expect(await addInboundAddress(workspaceId, { address: "SALES@inbox.example.com" }, db)).toEqual({
      added: false,
      reason: "taken",
    })
    expect(await addInboundAddress(workspaceId, { address: "not an address" }, db)).toEqual({
      added: false,
      reason: "invalid",
    })
  })

  it("lists a Settings → Email address that has no row yet, first", async () => {
    await saveInboundAddress(workspaceId, "leads@inbox.example.com", db)
    const [first] = await listInboundAddresses(workspaceId, db)
    expect(first?.address).toBe("leads@inbox.example.com")

    // Adding a second keeps that one first, now with a row of its own.
    await addInboundAddress(workspaceId, { address: "support@inbox.example.com" }, db)
    const listed = await listInboundAddresses(workspaceId, db)
    expect(listed.map((row) => row.address)).toEqual(["leads@inbox.example.com", "support@inbox.example.com"])
    expect(listed.every((row) => !row.id.startsWith("settings:"))).toBe(true)
    expect((await getEmailSettings(workspaceId, db))?.inboundAddress).toBe("leads@inbox.example.com")
  })

  it("moves the next address into Settings → Email when the first is removed, and clears it after the last", async () => {
    const first = await addInboundAddress(workspaceId, { address: "sales@inbox.example.com" }, db)
    const second = await addInboundAddress(workspaceId, { address: "support@inbox.example.com" }, db)
    if (!first.added || !second.added) throw new Error("setup")

    expect(await removeInboundAddress(workspaceId, first.address.id, db)).toBe(true)
    expect((await getEmailSettings(workspaceId, db))?.inboundAddress).toBe("support@inbox.example.com")

    expect(await removeInboundAddress(workspaceId, second.address.id, db)).toBe(true)
    expect((await getEmailSettings(workspaceId, db))?.inboundAddress ?? null).toBeNull()
    expect(await listInboundAddresses(workspaceId, db)).toEqual([])
  })

  it("renames, and never touches another workspace's", async () => {
    const added = await addInboundAddress(workspaceId, { address: "sales@inbox.example.com" }, db)
    if (!added.added) throw new Error("setup")
    expect(await renameInboundAddress(otherWorkspaceId, added.address.id, "Theirs", db)).toBe(false)
    expect(await removeInboundAddress(otherWorkspaceId, added.address.id, db)).toBe(false)
    expect(await renameInboundAddress(workspaceId, added.address.id, "Sales team", db)).toBe(true)
    expect((await listInboundAddresses(workspaceId, db))[0]?.label).toBe("Sales team")
    expect(await isInboundAddress(otherWorkspaceId, "sales@inbox.example.com", db)).toBe(false)
  })

  it("replies from a conversation's own address while it is on the list, and from the first one otherwise", async () => {
    await addInboundAddress(workspaceId, { address: "sales@inbox.example.com" }, db)
    await addInboundAddress(workspaceId, { address: "support@inbox.example.com" }, db)

    expect((await getCrmReplySender(workspaceId, db, "Support@Inbox.Example.com"))?.address).toBe(
      "support@inbox.example.com"
    )
    expect((await getCrmReplySender(workspaceId, db, "gone@inbox.example.com"))?.address).toBe(
      "sales@inbox.example.com"
    )
    expect((await getCrmReplySender(workspaceId, db, null))?.address).toBe("sales@inbox.example.com")
  })
})
