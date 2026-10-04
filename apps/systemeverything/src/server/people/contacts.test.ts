import type { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import type { SegmentCondition } from "@/lib/contacts/contact-segments"
import { createWorkspaceSegment } from "@/server/people/contact-segments"
import {
  deleteWorkspaceContactsMatching,
  listWorkspaceContacts,
} from "@/server/people/contacts"
import { type CustomShellDb } from "@/server/db"
import {
  customShellContacts,
  customShellDeliveries,
  customShellWorkspaces,
} from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * The contacts list's filters.
 *
 * They are written in exactly the rules a segment is and go through the same
 * `segmentConditions`, so the whole point of these checks is that the list and
 * a segment made from it can never mean two different things.
 */

const WORKSPACE_ID = "ws-contacts"
const OTHER_WORKSPACE_ID = "ws-elsewhere"

let client: PGlite
let db: CustomShellDb

const TODAY = new Date("2026-08-05T12:00:00Z")

function daysAgo(days: number) {
  return new Date(TODAY.getTime() - days * 24 * 60 * 60 * 1000)
}

async function insertContact(
  id: string,
  overrides: Partial<typeof customShellContacts.$inferInsert> = {}
) {
  await db.insert(customShellContacts).values({
    id,
    workspaceId: WORKSPACE_ID,
    email: `${id}@example.test`,
    status: "subscribed",
    tags: [],
    createdAt: daysAgo(1),
    updatedAt: daysAgo(1),
    ...overrides,
  })
}

/** The emails the list shows for a set of filters. */
async function listed(conditions: SegmentCondition[], search?: string) {
  const { contacts } = await listWorkspaceContacts(
    WORKSPACE_ID,
    {
      search,
      rules: conditions.length ? { conditions } : undefined,
    },
    db
  )
  return contacts.map((contact) => contact.email).sort()
}

beforeEach(async () => {
  const created = await createTestDatabase()
  client = created.client
  db = created.db

  const owner = await insertUser(db, { email: "owner@example.test" })
  for (const id of [WORKSPACE_ID, OTHER_WORKSPACE_ID]) {
    await db.insert(customShellWorkspaces).values({
      id,
      userId: owner.id,
      name: id,
      settings: {},
      subdomain: `w-${Math.random().toString(36).slice(2, 10)}`,
      createdAt: daysAgo(400),
      updatedAt: daysAgo(400),
    })
  }
})

afterEach(async () => {
  await client.close()
})

describe("filtering the contacts list", () => {
  it("shows everybody when there are no filters", async () => {
    await insertContact("ada", { tags: ["beta"] })
    await insertContact("bob")

    expect(await listed([])).toEqual(["ada@example.test", "bob@example.test"])
  })

  it("narrows to the people every rule agrees on", async () => {
    await insertContact("ada", { tags: ["beta"] })
    await insertContact("bob", { tags: ["beta"], status: "unsubscribed" })
    await insertContact("cat", { tags: [] })

    expect(
      await listed([
        { type: "tag", operator: "includes", tags: ["beta"] },
        { type: "status", operator: "is", status: "subscribed" },
      ])
    ).toEqual(["ada@example.test"])
  })

  it("counts the same number it shows", async () => {
    await insertContact("ada", { tags: ["beta"] })
    await insertContact("bob", { tags: ["beta"] })
    await insertContact("cat")

    const { contacts, total } = await listWorkspaceContacts(
      WORKSPACE_ID,
      {
        rules: {
          conditions: [{ type: "tag", operator: "includes", tags: ["beta"] }],
        },
      },
      db
    )
    // The footer's total and the rows on screen have to be the same filter, or
    // "1-2 of 3" is a sentence nobody can make sense of.
    expect(total).toBe(2)
    expect(contacts).toHaveLength(2)
  })

  it("still searches inside the filtered people, not around them", async () => {
    await insertContact("ada", { tags: ["beta"] })
    await insertContact("adam", { tags: [] })

    expect(
      await listed([{ type: "tag", operator: "includes", tags: ["beta"] }], "ada")
    ).toEqual(["ada@example.test"])
  })

  it("can leave out the people in a segment", async () => {
    await insertContact("ada", { tags: ["beta"] })
    await insertContact("bob", { tags: ["beta", "staff"] })

    const staff = await createWorkspaceSegment(
      WORKSPACE_ID,
      {
        name: "Staff",
        description: "",
        kind: "rules",
        rules: {
          conditions: [{ type: "tag", operator: "includes", tags: ["staff"] }],
        },
        contactIds: [],
      },
      db
    )

    expect(
      await listed([{ type: "notIn", segmentIds: [staff.id] }])
    ).toEqual(["ada@example.test"])
  })

  it("never reaches another workspace's contacts", async () => {
    await insertContact("ada", { tags: ["beta"] })
    await db.insert(customShellContacts).values({
      id: "stranger",
      workspaceId: OTHER_WORKSPACE_ID,
      email: "stranger@example.test",
      status: "subscribed",
      tags: ["beta"],
      createdAt: daysAgo(1),
      updatedAt: daysAgo(1),
    })

    expect(
      await listed([{ type: "tag", operator: "includes", tags: ["beta"] }])
    ).toEqual(["ada@example.test"])
  })

  it("says nobody rather than everybody for a tag nobody carries", async () => {
    await insertContact("ada", { tags: ["beta"] })

    expect(
      await listed([{ type: "tag", operator: "includes", tags: ["gone"] }])
    ).toEqual([])
  })
})

/**
 * The "last emailed" column, and what it does with people nobody has emailed.
 *
 * Two things are being checked: that the date is the newest send and not just
 * any of them, and that never-emailed people land at the same end as the oldest
 * dates whichever way the column is sorted. The second is where databases
 * surprise people — Postgres puts nulls last ascending and first descending, so
 * left alone it would read as a bug in one direction.
 */
describe("when each person was last emailed", () => {
  async function send(contactId: string, at: Date, workspaceId = WORKSPACE_ID) {
    await db.insert(customShellDeliveries).values({
      id: `${contactId}-${at.getTime()}`,
      workspaceId,
      broadcastId: null,
      contactId,
      toEmail: `${contactId}@example.test`,
      subject: "A newsletter",
      status: "sent",
      createdAt: at,
    })
  }

  /** Everybody, in the order the list puts them, with their date. */
  async function orderedBy(direction: "asc" | "desc") {
    const { contacts } = await listWorkspaceContacts(
      WORKSPACE_ID,
      { sort: "emailed", direction },
      db
    )
    return contacts.map((contact) => [
      contact.email.replace("@example.test", ""),
      contact.lastEmailedAt?.toISOString() ?? null,
    ])
  }

  it("is empty for somebody who has never been emailed", async () => {
    await insertContact("ada")

    const { contacts } = await listWorkspaceContacts(WORKSPACE_ID, {}, db)
    expect(contacts[0].lastEmailedAt).toBeNull()
  })

  it("is the date of the one send, when there is only one", async () => {
    await insertContact("ada")
    await send("ada", daysAgo(3))

    const { contacts } = await listWorkspaceContacts(WORKSPACE_ID, {}, db)
    expect(contacts[0].lastEmailedAt).toEqual(daysAgo(3))
  })

  it("is the newest of many sends, not the first or the last written", async () => {
    await insertContact("ada")
    await send("ada", daysAgo(30))
    await send("ada", daysAgo(2))
    // Written last, older than the one above — so "the newest" and "the most
    // recently inserted" are deliberately different answers here.
    await send("ada", daysAgo(10))

    const { contacts } = await listWorkspaceContacts(WORKSPACE_ID, {}, db)
    expect(contacts[0].lastEmailedAt).toEqual(daysAgo(2))
  })

  it("counts nobody else's sends toward this person's date", async () => {
    await insertContact("ada")
    await insertContact("bob")
    await send("bob", daysAgo(1))

    const { contacts } = await listWorkspaceContacts(WORKSPACE_ID, {}, db)
    const ada = contacts.find((contact) => contact.id === "ada")
    expect(ada?.lastEmailedAt).toBeNull()
  })

  it("never counts a send recorded against another workspace", async () => {
    await insertContact("ada")
    await db.insert(customShellContacts).values({
      id: "stranger",
      workspaceId: OTHER_WORKSPACE_ID,
      email: "stranger@example.test",
      status: "subscribed",
      tags: [],
      createdAt: daysAgo(1),
      updatedAt: daysAgo(1),
    })
    // Same workspace as the contact it names, so this is a real row — it just
    // has nothing to do with the workspace being asked.
    await send("stranger", daysAgo(1), OTHER_WORKSPACE_ID)

    const { contacts } = await listWorkspaceContacts(WORKSPACE_ID, {}, db)
    expect(contacts).toHaveLength(1)
    expect(contacts[0].lastEmailedAt).toBeNull()
  })

  it("puts never-emailed people with the oldest, sorting oldest first", async () => {
    await insertContact("never")
    await insertContact("old")
    await insertContact("recent")
    await send("old", daysAgo(90))
    await send("recent", daysAgo(1))

    expect(await orderedBy("asc")).toEqual([
      ["never", null],
      ["old", daysAgo(90).toISOString()],
      ["recent", daysAgo(1).toISOString()],
    ])
  })

  it("and at the far end sorting newest first", async () => {
    await insertContact("never")
    await insertContact("old")
    await insertContact("recent")
    await send("old", daysAgo(90))
    await send("recent", daysAgo(1))

    expect(await orderedBy("desc")).toEqual([
      ["recent", daysAgo(1).toISOString()],
      ["old", daysAgo(90).toISOString()],
      ["never", null],
    ])
  })

  it("breaks ties on the id, so paging cannot repeat or skip anybody", async () => {
    // Three people emailed at the very same moment, which a single newsletter
    // going out does to everybody on it.
    for (const id of ["cat", "ada", "bob"]) {
      await insertContact(id)
      await send(id, daysAgo(5))
    }

    const firstTwo = await listWorkspaceContacts(
      WORKSPACE_ID,
      { sort: "emailed", direction: "asc", limit: 2 },
      db
    )
    const lastOne = await listWorkspaceContacts(
      WORKSPACE_ID,
      { sort: "emailed", direction: "asc", limit: 2, offset: 2 },
      db
    )

    expect(firstTwo.contacts.map((contact) => contact.id)).toEqual(["ada", "bob"])
    expect(lastOne.contacts.map((contact) => contact.id)).toEqual(["cat"])
  })

  it("still filters and counts the same as before with the column joined on", async () => {
    await insertContact("ada", { tags: ["beta"] })
    await insertContact("bob", { tags: ["beta"] })
    await insertContact("cat")
    // Several sends for one person, which a careless join would turn into
    // several rows for them and a total of four.
    await send("ada", daysAgo(9))
    await send("ada", daysAgo(4))

    const { contacts, total } = await listWorkspaceContacts(
      WORKSPACE_ID,
      {
        rules: {
          conditions: [{ type: "tag", operator: "includes", tags: ["beta"] }],
        },
      },
      db
    )
    expect(total).toBe(2)
    expect(contacts).toHaveLength(2)
  })
})

/**
 * Deleting everybody the filter matches, rather than a page of ticked rows.
 *
 * Every check here is the same question asked twice: who does the list show for
 * these filters, and who actually disappears. They have to be the same people —
 * a delete that means anything wider than the list is the one mistake nobody can
 * take back.
 */
describe("deleting everybody the filter matches", () => {
  /** Everybody left in this workspace, in the same words `listed` uses. */
  async function remaining(workspaceId = WORKSPACE_ID) {
    const { contacts } = await listWorkspaceContacts(workspaceId, {}, db)
    return contacts.map((contact) => contact.email).sort()
  }

  it("takes exactly the people the same rules put on the list", async () => {
    await insertContact("ada", { tags: ["beta"] })
    await insertContact("bob", { tags: ["beta"], status: "unsubscribed" })
    await insertContact("cat")

    const conditions: SegmentCondition[] = [
      { type: "tag", operator: "includes", tags: ["beta"] },
    ]
    expect(await listed(conditions)).toEqual([
      "ada@example.test",
      "bob@example.test",
    ])

    expect(
      await deleteWorkspaceContactsMatching(
        WORKSPACE_ID,
        { rules: { conditions } },
        db
      )
    ).toBe(2)
    expect(await remaining()).toEqual(["cat@example.test"])
  })

  it("narrows by the search box as well, exactly as the list does", async () => {
    await insertContact("ada", { tags: ["beta"] })
    await insertContact("adam", { tags: ["beta"] })
    await insertContact("bob", { tags: ["beta"] })

    const filter = {
      search: "ada",
      rules: {
        conditions: [
          { type: "tag", operator: "includes", tags: ["beta"] },
        ] as SegmentCondition[],
      },
    }
    expect(await listed(filter.rules.conditions, filter.search)).toEqual([
      "ada@example.test",
      "adam@example.test",
    ])

    expect(
      await deleteWorkspaceContactsMatching(WORKSPACE_ID, filter, db)
    ).toBe(2)
    expect(await remaining()).toEqual(["bob@example.test"])
  })

  it("reads 'any rule' the same way the list reads it", async () => {
    await insertContact("ada", { tags: ["beta"] })
    await insertContact("bob", { status: "unsubscribed" })
    await insertContact("cat")

    // On its own each rule is one person; together under "any" they are two.
    expect(
      await deleteWorkspaceContactsMatching(
        WORKSPACE_ID,
        {
          rules: {
            match: "any",
            conditions: [
              { type: "tag", operator: "includes", tags: ["beta"] },
              { type: "status", operator: "is", status: "unsubscribed" },
            ],
          },
        },
        db
      )
    ).toBe(2)
    expect(await remaining()).toEqual(["cat@example.test"])
  })

  it("follows a not-in rule through to the other segment's people", async () => {
    await insertContact("ada", { tags: ["beta"] })
    await insertContact("bob", { tags: ["beta", "staff"] })

    const staff = await createWorkspaceSegment(
      WORKSPACE_ID,
      {
        name: "Staff",
        description: "",
        kind: "rules",
        rules: {
          conditions: [{ type: "tag", operator: "includes", tags: ["staff"] }],
        },
        contactIds: [],
      },
      db
    )

    expect(
      await deleteWorkspaceContactsMatching(
        WORKSPACE_ID,
        { rules: { conditions: [{ type: "notIn", segmentIds: [staff.id] }] } },
        db
      )
    ).toBe(1)
    expect(await remaining()).toEqual(["bob@example.test"])
  })

  it("deletes nobody when the filter matches nobody", async () => {
    await insertContact("ada", { tags: ["beta"] })

    expect(
      await deleteWorkspaceContactsMatching(
        WORKSPACE_ID,
        {
          rules: {
            conditions: [{ type: "tag", operator: "includes", tags: ["gone"] }],
          },
        },
        db
      )
    ).toBe(0)
    expect(await remaining()).toEqual(["ada@example.test"])
  })

  it("with no filters at all it takes this workspace and no other", async () => {
    await insertContact("ada")
    await insertContact("bob")
    await db.insert(customShellContacts).values({
      id: "stranger",
      workspaceId: OTHER_WORKSPACE_ID,
      email: "stranger@example.test",
      status: "subscribed",
      tags: [],
      createdAt: daysAgo(1),
      updatedAt: daysAgo(1),
    })

    expect(await deleteWorkspaceContactsMatching(WORKSPACE_ID, {}, db)).toBe(2)
    expect(await remaining()).toEqual([])
    expect(await remaining(OTHER_WORKSPACE_ID)).toEqual([
      "stranger@example.test",
    ])
  })

  it("never reaches somebody else's matching contacts", async () => {
    await insertContact("ada", { tags: ["beta"] })
    await db.insert(customShellContacts).values({
      id: "stranger",
      workspaceId: OTHER_WORKSPACE_ID,
      email: "stranger@example.test",
      status: "subscribed",
      tags: ["beta"],
      createdAt: daysAgo(1),
      updatedAt: daysAgo(1),
    })

    expect(
      await deleteWorkspaceContactsMatching(
        WORKSPACE_ID,
        {
          rules: {
            conditions: [{ type: "tag", operator: "includes", tags: ["beta"] }],
          },
        },
        db
      )
    ).toBe(1)
    expect(await remaining(OTHER_WORKSPACE_ID)).toEqual([
      "stranger@example.test",
    ])
  })
})
