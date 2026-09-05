import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { automationExecutors } from "@/server/automations/executors"
import { type CustomShellDb } from "@/server/db"
import {
  customShellMemberTags,
  customShellUsers,
  type CustomShellAutomationRun,
} from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  changeMemberTag,
  listMemberTags,
  replaceMemberTags,
} from "@/server/people/member-tags"
import { MEMBER_TAG_LIMIT, MEMBER_TAG_MAX_LENGTH } from "@/lib/member-tags"

let client: PGlite
let db: CustomShellDb

beforeEach(async () => {
  const created = await createTestDatabase()
  client = created.client
  db = created.db
})

afterEach(async () => {
  await client.close()
})

describe("member tags", () => {
  it("normalizes, sorts and deduplicates manual edits", async () => {
    const user = await insertUser(db)
    await expect(
      replaceMemberTags(user.id, [" Beta ", "vip", "BETA", ""], db)
    ).resolves.toEqual(["beta", "vip"])
    await expect(listMemberTags([user.id], db)).resolves.toEqual(
      new Map([[user.id, ["beta", "vip"]]])
    )
  })

  it("adds and removes idempotently", async () => {
    const user = await insertUser(db)
    await expect(changeMemberTag(user.id, "add", "Beta", db)).resolves.toBe(
      "added"
    )
    await expect(changeMemberTag(user.id, "add", "beta", db)).resolves.toBe(
      "unchanged"
    )
    await expect(
      changeMemberTag(user.id, "remove", "missing", db)
    ).resolves.toBe("unchanged")
    await expect(changeMemberTag(user.id, "remove", "BETA", db)).resolves.toBe(
      "removed"
    )
  })

  it("refuses too many tags and tags that are too long", async () => {
    const user = await insertUser(db)
    await expect(
      replaceMemberTags(
        user.id,
        Array.from({ length: MEMBER_TAG_LIMIT + 1 }, (_, index) => `tag-${index}`),
        db
      )
    ).rejects.toThrow("MEMBER_TAG_LIMIT")
    await expect(
      replaceMemberTags(user.id, ["x".repeat(MEMBER_TAG_MAX_LENGTH + 1)], db)
    ).rejects.toThrow("MEMBER_TAG_TOO_LONG")
    await expect(replaceMemberTags(user.id, ["beta,vip"], db)).rejects.toThrow(
      "MEMBER_TAG_INVALID"
    )

    await replaceMemberTags(
      user.id,
      Array.from({ length: MEMBER_TAG_LIMIT }, (_, index) => `tag-${index}`),
      db
    )
    await expect(
      changeMemberTag(user.id, "add", "one-too-many", db)
    ).rejects.toThrow("MEMBER_TAG_LIMIT")
  })

  it("removes tags when the account is deleted", async () => {
    const user = await insertUser(db)
    await changeMemberTag(user.id, "add", "beta", db)
    await db.delete(customShellUsers)
    await expect(db.select().from(customShellMemberTags)).resolves.toEqual([])
    await expect(
      changeMemberTag(user.id, "remove", "beta", db)
    ).rejects.toThrow("USER_NOT_FOUND")
  })

  it("records real and no-effect flow changes without changing test runs", async () => {
    const user = await insertUser(db, { name: "Sam Member" })
    const run = {
      subjectUserId: user.id,
      subjectLabel: "Sam Member",
    } as CustomShellAutomationRun
    const execute = automationExecutors.memberTag
    const context = {
      database: db,
      run,
      nodeId: "tag-1",
      settings: { mode: "add", tag: "beta" },
      now: () => new Date(),
    }

    await expect(execute(context)).resolves.toMatchObject({
      summary: "Tagged Sam Member with 'beta'.",
    })
    await expect(execute(context)).resolves.toMatchObject({
      summary: "Sam Member already had the 'beta' tag. Nothing changed.",
    })
    await expect(
      execute({
        ...context,
        settings: { mode: "add", tag: "vip" },
        testRun: true,
      })
    ).resolves.toMatchObject({
      summary: expect.stringContaining("No tag was changed"),
    })
    await expect(listMemberTags([user.id], db)).resolves.toEqual(
      new Map([[user.id, ["beta"]]])
    )
  })
})
