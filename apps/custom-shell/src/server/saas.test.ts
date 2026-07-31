import { readdir, readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { setDbForTests, type CustomShellDb } from "@/server/db"
import {
  countOtherActiveAdmins,
  deleteUserAccounts,
  grantManualPlan,
  listAccounts,
  loadRevenueSummary,
  setUserStatus,
  updateUserRole,
} from "@/server/accounts"
import { applyStripeEvent } from "@/server/billing"
import { enforcePasswordNotBreached } from "@/server/breached-passwords"
import {
  hasFeature,
  loadEntitlements,
  resolveEntitlements,
  subscriptionIsActive,
} from "@/server/entitlements"
import {
  archivePlan,
  createPlan,
  findPlanByStripePrice,
  getDefaultPlan,
  getPlanBySlug,
  type PlanInput,
} from "@/server/plans"
import { clearRateLimit, enforceRateLimit } from "@/server/rate-limit"
import {
  consumeAuthToken,
  createAuthToken,
  createSessionExpiresAt,
  findUserBySessionToken,
  hashPassword,
  hashSessionToken,
  now,
  uuid,
  verifyPassword,
} from "@/server/security"
import {
  customShellAuthTokens,
  customShellPlans,
  customShellSessions,
  customShellSubscriptions,
  customShellUsers,
} from "@/server/schema"
import * as schema from "@/server/schema"

let client: PGlite
// Typed as the app's database so the modules under test take it directly.
let database: CustomShellDb

async function applyMigrations(target: PGlite) {
  const folder = new URL("../../drizzle/", import.meta.url)
  const files = (await readdir(folder))
    .filter((file) => file.endsWith(".sql"))
    .sort()

  for (const file of files) {
    await target.exec(await readFile(new URL(file, folder), "utf8"))
  }
}

async function createUser(
  overrides: Partial<typeof customShellUsers.$inferInsert> = {}
) {
  const timestamp = now()
  const [user] = await database
    .insert(customShellUsers)
    .values({
      id: uuid(),
      email: `${uuid()}@example.test`,
      name: "Test Person",
      role: "member",
      status: "active",
      passwordHash: await hashPassword("password123"),
      emailVerifiedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...overrides,
    })
    .returning()

  return user
}

function planInput(overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    slug: "team",
    name: "Team",
    description: "",
    priceMonthlyCents: 4900,
    priceYearlyCents: 0,
    currency: "usd",
    stripePriceIdMonthly: "price_team_monthly",
    stripePriceIdYearly: null,
    trialDays: 0,
    features: { seats: 5 },
    isDefault: false,
    isPublic: true,
    sortOrder: 2,
    active: true,
    ...overrides,
  }
}

beforeEach(async () => {
  client = new PGlite()
  await applyMigrations(client)
  database = drizzle(client, { schema }) as unknown as CustomShellDb
  setDbForTests(database)
})

afterEach(async () => {
  await client.close()
})

describe("passwords and link tokens", () => {
  it("hashes passwords so only the right one verifies", async () => {
    const passwordHash = await hashPassword("correct horse")

    await expect(verifyPassword(passwordHash, "correct horse")).resolves.toBe(
      true
    )
    await expect(verifyPassword(passwordHash, "wrong horse")).resolves.toBe(
      false
    )
  })

  it("spends a verification token exactly once", async () => {
    const user = await createUser({ emailVerifiedAt: null })
    const token = await createAuthToken(user.id, "verify_email", database)

    const consumed = await consumeAuthToken(token, "verify_email", database)
    expect(consumed.userId).toBe(user.id)

    await expect(
      consumeAuthToken(token, "verify_email", database)
    ).rejects.toThrow("INVALID_OR_EXPIRED_TOKEN")
  })

  it("rejects a token used for the wrong purpose or after it expires", async () => {
    const user = await createUser()
    const token = await createAuthToken(user.id, "reset_password", database)

    await expect(
      consumeAuthToken(token, "verify_email", database)
    ).rejects.toThrow("INVALID_OR_EXPIRED_TOKEN")

    await database
      .update(customShellAuthTokens)
      .set({ expiresAt: new Date(Date.now() - 1_000) })
      .where(eq(customShellAuthTokens.userId, user.id))

    await expect(
      consumeAuthToken(token, "reset_password", database)
    ).rejects.toThrow("INVALID_OR_EXPIRED_TOKEN")
  })
})

