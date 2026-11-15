import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { FLOW_SECTIONS_NODE } from "@/lib/video/flow/flow-page"
import { type CustomShellDb } from "@/server/db"
import type { CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

import { FLOW_PAGE_LOCKED, getFlowPage, saveFlowPageBody, setFlowPageLock, setFlowPageSections } from "./page"

let client: PGlite
let database: CustomShellDb
let user: CustomShellUser

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  user = await insertUser(database)
})

afterEach(async () => {
  await client.close()
})

const blockTypes = (body: string) => (JSON.parse(body) as { content: { type: string }[] }).content.map((node) => node.type)

describe("the Flow dashboard's left page", () => {
  it("starts with the Dashboards block, and keeps it when a save leaves it out", async () => {
    expect(blockTypes((await getFlowPage(user.id, database)).body)[0]).toBe(FLOW_SECTIONS_NODE)
    await saveFlowPageBody(
      user.id,
      JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Ideas" }] }] }),
      database
    )
    const types = blockTypes((await getFlowPage(user.id, database)).body)
    expect(types.filter((type) => type === FLOW_SECTIONS_NODE)).toHaveLength(1)
    expect(types).toContain("paragraph")
  })

  it("refuses a save while locked", async () => {
    await setFlowPageLock(user.id, true, database)
    await expect(saveFlowPageBody(user.id, JSON.stringify({ type: "doc", content: [] }), database)).rejects.toThrow(
      FLOW_PAGE_LOCKED
    )
  })

  it("keeps only real sections hidden and in order, and only on the person's own page", async () => {
    const other = await insertUser(database, { email: "other@example.com" })
    await setFlowPageSections(user.id, { hiddenSections: ["runs", "nope", "runs"], sectionOrder: ["runs", "flows"] }, database)
    const page = await getFlowPage(user.id, database)
    expect(page.hiddenSections).toEqual(["runs"])
    expect(page.sectionOrder).toEqual(["runs", "flows"])
    expect((await getFlowPage(other.id, database)).hiddenSections).toEqual([])
  })
})
