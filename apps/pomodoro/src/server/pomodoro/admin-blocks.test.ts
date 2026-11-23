import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { type CustomShellDb } from "@/server/db"
import { listAdminBlocks, listMostBlocked } from "@/server/pomodoro/admin-blocks"
import { pomodoroBlocks } from "@/server/pomodoro/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/** The read-only blocks lists (admin task 06, part 9), against a real database. */

let client: PGlite
let db: CustomShellDb

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
})

afterEach(async () => {
  await client.close()
})

const page = { page: 1, pageSize: 25 }

async function person(name: string) {
  return (await insertUser(db, { name })).id
}

describe("blocks", () => {
  it("lists who blocked whom, and the most blocked account first with its count", async () => {
    const [troll, other, a, b, c] = await Promise.all(["Troll", "Other", "A", "B", "C"].map(person))
    await db.insert(pomodoroBlocks).values([
      { blockerUserId: a, blockedUserId: troll },
      { blockerUserId: b, blockedUserId: troll },
      { blockerUserId: c, blockedUserId: troll },
      { blockerUserId: a, blockedUserId: other },
    ])

    const every = await listAdminBlocks({ ...page, search: "" })
    expect(every.total).toBe(4)
    const aboutOther = await listAdminBlocks({ ...page, search: "", user: other })
    expect(aboutOther.rows).toEqual([expect.objectContaining({ blockerName: "A", blockedName: "Other" })])

    const most = await listMostBlocked({ ...page, search: "" })
    expect(most.total).toBe(2)
    expect(most.rows.map((row) => [row.name, row.blocks])).toEqual([
      ["Troll", 3],
      ["Other", 1],
    ])
    const searched = await listMostBlocked({ ...page, search: "other" })
    expect(searched.rows.map((row) => row.name)).toEqual(["Other"])
  })
})