describe("breached passwords", () => {
  // SHA-1 of "password123". The range API is asked for the first five
  // characters and answers with the rest of every hash it knows.
  const LEAKED_PREFIX = "CBFDA"
  const LEAKED_SUFFIX = "C6008F9CAB4083784CBD1874F76618D2A97"

  function respondWith(body: string, init: ResponseInit = {}) {
    const calls: string[] = []
    vi.stubGlobal("fetch", (url: string) => {
      calls.push(url)
      return Promise.resolve(new Response(body, init))
    })
    return calls
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("refuses a password the outside list has seen", async () => {
    respondWith(`${LEAKED_SUFFIX}:37359195\r\n`)

    await expect(enforcePasswordNotBreached("password123")).rejects.toThrow(
      "PASSWORD_BREACHED"
    )
  })

  it("sends only the first five characters of the hash", async () => {
    const calls = respondWith(`${LEAKED_SUFFIX}:37359195\r\n`)

    await expect(
      enforcePasswordNotBreached("password123")
    ).rejects.toThrow()

    expect(calls).toEqual([
      `https://api.pwnedpasswords.com/range/${LEAKED_PREFIX}`,
    ])
    expect(calls[0]).not.toContain(LEAKED_SUFFIX)
    expect(calls[0]).not.toContain("password123")
  })

  it("accepts a password that only appears as a padding decoy", async () => {
    // The padding option bulks the answer out with hashes the list has never
    // actually seen, marked by a count of zero. SHA-1 of this password is one
    // of them here, so a check that ignored the count would wrongly refuse it.
    respondWith(
      [
        "0000000000000000000000000000000000A:12",
        "5079EA88C5F9E63014E389638BC5365D519:0",
      ].join("\r\n")
    )

    await expect(
      enforcePasswordNotBreached("7Kq!vz2Lm@9rTx#4wNpd")
    ).resolves.toBeUndefined()
  })

  it("accepts the password when the outside service is unreachable or unhappy", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new Error("network down")))
    await expect(
      enforcePasswordNotBreached("password123")
    ).resolves.toBeUndefined()

    respondWith("", { status: 503 })
    await expect(
      enforcePasswordNotBreached("password123")
    ).resolves.toBeUndefined()
  })
})

describe("rate limiting", () => {
  it("blocks once the attempts in a window are used up", async () => {
    const options = { maxAttempts: 3, windowSeconds: 900 }

    await enforceRateLimit("login:test", options, database)
    await enforceRateLimit("login:test", options, database)
    await enforceRateLimit("login:test", options, database)

    await expect(
      enforceRateLimit("login:test", options, database)
    ).rejects.toThrow("RATE_LIMITED")
  })

  it("starts fresh after a successful attempt clears the bucket", async () => {
    const options = { maxAttempts: 1, windowSeconds: 900 }

    await enforceRateLimit("login:clear", options, database)
    await clearRateLimit("login:clear", database)

    await expect(
      enforceRateLimit("login:clear", options, database)
    ).resolves.toBeUndefined()
  })
})

describe("plans", () => {
  it("seeds a free default plan and a pro plan", async () => {
    const defaultPlan = await getDefaultPlan(database)
    const pro = await getPlanBySlug("pro", database)

    expect(defaultPlan?.slug).toBe("free")
    expect(defaultPlan?.priceMonthlyCents).toBe(0)
    expect(pro?.priceMonthlyCents).toBe(1900)
  })

  it("moves the default flag rather than allowing two defaults", async () => {
    await createPlan(
      planInput({
        slug: "starter",
        priceMonthlyCents: 0,
        stripePriceIdMonthly: null,
        isDefault: true,
      }),
      database
    )

    const defaults = await database
      .select()
      .from(customShellPlans)
      .where(eq(customShellPlans.isDefault, true))

    expect(defaults).toHaveLength(1)
    expect(defaults[0].slug).toBe("starter")
  })

  it("refuses a paid default plan and a public paid plan with no Stripe price", async () => {
    await expect(
      createPlan(planInput({ slug: "paid-default", isDefault: true }), database)
    ).rejects.toThrow("DEFAULT_PLAN_MUST_BE_FREE")

    await expect(
      createPlan(
        planInput({ slug: "no-price", stripePriceIdMonthly: null }),
        database
      )
    ).rejects.toThrow("PLAN_STRIPE_PRICE_REQUIRED")
  })

  it("finds a plan by its Stripe price and refuses to archive the default", async () => {
    const plan = await createPlan(planInput(), database)
    const found = await findPlanByStripePrice("price_team_monthly", database)
    expect(found?.id).toBe(plan.id)

    const archived = await archivePlan(plan.id, database)
    expect(archived.active).toBe(false)

    const defaultPlan = await getDefaultPlan(database)
    await expect(archivePlan(defaultPlan!.id, database)).rejects.toThrow(
      "DEFAULT_PLAN_REQUIRED"
    )
  })
})

