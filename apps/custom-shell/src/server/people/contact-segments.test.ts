import type { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import {
  parseSegmentRules,
  type SegmentCondition,
  type SegmentRules,
} from "@/lib/contacts/contact-segments"
import {
  addContactsToSegment,
  countDraftSegmentContacts,
  countSegmentContacts,
  createWorkspaceSegment,
  deleteWorkspaceSegments,
  listSegmentNames,
  listSegmentContacts,
  listWorkspaceContactSources,
  listWorkspaceSegments,
  readSegment,
  updateWorkspaceSegment,
  type SegmentInput,
} from "@/server/people/contact-segments"
import { type CustomShellDb } from "@/server/db"
import {
  customShellContacts,
  customShellPlans,
  customShellSubscriptions,
  customShellWorkspaces,
} from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * What a segment actually means, asked of a real database.
 *
 * Every check here is the same question: does the count match the people you
 * would find by hand? That matters more than usual, because the number a
 * segment shows is the number that will be emailed.
 */

const WORKSPACE_ID = "ws-segments"
const OTHER_WORKSPACE_ID = "ws-somebody-else"

let client: PGlite
let db: CustomShellDb

/** Fixed so "joined in the last 30 days" means the same thing in every run. */
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

function rulesInput(
  name: string,
  conditions: SegmentCondition[]
): SegmentInput {
  return {
    name,
    description: "",
    kind: "rules",
    rules: { conditions },
    contactIds: [],
  }
}

/** Who a set of rules matches, by email, without saving a segment first. */
async function matchingRules(rules: SegmentRules) {
  const people = await listSegmentContacts(
    WORKSPACE_ID,
    { id: "draft", kind: "rules", rules },
    {},
    db,
    TODAY
  )
  return people.map((person) => person.email).sort()
}

async function matching(conditions: SegmentCondition[]) {
  return matchingRules({ conditions })
}

beforeEach(async () => {
  const created = await createTestDatabase()
  client = created.client
  db = created.db

  const owner = await insertUser(db, { email: "owner@example.test" })
  const timestamp = daysAgo(400)
  for (const id of [WORKSPACE_ID, OTHER_WORKSPACE_ID]) {
    await db.insert(customShellWorkspaces).values({
      id,
      userId: owner.id,
      name: id,
      settings: {},
      subdomain: `w-${Math.random().toString(36).slice(2, 10)}`,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
  }
})

afterEach(async () => {
  await client.close()
})

describe("one segment, one condition at a time", () => {
  it("matches people carrying one of the tags, and only them", async () => {
    await insertContact("ada", { tags: ["beta", "vip"] })
    await insertContact("bob", { tags: ["beta"] })
    await insertContact("cat", { tags: ["staff"] })

    expect(
      await matching([{ type: "tag", operator: "includes", tags: ["beta"] }])
    ).toEqual(["ada@example.test", "bob@example.test"])
  })

  it("matches nobody when the tag is one nobody carries any more", async () => {
    await insertContact("ada", { tags: ["beta"] })
    await insertContact("bob", { tags: [] })

    // The failure to avoid: quietly widening to everybody.
    expect(
      await matching([{ type: "tag", operator: "includes", tags: ["gone"] }])
    ).toEqual([])
  })

  it("leaves out everyone carrying the tag when the rule excludes it", async () => {
    await insertContact("ada", { tags: ["beta"] })
    await insertContact("bob", { tags: [] })

    expect(
      await matching([{ type: "tag", operator: "excludes", tags: ["beta"] }])
    ).toEqual(["bob@example.test"])
  })

  it("matches on status, both ways round", async () => {
    await insertContact("ada")
    await insertContact("bob", { status: "unsubscribed" })

    expect(
      await matching([
        { type: "status", operator: "is", status: "subscribed" },
      ])
    ).toEqual(["ada@example.test"])
    expect(
      await matching([
        { type: "status", operator: "isnt", status: "subscribed" },
      ])
    ).toEqual(["bob@example.test"])
  })

  it("counts somebody with no source in 'did not come from'", async () => {
    await insertContact("ada", { source: "Account" })
    await insertContact("bob", { source: null })

    expect(
      await matching([{ type: "source", operator: "is", source: "Account" }])
    ).toEqual(["ada@example.test"])
    // The one worth spelling out: nobody should fall out of both answers.
    expect(
      await matching([{ type: "source", operator: "isnt", source: "Account" }])
    ).toEqual(["bob@example.test"])
  })

  it("splits people by when they joined", async () => {
    await insertContact("fresh", { createdAt: daysAgo(5) })
    await insertContact("ancient", { createdAt: daysAgo(200) })

    expect(
      await matching([{ type: "joined", operator: "within", days: 30 }])
    ).toEqual(["fresh@example.test"])
    expect(
      await matching([{ type: "joined", operator: "before", days: 30 }])
    ).toEqual(["ancient@example.test"])
  })

  it("splits people by whether they have an account", async () => {
    const member = await insertUser(db, { email: "member@example.test" })
    await insertContact("ada", { userId: member.id })
    await insertContact("bob")

    expect(await matching([{ type: "account", operator: "has" }])).toEqual([
      "ada@example.test",
    ])
    expect(await matching([{ type: "account", operator: "hasnt" }])).toEqual([
      "bob@example.test",
    ])
  })
})

describe("every rule has to be true at once", () => {
  it("keeps only the people every rule agrees on", async () => {
    await insertContact("ada", { tags: ["beta"], status: "subscribed" })
    await insertContact("bob", { tags: ["beta"], status: "unsubscribed" })
    await insertContact("cat", { tags: [], status: "subscribed" })

    expect(
      await matching([
        { type: "tag", operator: "includes", tags: ["beta"] },
        { type: "status", operator: "is", status: "subscribed" },
      ])
    ).toEqual(["ada@example.test"])
  })

  it("matches nobody plainly, and that is not an error", async () => {
    await insertContact("ada", { tags: ["beta"] })

    const total = await countSegmentContacts(
      WORKSPACE_ID,
      {
        id: "draft",
        kind: "rules",
        rules: {
          conditions: [
            { type: "tag", operator: "includes", tags: ["beta"] },
            { type: "tag", operator: "excludes", tags: ["beta"] },
          ],
        },
      },
      db,
      TODAY
    )

    expect(total).toBe(0)
  })
})

describe("choosing whether all or any rules must match", () => {
  const conditions: SegmentCondition[] = [
    { type: "tag", operator: "includes", tags: ["beta"] },
    { type: "status", operator: "is", status: "subscribed" },
  ]

  it("returns the intersection for all and the union for any", async () => {
    await insertContact("ada", { tags: ["beta"], status: "subscribed" })
    await insertContact("bob", { tags: ["beta"], status: "unsubscribed" })
    await insertContact("cat", { tags: [], status: "subscribed" })

    expect(await matchingRules({ conditions })).toEqual(["ada@example.test"])
    expect(await matchingRules({ match: "any", conditions })).toEqual([
      "ada@example.test",
      "bob@example.test",
      "cat@example.test",
    ])
  })

  it("keeps workspace ownership outside the any-rule group", async () => {
    await insertContact("ada", { tags: ["beta"], status: "unsubscribed" })
    await db.insert(customShellContacts).values({
      id: "stranger",
      workspaceId: OTHER_WORKSPACE_ID,
      email: "stranger@example.test",
      status: "subscribed",
      tags: [],
      createdAt: daysAgo(1),
      updatedAt: daysAgo(1),
    })

    expect(await matchingRules({ match: "any", conditions })).toEqual([
      "ada@example.test",
    ])
  })

  it("keeps unreadable any-mode rules matching nobody", async () => {
    await insertContact("ada", { status: "subscribed" })
    await insertContact("bob", { status: "unsubscribed" })

    const unreadable = parseSegmentRules({
      match: "any",
      conditions: [{ type: "wormhole" }],
    })
    expect(await matchingRules(unreadable)).toEqual([])
  })
})

describe("a live count for an unsaved draft", () => {
  it("returns both the matching group and the workspace's whole list", async () => {
    await insertContact("ada", { tags: ["beta"] })
    await insertContact("bob", { tags: ["beta"] })
    await insertContact("cat", { tags: [] })
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
      await countDraftSegmentContacts(
        WORKSPACE_ID,
        {
          conditions: [
            { type: "tag", operator: "includes", tags: ["beta"] },
          ],
        },
        db,
        TODAY
      )
    ).toEqual({ matching: 2, everyone: 3 })
  })
})

describe("nobody else's contacts", () => {
  it("never counts a contact from another workspace", async () => {
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
      await matching([{ type: "tag", operator: "includes", tags: ["beta"] }])
    ).toEqual(["ada@example.test"])
  })
})

describe("unsubscribing takes somebody out on the next read", () => {
  it("drops them without anything else being touched", async () => {
    await insertContact("ada", { tags: ["beta"] })
    await insertContact("bob", { tags: ["beta"] })

    const segment = await createWorkspaceSegment(
      WORKSPACE_ID,
      rulesInput("Beta readers", [
        { type: "tag", operator: "includes", tags: ["beta"] },
        { type: "status", operator: "is", status: "subscribed" },
      ]),
      db
    )

    expect(
      await countSegmentContacts(WORKSPACE_ID, readSegment(segment), db, TODAY)
    ).toBe(2)

    await db
      .update(customShellContacts)
      .set({ status: "unsubscribed" })
      .where(eq(customShellContacts.id, "bob"))

    expect(
      await countSegmentContacts(WORKSPACE_ID, readSegment(segment), db, TODAY)
    ).toBe(1)
  })
})

describe("the plan rule reaches the accounts side", () => {
  /** The Pro plan the migrations already seed, so the test uses the real one. */
  let proPlanId: string

  async function payingMember(email: string, planId: string) {
    const user = await insertUser(db, { email })
    await db.insert(customShellSubscriptions).values({
      id: `sub-${email}`,
      userId: user.id,
      planId,
      status: "active",
      interval: "monthly",
      source: "stripe",
      currentPeriodEnd: new Date("2027-01-01T00:00:00Z"),
      createdAt: daysAgo(10),
      updatedAt: daysAgo(10),
    })
    return user
  }

  beforeEach(async () => {
    const [plan] = await db
      .select({ id: customShellPlans.id })
      .from(customShellPlans)
      .where(eq(customShellPlans.slug, "pro"))
    proPlanId = plan.id
  })

  it("finds the people whose subscription is live", async () => {
    const paying = await payingMember("paying@example.test", proPlanId)
    await insertContact("ada", { userId: paying.id })
    await insertContact("bob")

    expect(
      await matching([{ type: "plan", operator: "is", planSlug: "pro" }])
    ).toEqual(["ada@example.test"])
  })

  it("counts somebody with no account as not on the plan", async () => {
    const paying = await payingMember("paying@example.test", proPlanId)
    await insertContact("ada", { userId: paying.id })
    await insertContact("bob")

    expect(
      await matching([{ type: "plan", operator: "isnt", planSlug: "pro" }])
    ).toEqual(["bob@example.test"])
  })

  it("leaves out a subscription whose paid period has lapsed", async () => {
    const lapsed = await insertUser(db, { email: "lapsed@example.test" })
    await db.insert(customShellSubscriptions).values({
      id: "sub-lapsed",
      userId: lapsed.id,
      planId: proPlanId,
      status: "active",
      interval: "monthly",
      currentPeriodEnd: daysAgo(3),
      createdAt: daysAgo(100),
      updatedAt: daysAgo(100),
    })
    await insertContact("ada", { userId: lapsed.id })

    expect(
      await matching([{ type: "plan", operator: "is", planSlug: "pro" }])
    ).toEqual([])
  })

  it("matches nobody at all once the plan itself is deleted", async () => {
    const paying = await payingMember("paying@example.test", proPlanId)
    await insertContact("ada", { userId: paying.id })
    await insertContact("bob")
    await db.delete(customShellPlans).where(eq(customShellPlans.id, proPlanId))

    // Both ways round. "Nobody is on it, so everybody isn't" is the honest
    // reading and also the one that would mail the whole list.
    expect(
      await matching([{ type: "plan", operator: "is", planSlug: "pro" }])
    ).toEqual([])
    expect(
      await matching([{ type: "plan", operator: "isnt", planSlug: "pro" }])
    ).toEqual([])
  })

  it("refuses to save a rule naming a plan that does not exist", async () => {
    await expect(
      createWorkspaceSegment(
        WORKSPACE_ID,
        rulesInput("Ghosts", [
          { type: "plan", operator: "is", planSlug: "nope" },
        ]),
        db
      )
    ).rejects.toThrow("SEGMENT_PLAN_MISSING")
  })
})

describe("one segment leaving another out", () => {
  it("takes the other segment's people away", async () => {
    await insertContact("ada", { tags: ["beta"] })
    await insertContact("bob", { tags: ["beta", "staff"] })

    const staff = await createWorkspaceSegment(
      WORKSPACE_ID,
      rulesInput("Staff", [
        { type: "tag", operator: "includes", tags: ["staff"] },
      ]),
      db
    )
    const readers = await createWorkspaceSegment(
      WORKSPACE_ID,
      rulesInput("Beta minus staff", [
        { type: "tag", operator: "includes", tags: ["beta"] },
        { type: "notIn", segmentIds: [staff.id] },
      ]),
      db
    )

    const people = await listSegmentContacts(
      WORKSPACE_ID,
      readSegment(readers),
      {},
      db,
      TODAY
    )
    expect(people.map((person) => person.email)).toEqual(["ada@example.test"])
  })

  it("refuses a segment that leaves itself out", async () => {
    const segment = await createWorkspaceSegment(
      WORKSPACE_ID,
      rulesInput("Itself", [
        { type: "status", operator: "is", status: "subscribed" },
      ]),
      db
    )

    await expect(
      updateWorkspaceSegment(
        WORKSPACE_ID,
        segment.id,
        rulesInput("Itself", [
          { type: "notIn", segmentIds: [segment.id] },
        ]),
        db
      )
    ).rejects.toThrow("SEGMENT_LOOP")
  })

  it("refuses a loop that goes round three segments", async () => {
    const a = await createWorkspaceSegment(WORKSPACE_ID, rulesInput("A", []), db)
    const b = await createWorkspaceSegment(
      WORKSPACE_ID,
      rulesInput("B", [{ type: "notIn", segmentIds: [a.id] }]),
      db
    )
    const c = await createWorkspaceSegment(
      WORKSPACE_ID,
      rulesInput("C", [{ type: "notIn", segmentIds: [b.id] }]),
      db
    )

    await expect(
      updateWorkspaceSegment(
        WORKSPACE_ID,
        a.id,
        rulesInput("A", [{ type: "notIn", segmentIds: [c.id] }]),
        db
      )
    ).rejects.toThrow("SEGMENT_LOOP")
  })

  it("refuses a rule pointing at a segment that is not there", async () => {
    await expect(
      createWorkspaceSegment(
        WORKSPACE_ID,
        rulesInput("Dangling", [
          { type: "notIn", segmentIds: ["no-such-segment"] },
        ]),
        db
      )
    ).rejects.toThrow("SEGMENT_REFERENCE_MISSING")
  })
})

describe("hand-picked segments", () => {
  it("holds exactly the people picked, and nobody else", async () => {
    await insertContact("ada")
    await insertContact("bob")
    await insertContact("cat")

    const segment = await createWorkspaceSegment(
      WORKSPACE_ID,
      {
        name: "The three",
        description: "",
        kind: "static",
        rules: { conditions: [] },
        contactIds: ["ada", "cat"],
      },
      db
    )

    const people = await listSegmentContacts(
      WORKSPACE_ID,
      readSegment(segment),
      {},
      db,
      TODAY
    )
    expect(people.map((person) => person.email)).toEqual([
      "ada@example.test",
      "cat@example.test",
    ])
  })

  it("refuses somebody from another workspace", async () => {
    await db.insert(customShellContacts).values({
      id: "stranger",
      workspaceId: OTHER_WORKSPACE_ID,
      email: "stranger@example.test",
      status: "subscribed",
      tags: [],
      createdAt: daysAgo(1),
      updatedAt: daysAgo(1),
    })

    await expect(
      createWorkspaceSegment(
        WORKSPACE_ID,
        {
          name: "Sneaky",
          description: "",
          kind: "static",
          rules: { conditions: [] },
          contactIds: ["stranger"],
        },
        db
      )
    ).rejects.toThrow("SEGMENT_CONTACT_MISSING")
  })

  it("drops its people when it is turned into a rules segment", async () => {
    await insertContact("ada", { tags: ["beta"] })
    const segment = await createWorkspaceSegment(
      WORKSPACE_ID,
      {
        name: "Switcher",
        description: "",
        kind: "static",
        rules: { conditions: [] },
        contactIds: ["ada"],
      },
      db
    )

    await updateWorkspaceSegment(
      WORKSPACE_ID,
      segment.id,
      rulesInput("Switcher", [
        { type: "tag", operator: "includes", tags: ["nobody-has-this"] },
      ]),
      db
    )

    const [item] = await listWorkspaceSegments(WORKSPACE_ID, db, TODAY)
    expect(item?.total).toBe(0)
  })
})

describe("the list page counts every segment in one query", () => {
  it("gets the same answers as counting them one at a time", async () => {
    const member = await insertUser(db, { email: "member@example.test" })
    await insertContact("ada", { tags: ["beta"], userId: member.id })
    await insertContact("bob", { tags: ["beta"], status: "unsubscribed" })
    await insertContact("cat", { tags: [], createdAt: daysAgo(300) })

    const staff = await createWorkspaceSegment(
      WORKSPACE_ID,
      rulesInput("Beta", [{ type: "tag", operator: "includes", tags: ["beta"] }]),
      db
    )
    await createWorkspaceSegment(
      WORKSPACE_ID,
      rulesInput("Old hands", [
        { type: "joined", operator: "before", days: 100 },
      ]),
      db
    )
    await createWorkspaceSegment(
      WORKSPACE_ID,
      rulesInput("Beta minus", [
        { type: "account", operator: "hasnt" },
        { type: "notIn", segmentIds: [staff.id] },
      ]),
      db
    )
    await createWorkspaceSegment(
      WORKSPACE_ID,
      {
        ...rulesInput("Beta or old", []),
        rules: {
          match: "any",
          conditions: [
            { type: "tag", operator: "includes", tags: ["beta"] },
            { type: "joined", operator: "before", days: 100 },
          ],
        },
      },
      db
    )

    const listed = await listWorkspaceSegments(WORKSPACE_ID, db, TODAY)

    // Counted the slow way, one query each, and the two have to agree — the
    // fast path builds one query with a count per segment in it.
    for (const item of listed) {
      const alone = await countSegmentContacts(
        WORKSPACE_ID,
        readSegment(item.segment),
        db,
        TODAY
      )
      expect(alone, item.segment.name).toBe(item.total)
    }

    expect(
      Object.fromEntries(
        listed.map((item) => [item.segment.name, item.total])
      )
    ).toEqual({
      Beta: 2,
      "Old hands": 1,
      "Beta minus": 1,
      "Beta or old": 3,
    })
  })
})

describe("adding people to a segment from the contacts list", () => {
  async function handPicked(name: string, contactIds: string[]) {
    return createWorkspaceSegment(
      WORKSPACE_ID,
      {
        name,
        description: "",
        kind: "static",
        rules: { conditions: [] },
        contactIds,
      },
      db
    )
  }

  it("adds them, and says how many actually went in", async () => {
    await insertContact("ada")
    await insertContact("bob")
    await insertContact("cat")
    const segment = await handPicked("The list", ["ada"])

    expect(
      await addContactsToSegment(WORKSPACE_ID, segment.id, ["bob", "cat"], db)
    ).toEqual({ added: 2, alreadyThere: 0 })

    const people = await listSegmentContacts(
      WORKSPACE_ID,
      readSegment(segment),
      {},
      db,
      TODAY
    )
    expect(people.map((person) => person.email).sort()).toEqual([
      "ada@example.test",
      "bob@example.test",
      "cat@example.test",
    ])
  })

  it("counts somebody already in it separately instead of claiming them", async () => {
    await insertContact("ada")
    await insertContact("bob")
    const segment = await handPicked("The list", ["ada"])

    expect(
      await addContactsToSegment(WORKSPACE_ID, segment.id, ["ada", "bob"], db)
    ).toEqual({ added: 1, alreadyThere: 1 })
  })

  it("adding the same person twice changes nothing the second time", async () => {
    await insertContact("ada")
    const segment = await handPicked("The list", ["ada"])

    expect(
      await addContactsToSegment(WORKSPACE_ID, segment.id, ["ada"], db)
    ).toEqual({ added: 0, alreadyThere: 1 })
  })

  it("refuses a rules segment, which works itself out", async () => {
    await insertContact("ada")
    const rules = await createWorkspaceSegment(
      WORKSPACE_ID,
      rulesInput("By rules", [
        { type: "status", operator: "is", status: "subscribed" },
      ]),
      db
    )

    await expect(
      addContactsToSegment(WORKSPACE_ID, rules.id, ["ada"], db)
    ).rejects.toThrow("SEGMENT_IS_RULES")
  })

  it("refuses a segment belonging to another workspace", async () => {
    await insertContact("ada")
    const elsewhere = await createWorkspaceSegment(
      OTHER_WORKSPACE_ID,
      {
        name: "Theirs",
        description: "",
        kind: "static",
        rules: { conditions: [] },
        contactIds: [],
      },
      db
    )

    await expect(
      addContactsToSegment(WORKSPACE_ID, elsewhere.id, ["ada"], db)
    ).rejects.toThrow("SEGMENT_NOT_FOUND")
  })

  it("never adds a contact from another workspace", async () => {
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
    const segment = await handPicked("The list", [])

    // The stranger is simply not among the people found, so only Ada goes in.
    expect(
      await addContactsToSegment(
        WORKSPACE_ID,
        segment.id,
        ["ada", "stranger"],
        db
      )
    ).toEqual({ added: 1, alreadyThere: 0 })
  })

  it("names every segment with its kind, so the toolbar can offer the right ones", async () => {
    await insertContact("ada")
    await handPicked("By hand", ["ada"])
    await createWorkspaceSegment(WORKSPACE_ID, rulesInput("By rules", []), db)

    expect(await listSegmentNames(WORKSPACE_ID, db)).toEqual([
      { id: expect.any(String), name: "By hand", kind: "static" },
      { id: expect.any(String), name: "By rules", kind: "rules" },
    ])
  })
})

describe("two segments cannot share a name", () => {
  it("refuses the same name however it was typed", async () => {
    await createWorkspaceSegment(WORKSPACE_ID, rulesInput("Paying", []), db)

    await expect(
      createWorkspaceSegment(WORKSPACE_ID, rulesInput("paying", []), db)
    ).rejects.toThrow("SEGMENT_NAME_TAKEN")
  })

  it("lets a segment keep its own name when it is edited", async () => {
    const segment = await createWorkspaceSegment(
      WORKSPACE_ID,
      rulesInput("Paying", []),
      db
    )

    const updated = await updateWorkspaceSegment(
      WORKSPACE_ID,
      segment.id,
      { ...rulesInput("Paying", []), description: "Still paying" },
      db
    )
    expect(updated.description).toBe("Still paying")
  })

  it("lets another workspace use the same name", async () => {
    await createWorkspaceSegment(WORKSPACE_ID, rulesInput("Paying", []), db)
    const elsewhere = await createWorkspaceSegment(
      OTHER_WORKSPACE_ID,
      rulesInput("Paying", []),
      db
    )
    expect(elsewhere.name).toBe("Paying")
  })
})

describe("deleting a segment something is using", () => {
  it("refuses and says what is using it", async () => {
    const staff = await createWorkspaceSegment(
      WORKSPACE_ID,
      rulesInput("Staff", []),
      db
    )
    await createWorkspaceSegment(
      WORKSPACE_ID,
      rulesInput("Everyone but staff", [
        { type: "notIn", segmentIds: [staff.id] },
      ]),
      db
    )

    const result = await deleteWorkspaceSegments(WORKSPACE_ID, [staff.id], db)
    expect(result.deleted).toEqual([])
    expect(result.blocked).toEqual([
      { id: staff.id, name: "Staff", usedBy: ["Everyone but staff"] },
    ])
  })

  it("goes ahead when the only thing using it is going too", async () => {
    const staff = await createWorkspaceSegment(
      WORKSPACE_ID,
      rulesInput("Staff", []),
      db
    )
    const rest = await createWorkspaceSegment(
      WORKSPACE_ID,
      rulesInput("Everyone but staff", [
        { type: "notIn", segmentIds: [staff.id] },
      ]),
      db
    )

    const result = await deleteWorkspaceSegments(
      WORKSPACE_ID,
      [staff.id, rest.id],
      db
    )
    expect(result.deleted.sort()).toEqual([staff.id, rest.id].sort())
    expect(result.blocked).toEqual([])
  })

  it("deletes the ones nothing is using and keeps the rest", async () => {
    const staff = await createWorkspaceSegment(
      WORKSPACE_ID,
      rulesInput("Staff", []),
      db
    )
    const spare = await createWorkspaceSegment(
      WORKSPACE_ID,
      rulesInput("Spare", []),
      db
    )
    await createWorkspaceSegment(
      WORKSPACE_ID,
      rulesInput("Everyone but staff", [
        { type: "notIn", segmentIds: [staff.id] },
      ]),
      db
    )

    const result = await deleteWorkspaceSegments(
      WORKSPACE_ID,
      [staff.id, spare.id],
      db
    )
    expect(result.deleted).toEqual([spare.id])
    expect(result.blocked.map((entry) => entry.name)).toEqual(["Staff"])
  })

  it("never touches another workspace's segment", async () => {
    const elsewhere = await createWorkspaceSegment(
      OTHER_WORKSPACE_ID,
      rulesInput("Theirs", []),
      db
    )

    const result = await deleteWorkspaceSegments(
      WORKSPACE_ID,
      [elsewhere.id],
      db
    )
    expect(result.deleted).toEqual([])
    expect(await listWorkspaceSegments(OTHER_WORKSPACE_ID, db, TODAY)).toHaveLength(1)
  })
})

describe("what the rule builder is offered", () => {
  it("lists every source in use, once each and in order", async () => {
    await insertContact("ada", { source: "Account" })
    await insertContact("bob", { source: "Added by hand" })
    await insertContact("cat", { source: "Account" })
    await insertContact("dan", { source: null })

    expect(await listWorkspaceContactSources(WORKSPACE_ID, db)).toEqual([
      "Account",
      "Added by hand",
    ])
  })
})
