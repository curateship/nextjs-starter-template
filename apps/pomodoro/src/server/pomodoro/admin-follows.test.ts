import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { type CustomShellDb } from "@/server/db"
import {
  deleteAdminCheers,
  deleteAdminFollows,
  listAdminCheers,
  listAdminFollows,
} from "@/server/pomodoro/admin-follows"
import { pomodoroAuditLogs, pomodoroCheers, pomodoroFollows } from "@/server/pomodoro/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/** Follows and cheers in the admin (admin task 06, part 8), against a real database. */

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

async function follow(from: string, to: string, at = new Date()) {
  const [row] = await db
    .insert(pomodoroFollows)
    .values({ followerUserId: from, followedUserId: to, createdAt: at })
    .returning({ id: pomodoroFollows.id })
  return row.id
}

describe("the follows list", () => {
  it("puts the account that follows the most first", async () => {
    const [spammer, quiet, a, b, c] = await Promise.all(
      ["Spammer", "Quiet", "A", "B", "C"].map(person)
    )
    await follow(quiet, a, new Date("2026-10-08T12:00:00Z"))
    for (const target of [a, b, c]) await follow(spammer, target, new Date("2026-10-01T12:00:00Z"))

    const { rows, total } = await listAdminFollows({ ...page, search: "", sort: "most", direction: "desc" })
    expect(total).toBe(4)
    expect(rows[0]).toMatchObject({ followerName: "Spammer", followerFollows: 3 })
    expect(rows.at(-1)).toMatchObject({ followerName: "Quiet", followerFollows: 1 })
  })

  it("finds rows by either person and keeps one member's rows on either side", async () => {
    const [ana, ben, cy] = await Promise.all(["Ana", "Ben", "Cy"].map(person))
    await follow(ana, ben)
    await follow(cy, ana)
    await follow(ben, cy)

    const byName = await listAdminFollows({ ...page, search: "ana", sort: "created", direction: "desc" })
    expect(byName.total).toBe(2)
    const onAna = await listAdminFollows({ ...page, search: "", user: ana, sort: "created", direction: "desc" })
    expect(onAna.rows.map((row) => [row.followerName, row.followedName]).sort()).toEqual([
      ["Ana", "Ben"],
      ["Cy", "Ana"],
    ])
  })
})

describe("deleting", () => {
  it("removes follows, logs once, and reports a row already gone as skipped", async () => {
    const actor = await person("Admin")
    const [ana, ben] = await Promise.all(["Ana", "Ben"].map(person))
    const id = await follow(ana, ben)
    const missing = crypto.randomUUID()

    const result = await deleteAdminFollows({ ids: [id, missing], actorUserId: actor })
    expect(result).toEqual({ deleted: [id], skipped: [missing] })
    expect(await db.select().from(pomodoroFollows)).toHaveLength(0)
    const logs = await db.select().from(pomodoroAuditLogs)
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ action: "delete", resource: "follows", recordIds: [id] })

    // A press that removed nothing writes no log row.
    await deleteAdminFollows({ ids: [id], actorUserId: actor })
    expect(await db.select().from(pomodoroAuditLogs)).toHaveLength(1)
  })

  it("lists and deletes cheers", async () => {
    const actor = await person("Admin")
    const [ana, ben] = await Promise.all(["Ana", "Ben"].map(person))
    const [cheer] = await db
      .insert(pomodoroCheers)
      .values({ fromUserId: ana, toUserId: ben, cheerId: "keep-going" })
      .returning({ id: pomodoroCheers.id })

    const list = await listAdminCheers({ ...page, search: "ben", direction: "desc" })
    expect(list.rows).toEqual([expect.objectContaining({ fromName: "Ana", toName: "Ben", cheerId: "keep-going" })])

    expect(await deleteAdminCheers({ ids: [cheer.id], actorUserId: actor })).toEqual({
      deleted: [cheer.id],
      skipped: [],
    })
    expect(await db.select().from(pomodoroCheers)).toHaveLength(0)
    const [log] = await db.select().from(pomodoroAuditLogs)
    expect(log).toMatchObject({ resource: "cheers", recordIds: [cheer.id] })
  })
})