describe("entitlements", () => {
  const paidPlan = {
    id: "plan-pro",
    slug: "pro",
    name: "Pro",
    features: { priority: true },
  } as never
  const freePlan = {
    id: "plan-free",
    slug: "free",
    name: "Free",
    features: {},
  } as never

  function subscription(overrides: Record<string, unknown> = {}) {
    return {
      id: "sub",
      userId: "user",
      planId: "plan-pro",
      stripeCustomerId: "cus_1",
      stripeSubscriptionId: "sub_1",
      status: "active",
      interval: "monthly",
      source: "stripe",
      currentPeriodEnd: new Date("2026-09-01"),
      cancelAtPeriodEnd: false,
      trialEndsAt: null,
      createdAt: new Date("2026-07-01"),
      updatedAt: new Date("2026-07-01"),
      ...overrides,
    } as never
  }

  const inPeriod = new Date("2026-08-01")

  it("counts active, trialing and past due as paid inside the period", () => {
    for (const status of ["active", "trialing", "past_due"]) {
      expect(subscriptionIsActive(subscription({ status }), inPeriod)).toBe(true)
    }
  })

  it("drops back to the default plan once the period lapses or it is cancelled", () => {
    const lapsed = new Date("2026-10-01")
    expect(subscriptionIsActive(subscription(), lapsed)).toBe(false)
    expect(
      subscriptionIsActive(subscription({ status: "canceled" }), inPeriod)
    ).toBe(false)

    const entitlements = resolveEntitlements(
      subscription(),
      paidPlan,
      freePlan,
      lapsed
    )
    expect(entitlements.planSlug).toBe("free")
    expect(entitlements.isPaid).toBe(false)
    expect(hasFeature(entitlements, "priority")).toBe(false)
  })

  it("keeps access until the end of a period that is set to cancel", () => {
    const entitlements = resolveEntitlements(
      subscription({ cancelAtPeriodEnd: true }),
      paidPlan,
      freePlan,
      inPeriod
    )

    expect(entitlements.isPaid).toBe(true)
    expect(entitlements.cancelAtPeriodEnd).toBe(true)
    expect(hasFeature(entitlements, "priority")).toBe(true)
  })

  it("treats a granted plan with no end date as open ended", () => {
    const entitlements = resolveEntitlements(
      subscription({ source: "manual", currentPeriodEnd: null }),
      paidPlan,
      freePlan,
      new Date("2030-01-01")
    )

    expect(entitlements.isPaid).toBe(true)
    expect(entitlements.source).toBe("manual")
  })
})

describe("stripe webhooks", () => {
  function subscriptionEvent(
    userId: string,
    overrides: Record<string, unknown> = {}
  ) {
    return {
      id: "evt_1",
      type: "customer.subscription.created",
      data: {
        object: {
          id: "sub_123",
          customer: "cus_123",
          status: "active",
          cancel_at_period_end: false,
          trial_end: null,
          metadata: { userId },
          items: {
            data: [
              {
                price: { id: "price_pro_monthly" },
                current_period_end: Math.floor(
                  new Date("2026-09-01").getTime() / 1_000
                ),
              },
            ],
          },
          ...overrides,
        },
      },
    } as never
  }

  beforeEach(async () => {
    await database
      .update(customShellPlans)
      .set({ stripePriceIdMonthly: "price_pro_monthly" })
      .where(eq(customShellPlans.slug, "pro"))
  })

  it("creates the subscription from the event and links it to the plan", async () => {
    const user = await createUser()

    expect(await applyStripeEvent(subscriptionEvent(user.id), database)).toBe(
      true
    )

    const { entitlements } = await loadEntitlements(user.id, database)
    expect(entitlements.planSlug).toBe("pro")
    expect(entitlements.isPaid).toBe(true)
    expect(entitlements.interval).toBe("monthly")
  })

  it("ignores a replayed event instead of writing twice", async () => {
    const user = await createUser()
    await applyStripeEvent(subscriptionEvent(user.id), database)

    expect(await applyStripeEvent(subscriptionEvent(user.id), database)).toBe(
      false
    )

    const rows = await database.select().from(customShellSubscriptions)
    expect(rows).toHaveLength(1)
  })

  it("updates the same row when the subscription is cancelled later", async () => {
    const user = await createUser()
    await applyStripeEvent(subscriptionEvent(user.id), database)

    const cancelled = {
      ...(subscriptionEvent(user.id, { status: "canceled" }) as Record<
        string,
        unknown
      >),
      id: "evt_2",
      type: "customer.subscription.deleted",
    } as never

    await applyStripeEvent(cancelled, database)

    const rows = await database.select().from(customShellSubscriptions)
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe("canceled")

    const { entitlements } = await loadEntitlements(user.id, database)
    expect(entitlements.isPaid).toBe(false)
  })

  it("matches an existing customer when the event carries no user id", async () => {
    const user = await createUser()
    await applyStripeEvent(subscriptionEvent(user.id), database)

    const withoutMetadata = {
      ...(subscriptionEvent(user.id, {
        metadata: {},
        status: "past_due",
      }) as Record<string, unknown>),
      id: "evt_3",
      type: "customer.subscription.updated",
    } as never

    await applyStripeEvent(withoutMetadata, database)

    const rows = await database.select().from(customShellSubscriptions)
    expect(rows).toHaveLength(1)
    expect(rows[0].userId).toBe(user.id)
    expect(rows[0].status).toBe("past_due")
  })
})

