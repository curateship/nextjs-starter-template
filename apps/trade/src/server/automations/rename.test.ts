import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  createWorkspaceAutomation,
  getWorkspaceAutomation,
  renameWorkspaceAutomation,
  saveWorkspaceAutomation,
} from "@/server/automations/flows"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

/**
 * Renaming a flow from the dashboard, without opening its canvas.
 *
 * The thing worth guarding is what a rename must *not* touch. The obvious way
 * to build this was to call the ordinary save with the same graph passed back
 * in, and that quietly recompiles the flow and recalculates when it next runs —
 * fine when the steps changed, pure risk when only the name did. It also meant
 * the dashboard would have to read the whole graph and write it back, so two
 * people renaming from the list could hand each other stale steps.
 */

let client: PGlite
let database: TestDatabase
let workspaceId: string
let otherWorkspaceId: string
let personId: string

const graph = {
  nodes: [
    {
      id: "n0",
      kind: "placeholder" as const,
      x: 0,
      y: 0,
      settings: { note: "Still here afterwards" },
    },
  ],
  edges: [],
  viewport: { x: 0, y: 0, zoom: 1 },
}

beforeEach(async () => {
  ;({ client, db: database } = await createTestDatabase())
  const person = await insertUser(database, { role: "admin" })
  personId = person.id
  workspaceId = (await insertWorkspace(database, { userId: personId })).id
  otherWorkspaceId = (await insertWorkspace(database, { userId: personId })).id
})

afterEach(async () => {
  await client.close()
})

describe("renaming an automation", () => {
  it("changes the name", async () => {
    const made = await createWorkspaceAutomation(
      workspaceId,
      personId,
      "Old name",
      database
    )

    const renamed = await renameWorkspaceAutomation(
      workspaceId,
      made.id,
      "New name",
      database
    )

    expect(renamed?.name).toBe("New name")
  })

  it("leaves the steps exactly as they were", async () => {
    const made = await createWorkspaceAutomation(
      workspaceId,
      personId,
      "Old name",
      database
    )
    await saveWorkspaceAutomation(
      workspaceId,
      { id: made.id, name: "Old name", graph },
      database
    )
    const before = await getWorkspaceAutomation(workspaceId, made.id, database)

    await renameWorkspaceAutomation(workspaceId, made.id, "New name", database)

    const after = await getWorkspaceAutomation(workspaceId, made.id, database)
    // The whole point: the canvas and the compiled flow are untouched.
    expect(after?.graph).toEqual(before?.graph)
    expect(after?.compiledConfig).toEqual(before?.compiledConfig)
    expect(after?.name).toBe("New name")
  })

  it("trims the name and refuses one that is only spaces", async () => {
    const made = await createWorkspaceAutomation(
      workspaceId,
      personId,
      "Old name",
      database
    )

    const renamed = await renameWorkspaceAutomation(
      workspaceId,
      made.id,
      "  Padded  ",
      database
    )
    expect(renamed?.name).toBe("Padded")

    await expect(
      renameWorkspaceAutomation(workspaceId, made.id, "   ", database)
    ).rejects.toThrow("NAME_REQUIRED")
  })

  it("says so rather than silently taking a name already in use", async () => {
    await createWorkspaceAutomation(workspaceId, personId, "Taken", database)
    const other = await createWorkspaceAutomation(
      workspaceId,
      personId,
      "Mine",
      database
    )

    await expect(
      renameWorkspaceAutomation(workspaceId, other.id, "Taken", database)
    ).rejects.toThrow("NAME_TAKEN")
  })

  it("cannot reach a flow belonging to another site", async () => {
    const theirs = await createWorkspaceAutomation(
      otherWorkspaceId,
      personId,
      "Theirs",
      database
    )

    // Null, not a rename: the filter is on the write, so a wrong workspace
    // matches no row at all.
    await expect(
      renameWorkspaceAutomation(workspaceId, theirs.id, "Stolen", database)
    ).resolves.toBeNull()
    expect(
      (await getWorkspaceAutomation(otherWorkspaceId, theirs.id, database))?.name
    ).toBe("Theirs")
  })
})
