import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { startWorkspaceFor as startWorkspaceOnSignIn } from "@/lib/api/auth/auth"
import { now, uuid } from "@/server/auth/security"
import {
  deleteUserWorkspace,
  listUserWorkspaces,
  startWorkspaceFor,
  switchUserWorkspace,
  updateUserWorkspace,
} from "@/server/people/workspaces"
import {
  customShellContacts,
  customShellUsers,
  customShellWorkspaces,
} from "@/server/schema"
import {
  createTestDatabase,
  insertUser,
  type TestDatabase,
} from "@/server/test-support"

/**
 * A workspace holds contacts, segments, broadcasts and email settings, and used
 * to be deleted along with the account that made it — through a cascade nothing
 * in the code mentioned. These are the tests that keep it standing.
 */

let client: PGlite
let database: TestDatabase

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
})

afterEach(async () => {
  await client.close()
})

/** Deletes the account row outright, which is what the purge sweep does. */
async function deleteAccount(userId: string) {
  await database.delete(customShellUsers).where(eq(customShellUsers.id, userId))
}

async function addContact(workspaceId: string) {
  const timestamp = now()
  await database.insert(customShellContacts).values({
    id: uuid(),
    workspaceId,
    email: `${uuid()}@example.test`,
    status: "subscribed",
    createdAt: timestamp,
    updatedAt: timestamp,
  })
}

describe("workspaces are for admins", () => {
  it("makes none when a member signs in", async () => {
    // Every sign-in used to make one for everybody. A member never sees the
    // switcher, so seven empty ones sat in the shell's own database unnoticed.
    const member = await insertUser(database, { role: "member" })
    await startWorkspaceOnSignIn(member)

    const [row] = await database
      .select()
      .from(customShellWorkspaces)
      .where(eq(customShellWorkspaces.userId, member.id))
    expect(row).toBeUndefined()
  })

  it("still makes one when an admin signs in", async () => {
    const admin = await insertUser(database, { role: "admin" })
    await startWorkspaceOnSignIn(admin)

    const [row] = await database
      .select()
      .from(customShellWorkspaces)
      .where(eq(customShellWorkspaces.userId, admin.id))
    expect(row).toBeDefined()
  })
})

describe("a workspace outlives the person who made it", () => {
  it("keeps the workspace when the account goes", async () => {
    const owner = await insertUser(database, { role: "admin" })
    const workspace = await startWorkspaceFor(owner.id, database)

    await deleteAccount(owner.id)

    const [row] = await database
      .select()
      .from(customShellWorkspaces)
      .where(eq(customShellWorkspaces.id, workspace.id))

    expect(row).toBeDefined()
    expect(row.userId).toBeNull()
  })

  it("keeps what was inside it", async () => {
    // This is the regression that matters. The workspace cascaded, and contacts
    // cascade from the workspace — so deleting one account quietly emptied a
    // newsletter estate that had nothing to do with that person.
    const owner = await insertUser(database, { role: "admin" })
    const workspace = await startWorkspaceFor(owner.id, database)
    await addContact(workspace.id)

    await deleteAccount(owner.id)

    const contacts = await database
      .select()
      .from(customShellContacts)
      .where(eq(customShellContacts.workspaceId, workspace.id))

    expect(contacts).toHaveLength(1)
  })
})

describe("a workspace nobody owns", () => {
  it("is kept out of everybody's list for now, on purpose", async () => {
    // Every reader of this list is reachable by a plain member — the list
    // endpoint is `userGet`, the delete pair is `userPost`, and `/workspaces`
    // has no admin check. Listing an ownerless workspace here would therefore
    // let any signed-in member see it and delete it, taking its contacts,
    // segments and broadcasts with it. So it stays kept-but-unreachable until
    // the task that makes any *admin* able to see any workspace, which is where
    // that check gets made.
    const leaver = await insertUser(database, { role: "admin" })
    const orphan = await startWorkspaceFor(leaver.id, database)
    await deleteAccount(leaver.id)

    const staying = await insertUser(database, { role: "admin" })
    await startWorkspaceFor(staying.id, database)

    const listed = await listUserWorkspaces(staying.id, database)
    expect(listed.workspaces.map((row) => row.id)).not.toContain(orphan.id)

    // Kept, though — which is the whole point of the change.
    const [row] = await database
      .select()
      .from(customShellWorkspaces)
      .where(eq(customShellWorkspaces.id, orphan.id))
    expect(row).toBeDefined()
  })

  it("cannot be deleted by somebody who never owned it", async () => {
    const leaver = await insertUser(database, { role: "admin" })
    const orphan = await startWorkspaceFor(leaver.id, database)
    await deleteAccount(leaver.id)

    const member = await insertUser(database, { role: "member" })
    await startWorkspaceFor(member.id, database)

    await expect(
      deleteUserWorkspace(member.id, orphan.id, database)
    ).rejects.toThrow("Workspace not found")
  })

  it("cannot be switched into by a member who was handed its id", async () => {
    // Switching is a `userPost` endpoint, so a plain member reaches it. Without
    // a check here, anybody signed in could point themselves at any workspace
    // by id and read its name, icon and styling through the shell settings.
    const admin = await insertUser(database, { role: "admin" })
    const theirs = await startWorkspaceFor(admin.id, database)

    const member = await insertUser(database, { role: "member" })
    await startWorkspaceFor(member.id, database)

    await expect(
      switchUserWorkspace(member.id, theirs.id, database)
    ).rejects.toThrow("Workspace not found")
  })

  it("can be switched into by an admin, who may reach any workspace", async () => {
    const other = await insertUser(database, { role: "admin" })
    const theirs = await startWorkspaceFor(other.id, database)

    const admin = await insertUser(database, { role: "admin" })
    await startWorkspaceFor(admin.id, database)

    await switchUserWorkspace(admin.id, theirs.id, database, {
      seesEveryWorkspace: true,
    })

    const listed = await listUserWorkspaces(admin.id, database, {
      seesEveryWorkspace: true,
    })
    expect(listed.currentWorkspaceId).toBe(theirs.id)
  })

  it("lets an admin edit a workspace they can see but did not make", async () => {
    // The list widened for admins before the writes did, so an admin could see
    // and switch into a workspace and then be told "Workspace not found" when
    // they tried to rename it.
    const other = await insertUser(database, { role: "admin" })
    const theirs = await startWorkspaceFor(other.id, database)

    const admin = await insertUser(database, { role: "admin" })

    const saved = await updateUserWorkspace(
      admin.id,
      theirs.id,
      { name: "Renamed by another admin", settings: {} },
      database,
      { seesEveryWorkspace: true }
    )
    expect(saved.name).toBe("Renamed by another admin")
  })

  it("still leaves somebody else's workspace alone", async () => {
    const other = await insertUser(database, { role: "admin" })
    const theirs = await startWorkspaceFor(other.id, database)

    const staying = await insertUser(database, { role: "admin" })
    await startWorkspaceFor(staying.id, database)

    const listed = await listUserWorkspaces(staying.id, database)
    expect(listed.workspaces.map((row) => row.id)).not.toContain(theirs.id)

    await expect(
      deleteUserWorkspace(staying.id, theirs.id, database)
    ).rejects.toThrow("Workspace not found")
  })
})