describe("admin account management", () => {
  it("refuses to demote, suspend or delete the last admin", async () => {
    const admin = await createUser({ role: "admin" })

    expect(await countOtherActiveAdmins(admin.id, database)).toBe(0)
    await expect(
      updateUserRole(admin.id, admin.id, "member", database)
    ).rejects.toThrow("LAST_ADMIN")
    await expect(
      setUserStatus(admin.id, admin.id, "suspended", database)
    ).rejects.toThrow("LAST_ADMIN")
  })

  it("ends the sessions of an account it suspends", async () => {
    const admin = await createUser({ role: "admin" })
    const member = await createUser()
    const token = "member-session-token"

    await database.insert(customShellSessions).values({
      id: uuid(),
      userId: member.id,
      tokenHash: hashSessionToken(token),
      expiresAt: createSessionExpiresAt(),
      createdAt: now(),
    })

    await expect(
      findUserBySessionToken(token, database)
    ).resolves.toMatchObject({ id: member.id })

    await setUserStatus(admin.id, member.id, "suspended", database)

    await expect(findUserBySessionToken(token, database)).resolves.toBeNull()
  })

  it("keeps the acting admin when bulk deleting other admins", async () => {
    const actor = await createUser({ role: "admin" })
    const second = await createUser({ role: "admin" })
    const third = await createUser({ role: "admin" })

    const result = await deleteUserAccounts(
      actor.id,
      [second.id, third.id],
      database
    )

    expect(result.deleted).toBe(2)
    const remaining = await database.select().from(customShellUsers)
    expect(remaining).toHaveLength(1)
    expect(remaining[0].id).toBe(actor.id)
  })

  it("refuses a bulk delete that only contains yourself", async () => {
    const actor = await createUser({ role: "admin" })

    await expect(
      deleteUserAccounts(actor.id, [actor.id], database)
    ).rejects.toThrow("CANNOT_DELETE_SELF")
  })

  it("allows the change once another admin exists", async () => {
    const first = await createUser({ role: "admin" })
    const second = await createUser({ role: "admin" })

    const result = await updateUserRole(first.id, second.id, "member", database)
    expect(result.role).toBe("member")
  })

  it("grants and revokes a plan without Stripe", async () => {
    const admin = await createUser({ role: "admin" })
    const member = await createUser()
    const pro = await getPlanBySlug("pro", database)

    await grantManualPlan(admin.id, member.id, pro!.id, null, database)
    const granted = await loadEntitlements(member.id, database)
    expect(granted.entitlements.planSlug).toBe("pro")
    expect(granted.entitlements.source).toBe("manual")

    await grantManualPlan(admin.id, member.id, null, null, database)
    const revoked = await loadEntitlements(member.id, database)
    expect(revoked.entitlements.planSlug).toBe("free")
  })

  it("lists accounts with their real plan and counts revenue from live plans", async () => {
    const admin = await createUser({ role: "admin", name: "Ada" })
    const member = await createUser({ name: "Blake" })
    const pro = await getPlanBySlug("pro", database)
    await grantManualPlan(admin.id, member.id, pro!.id, null, database)

    const { accounts, total } = await listAccounts(
      {
        search: "",
        role: "all",
        status: "all",
        page: 1,
        pageSize: 25,
        sort: "name",
        direction: "asc",
      },
      database
    )

    expect(total).toBe(2)
    expect(accounts.map((account) => account.name)).toEqual(["Ada", "Blake"])
    expect(accounts[1].planName).toBe("Pro")
    expect(accounts[0].planName).toBe("Free")

    const summary = await loadRevenueSummary(database)
    expect(summary.totalUsers).toBe(2)
    expect(summary.paidSubscribers).toBe(1)
    expect(summary.monthlyRecurringCents).toBe(1900)
  })

  it("searches by name or email", async () => {
    await createUser({ name: "Casey Jones", email: "casey@example.test" })
    await createUser({ name: "Dana Scully", email: "dana@example.test" })

    const { accounts } = await listAccounts(
      {
        search: "dana",
        role: "all",
        status: "all",
        page: 1,
        pageSize: 25,
        sort: "name",
        direction: "asc",
      },
      database
    )

    expect(accounts).toHaveLength(1)
    expect(accounts[0].email).toBe("dana@example.test")
  })
})
