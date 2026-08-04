import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { compileAutomationGraph } from "@/lib/automations/compile"
import { EMPTY_AUTOMATION_GRAPH } from "@/lib/automations/graph"
import {
  countAutomationAudience,
  MissingAudiencePlanError,
  readAutomationAudience,
  type AutomationAudience,
} from "@/server/automation-audience"
import { automationExecutors } from "@/server/automation-executors"
import { type CustomShellDb } from "@/server/db"
import {
  customShellPlans,
  customShellSubscriptions,
  type CustomShellAutomationRun,
} from "@/server/schema"
import { now, uuid } from "@/server/security"
import { createTestDatabase, insertUser } from "@/server/test-support"

let client: PGlite
let db: CustomShellDb

beforeEach(async () => {
  const created = await createTestDatabase()
  client = created.client
  db = created.db as unknown as CustomShellDb
})

afterEach(async () => {
  await client.close()
})

const audienceOf = (
  kind: AutomationAudience["kind"],
  planSlug = ""
): AutomationAudience => ({ kind, planSlug })

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
      { kind: "plan", planSlug: "pro" }
    )
    expect(
      readAutomationAudience({ audience: "paying", planSlug: "pro" })
    ).toEqual({ kind: "paying", planSlug: "" })
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
  const graphOf = (settings: Record<string, unknown>) => ({
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

  it("accepts the other choices with no plan", () => {
    expect(
      compileAutomationGraph(graphOf({ audience: "paying", planSlug: "" }))
        .errors
    ).toEqual([])
  })
})

describe("counting who matches", () => {
  it("counts every account, and never a suspended or closing one", async () => {
    await insertUser(db)
    await insertUser(db)
    await insertUser(db, { status: "suspended" })
    await insertUser(db, { status: "pending_deletion", deletedAt: now() })

    expect(await countAutomationAudience(audienceOf("everyone"), db)).toBe(2)
  })

  it("counts only accounts that confirmed their email", async () => {
    await insertUser(db)
    await insertUser(db, { emailVerifiedAt: null })
    await insertUser(db, { emailVerifiedAt: null })

    expect(await countAutomationAudience(audienceOf("registered"), db)).toBe(1)
    expect(await countAutomationAudience(audienceOf("everyone"), db)).toBe(3)
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

    expect(await countAutomationAudience(audienceOf("paying"), db)).toBe(1)
  })

  it("counts a trial and an unpaid invoice as still paying", async () => {
    const plan = await planFor("pro")
    await insertPayingUser(plan.id, { subscriptionStatus: "trialing" })
    await insertPayingUser(plan.id, { subscriptionStatus: "past_due" })

    expect(await countAutomationAudience(audienceOf("paying"), db)).toBe(2)
  })

  it("never counts a suspended member, even a paying one", async () => {
    const plan = await planFor("pro")
    await insertPayingUser(plan.id, { userStatus: "suspended" })
    await insertPayingUser(plan.id, { userStatus: "pending_deletion" })
    await insertPayingUser(plan.id)

    expect(await countAutomationAudience(audienceOf("paying"), db)).toBe(1)
  })

  it("counts one plan's members without the other plan's", async () => {
    const pro = await planFor("pro")
    const team = await planFor("team")
    await insertPayingUser(pro.id)
    await insertPayingUser(pro.id)
    await insertPayingUser(team.id)

    expect(await countAutomationAudience(audienceOf("plan", "pro"), db)).toBe(2)
    expect(await countAutomationAudience(audienceOf("plan", "team"), db)).toBe(1)
  })

  it("refuses a plan that no longer exists rather than matching nobody", async () => {
    await planFor("pro")
    await expect(
      countAutomationAudience(audienceOf("plan", "gone"), db)
    ).rejects.toBeInstanceOf(MissingAudiencePlanError)
  })

  it("drops somebody the moment their plan stops running", async () => {
    const plan = await planFor("pro")
    const user = await insertPayingUser(plan.id)
    expect(await countAutomationAudience(audienceOf("paying"), db)).toBe(1)

    // The webhook a cancellation lands as.
    await db
      .update(customShellSubscriptions)
      .set({ status: "canceled" })
      .where(eq(customShellSubscriptions.userId, user.id))
    expect(await countAutomationAudience(audienceOf("paying"), db)).toBe(0)
  })
})

describe("the step the engine runs", () => {
  const runStep = (settings: Record<string, unknown>) =>
    automationExecutors.audience({
      database: db,
      run: {} as CustomShellAutomationRun,
      nodeId: "n0",
      settings,
      now,
    })

  it("records how many it matched and carries on", async () => {
    await insertUser(db)
    await insertUser(db)

    const result = await runStep({ audience: "everyone", planSlug: "" })
    expect(result.type).toBe("next")
    expect(result.summary).toContain("Matched 2 people")
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

  // The engine turns a thrown step into a failed run, which is the honest
  // outcome — far better than a flow that was told "paying members" reaching
  // everybody because its settings were unreadable.
  it("fails rather than falling back when the choice is unreadable", async () => {
    await insertUser(db)
    await expect(runStep({ audience: "everybody" })).rejects.toThrow(
      /does not say who the flow is about/
    )
  })
})
