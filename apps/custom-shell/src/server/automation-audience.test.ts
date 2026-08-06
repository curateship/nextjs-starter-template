import type { AutomationNodeSettings } from "@/lib/automations/node-descriptor"
import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { compileAutomationGraph } from "@/lib/automations/compile"
import { EMPTY_AUTOMATION_GRAPH } from "@/lib/automations/graph"
import {
  countAutomationAudience,
  MissingAudiencePlanError,
  MissingAudienceSegmentError,
  readAutomationAudience,
  type AutomationAudience,
} from "@/server/automation-audience"
import { automationExecutors } from "@/server/automation-executors"
import { createWorkspaceSegment } from "@/server/contact-segments"
import { syncContactsFromUsers } from "@/server/contacts"
import { type CustomShellDb } from "@/server/db"
import {
  customShellContacts,
  customShellPlans,
  customShellSubscriptions,
  customShellWorkspaces,
  type CustomShellAutomationRun,
  type CustomShellUser,
} from "@/server/schema"
import { now, uuid } from "@/server/security"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * The audience is a set of **contacts** in the flow owner's workspace, so every
 * test here stands up a workspace, and the owner of it is an account like any
 * other — they are inside every count below.
 */
const WORKSPACE_ID = "ws-audience"

let client: PGlite
let db: CustomShellDb
let owner: CustomShellUser

beforeEach(async () => {
  const created = await createTestDatabase()
  client = created.client
  db = created.db as unknown as CustomShellDb

  owner = await insertUser(db, { role: "admin", email: "owner@example.test" })
  const timestamp = now()
  await db.insert(customShellWorkspaces).values({
    id: WORKSPACE_ID,
    userId: owner.id,
    name: "Main",
    settings: {},
    isDefault: true,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
})

afterEach(async () => {
  await client.close()
})

const audienceOf = (
  kind: AutomationAudience["kind"],
  planSlug = "",
  segmentId = ""
): AutomationAudience => ({ kind, planSlug, segmentId })

/**
 * Counts the way the running step does: contacts brought up to date with the
 * accounts first, then the count over contacts.
 */
async function countSynced(audience: AutomationAudience) {
  await syncContactsFromUsers(WORKSPACE_ID, db)
  return countAutomationAudience(audience, WORKSPACE_ID, db)
}

/** An address on the list with no account behind it — a waitlist row. */
async function insertContact(
  id: string,
  overrides: Partial<typeof customShellContacts.$inferInsert> = {}
) {
  const timestamp = now()
  await db.insert(customShellContacts).values({
    id,
    workspaceId: WORKSPACE_ID,
    email: `${id}@example.test`,
    status: "subscribed",
    tags: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  })
}

/** A hand-picked segment holding exactly these contacts. */
async function staticSegment(name: string, contactIds: string[]) {
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

/**
 * The plan with this short id. The migrations already seed `free` and `pro`, so
 * a test asking for one of those gets the real seeded row rather than a second
 * copy the unique index would refuse.
 */
async function planFor(slug: string) {
  const [seeded] = await db
    .select()
    .from(customShellPlans)
    .where(eq(customShellPlans.slug, slug))
    .limit(1)
  if (seeded) return seeded

  const timestamp = now()
  const [plan] = await db
    .insert(customShellPlans)
    .values({
      id: uuid(),
      slug,
      name: slug.toUpperCase(),
      priceMonthlyCents: 1000,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning()
  return plan
}

/** One account with a subscription attached, the way the billing code writes it. */
async function insertPayingUser(
  planId: string | null,
  overrides: {
    subscriptionStatus?: string
    currentPeriodEnd?: Date | null
    userStatus?: string
    emailVerifiedAt?: Date | null
  } = {}
) {
  const timestamp = now()
  const user = await insertUser(db, {
    status: overrides.userStatus ?? "active",
    ...(overrides.userStatus === "pending_deletion"
      ? { deletedAt: timestamp }
      : {}),
    emailVerifiedAt:
      overrides.emailVerifiedAt === undefined
        ? timestamp
        : overrides.emailVerifiedAt,
  })
  await db.insert(customShellSubscriptions).values({
    id: uuid(),
    userId: user.id,
    planId,
    status: overrides.subscriptionStatus ?? "active",
    currentPeriodEnd:
      overrides.currentPeriodEnd === undefined
        ? new Date(timestamp.getTime() + 30 * 24 * 60 * 60 * 1000)
        : overrides.currentPeriodEnd,
    createdAt: timestamp,
    updatedAt: timestamp,
  })
  return user
}

describe("reading a saved audience", () => {
  it("keeps the plan only for the one-plan choice", () => {
    expect(readAutomationAudience({ audience: "plan", planSlug: " pro " })).toEqual(
      { kind: "plan", planSlug: "pro", segmentId: "" }
    )
    expect(
      readAutomationAudience({ audience: "paying", planSlug: "pro" })
    ).toEqual({ kind: "paying", planSlug: "", segmentId: "" })
  })

  it("keeps the segment only for the segment choice", () => {
    expect(
      readAutomationAudience({ audience: "segment", segmentId: " seg-1 " })
    ).toEqual({ kind: "segment", planSlug: "", segmentId: "seg-1" })
    expect(
      readAutomationAudience({ audience: "everyone", segmentId: "seg-1" })
    ).toEqual({ kind: "everyone", planSlug: "", segmentId: "" })
  })

  // Falling back would mean a broken flow quietly reaching *more* people than
  // it was told to, which is the one mistake this node must never make.
  it("refuses a choice it cannot read instead of widening to everyone", () => {
    expect(() => readAutomationAudience({ audience: "nonsense" })).toThrow(
      /does not say who the flow is about/
    )
    expect(() => readAutomationAudience({})).toThrow()
  })
})

describe("the compiler", () => {
  const graphOf = (settings: AutomationNodeSettings) => ({
    ...EMPTY_AUTOMATION_GRAPH,
    nodes: [{ id: "n0", kind: "audience", x: 0, y: 0, settings }],
  })

  it("refuses a one-plan audience with no plan named", () => {
    const result = compileAutomationGraph(
      graphOf({ audience: "plan", planSlug: "" })
    )
    expect(result.config).toBeNull()
    expect(result.errors[0]?.message).toContain("Pick which plan")
  })

  it("refuses a segment audience with no segment picked", () => {
    const result = compileAutomationGraph(
      graphOf({ audience: "segment", segmentId: "" })
    )
    expect(result.config).toBeNull()
    expect(result.errors[0]?.message).toContain("Pick which segment")
  })

  it("accepts a segment audience once one is picked", () => {
    expect(
      compileAutomationGraph(graphOf({ audience: "segment", segmentId: "seg-1" }))
        .errors
    ).toEqual([])
  })

  it("accepts the other choices with no plan", () => {
    expect(
      compileAutomationGraph(graphOf({ audience: "paying", planSlug: "" }))
        .errors
    ).toEqual([])
  })
})

describe("counting who matches", () => {
  // The owner of the workspace counts too — they have an account like anyone.
  it("counts every account, and never a suspended or closing one", async () => {
    await insertUser(db)
    await insertUser(db)
    await insertUser(db, { status: "suspended" })
    await insertUser(db, { status: "pending_deletion", deletedAt: now() })

    expect(await countSynced(audienceOf("everyone"))).toBe(3)
  })

  it("counts an address with no account behind it — everyone means everyone", async () => {
    await insertUser(db)
    await insertContact("waitlist")

    expect(await countSynced(audienceOf("everyone"))).toBe(3)
  })

  it("never counts somebody who unsubscribed, whatever the choice", async () => {
    const member = await insertUser(db)
    await insertContact("gone", { status: "unsubscribed" })
    await syncContactsFromUsers(WORKSPACE_ID, db)

    // A member who unsubscribed stays a member — and still must not be here.
    await db
      .update(customShellContacts)
      .set({ status: "unsubscribed" })
      .where(eq(customShellContacts.userId, member.id))

    expect(await countAutomationAudience(audienceOf("everyone"), WORKSPACE_ID, db)).toBe(1)
    expect(
      await countAutomationAudience(audienceOf("registered"), WORKSPACE_ID, db)
    ).toBe(1)
  })

  it("never counts a bounced or complained address", async () => {
    await insertContact("bounced", { status: "bounced" })
    await insertContact("complained", { status: "complained" })

    expect(await countSynced(audienceOf("everyone"))).toBe(1)
  })

  it("keeps other workspaces' contacts out entirely", async () => {
    const timestamp = now()
    await db.insert(customShellWorkspaces).values({
      id: "ws-elsewhere",
      userId: owner.id,
      name: "Elsewhere",
      settings: {},
      isDefault: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await insertContact("theirs", { workspaceId: "ws-elsewhere" })

    expect(await countSynced(audienceOf("everyone"))).toBe(1)
  })

  it("counts only accounts that confirmed their email", async () => {
    await insertUser(db)
    await insertUser(db, { emailVerifiedAt: null })
    await insertUser(db, { emailVerifiedAt: null })
    // An address alone cannot have confirmed an email.
    await insertContact("waitlist")

    expect(await countSynced(audienceOf("registered"))).toBe(2)
    expect(await countSynced(audienceOf("everyone"))).toBe(5)
  })

  it("counts paying members and no one else", async () => {
    const plan = await planFor("pro")
    await insertPayingUser(plan.id)
    // Cancelled, so the plan is over.
    await insertPayingUser(plan.id, { subscriptionStatus: "canceled" })
    // Live status, but the paid period lapsed and no webhook ever said so.
    await insertPayingUser(plan.id, {
      currentPeriodEnd: new Date(now().getTime() - 1000),
    })
    // A subscription with no plan buys nothing.
    await insertPayingUser(null)
    // No subscription at all.
    await insertUser(db)
    // An address alone cannot be paying for anything.
    await insertContact("waitlist")

    expect(await countSynced(audienceOf("paying"))).toBe(1)
  })

  it("counts a trial and an unpaid invoice as still paying", async () => {
    const plan = await planFor("pro")
    await insertPayingUser(plan.id, { subscriptionStatus: "trialing" })
    await insertPayingUser(plan.id, { subscriptionStatus: "past_due" })

    expect(await countSynced(audienceOf("paying"))).toBe(2)
  })

  it("never counts a suspended member, even a paying one", async () => {
    const plan = await planFor("pro")
    await insertPayingUser(plan.id, { userStatus: "suspended" })
    await insertPayingUser(plan.id, { userStatus: "pending_deletion" })
    await insertPayingUser(plan.id)

    expect(await countSynced(audienceOf("paying"))).toBe(1)
  })

  it("counts one plan's members without the other plan's", async () => {
    const pro = await planFor("pro")
    const team = await planFor("team")
    await insertPayingUser(pro.id)
    await insertPayingUser(pro.id)
    await insertPayingUser(team.id)

    expect(await countSynced(audienceOf("plan", "pro"))).toBe(2)
    expect(await countSynced(audienceOf("plan", "team"))).toBe(1)
  })

  it("refuses a plan that no longer exists rather than matching nobody", async () => {
    await planFor("pro")
    await expect(
      countSynced(audienceOf("plan", "gone"))
    ).rejects.toBeInstanceOf(MissingAudiencePlanError)
  })

  it("drops somebody the moment their plan stops running", async () => {
    const plan = await planFor("pro")
    const user = await insertPayingUser(plan.id)
    expect(await countSynced(audienceOf("paying"))).toBe(1)

    // The webhook a cancellation lands as.
    await db
      .update(customShellSubscriptions)
      .set({ status: "canceled" })
      .where(eq(customShellSubscriptions.userId, user.id))
    expect(await countSynced(audienceOf("paying"))).toBe(0)
  })

  it("counts exactly the subscribed people in a segment", async () => {
    await insertContact("in-1")
    await insertContact("in-2")
    await insertContact("out")
    const segment = await staticSegment("Lapsed trials", ["in-1", "in-2"])

    expect(await countSynced(audienceOf("segment", "", segment.id))).toBe(2)
  })

  it("counts a rules segment through the segment's own rules", async () => {
    await insertContact("tagged", { tags: ["beta"] })
    await insertContact("plain")
    const segment = await createWorkspaceSegment(
      WORKSPACE_ID,
      {
        name: "Beta testers",
        description: "",
        kind: "rules",
        rules: {
          conditions: [{ type: "tag", operator: "includes", tags: ["beta"] }],
        },
        contactIds: [],
      },
      db
    )

    expect(await countSynced(audienceOf("segment", "", segment.id))).toBe(1)
  })

  it("leaves an unsubscribed person out of a segment audience", async () => {
    await insertContact("still-in")
    await insertContact("opted-out", { status: "unsubscribed" })
    const segment = await staticSegment("Both", ["still-in", "opted-out"])

    expect(await countSynced(audienceOf("segment", "", segment.id))).toBe(1)
  })

  it("refuses a segment that no longer exists rather than widening", async () => {
    await insertContact("someone")
    await expect(
      countSynced(audienceOf("segment", "", uuid()))
    ).rejects.toBeInstanceOf(MissingAudienceSegmentError)
  })
})

describe("the step the engine runs", () => {
  const runStep = (settings: AutomationNodeSettings) =>
    automationExecutors.audience({
      database: db,
      run: { userId: owner.id } as CustomShellAutomationRun,
      nodeId: "n0",
      settings,
      now,
    })

  it("records how many it matched and carries on", async () => {
    await insertUser(db)
    // An address with no account, which the step must count too.
    await insertContact("waitlist")

    const result = await runStep({ audience: "everyone", planSlug: "" })
    expect(result.type).toBe("next")
    expect(result.summary).toContain("Matched 3 people")
  })

  it("names the segment in the run history", async () => {
    await insertContact("lapsed")
    const segment = await staticSegment("Lapsed trials", ["lapsed"])

    const result = await runStep({
      audience: "segment",
      segmentId: segment.id,
    })
    expect(result.summary).toContain("Matched 1 person")
    expect(result.summary).toContain('the people in the "Lapsed trials" segment')
  })

  it("says nobody matched instead of failing", async () => {
    const result = await runStep({ audience: "paying", planSlug: "" })
    expect(result.type).toBe("next")
    expect(result.summary).toContain("Nobody matched")
  })

  it("fails when the plan it names has gone", async () => {
    await expect(
      runStep({ audience: "plan", planSlug: "gone" })
    ).rejects.toBeInstanceOf(MissingAudiencePlanError)
  })

  it("fails when the segment it points at has been deleted", async () => {
    await expect(
      runStep({ audience: "segment", segmentId: uuid() })
    ).rejects.toBeInstanceOf(MissingAudienceSegmentError)
  })

  // The engine turns a thrown step into a failed run, which is the honest
  // outcome — far better than a flow that was told "paying members" reaching
  // everybody because its settings were unreadable.
  it("fails rather than falling back when the choice is unreadable", async () => {
    await expect(runStep({ audience: "everybody" })).rejects.toThrow(
      /does not say who the flow is about/
    )
  })
})
