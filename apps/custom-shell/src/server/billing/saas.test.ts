import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ACCOUNT_RESTORE_DAYS } from "@/lib/account-deletion"
import { describeSubscriptionEvent } from "@/lib/subscription-events"
import {
  markAccountsForDeletion,
  purgeExpiredDeletions,
  restoreOwnAccount,
} from "@/server/people/account-deletion"
import { type CustomShellDb } from "@/server/db"
import { createTestDatabase, insertUser } from "@/server/test-support"
import {
  countOtherActiveAdmins,
  createAccountByAdmin,
  deleteUserAccounts,
  grantManualPlan,
  listAccounts,
  loadRevenueSummary,
  restoreUserAccounts,
  setUserStatus,
  updateUserRole,
} from "@/server/people/accounts"
import {
  applyStripeEvent,
  cancelSubscriptionByAdmin,
  findExpiringCard,
  trialDaysFor,
} from "@/server/billing/stripe"
import { enforcePasswordNotBreached } from "@/server/auth/breached-passwords"
import {
  enforceDeliverableEmail,
  type MailDnsResolver,
} from "@/server/email/deliverability"
import {
  hasFeature,
  loadEntitlements,
  resolveEntitlements,
  subscriptionIsActive,
} from "@/server/billing/entitlements"
import {
  archivePlan,
  archivePlans,
  createPlan,
  findPlanByStripePrice,
  getDefaultPlan,
  getPlanBySlug,
  type PlanInput,
} from "@/server/billing/plans"
import { clearRateLimit, enforceRateLimit } from "@/server/auth/rate-limit"
import { listSubscriptionEvents } from "@/server/billing/subscription-events"
import { enforceHumanCheck, getHumanCheckSiteKey } from "@/server/auth/turnstile"
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
} from "@/server/auth/security"
import {
  customShellAuthTokens,
  customShellPlans,
  customShellSessions,
  customShellSubscriptions,
  customShellUsers,
  type CustomShellPlan,
} from "@/server/schema"

let client: PGlite
// Typed as the app's database so the modules under test take it directly.
let database: CustomShellDb

async function createUser(
  overrides: Partial<typeof customShellUsers.$inferInsert> = {}
) {
  // This file's accounts carry a working password, unlike the shared default.
  return insertUser(database, {
    passwordHash: await hashPassword("password123"),
    ...overrides,
  })
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
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db as unknown as CustomShellDb
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

describe("undeliverable addresses", () => {
  // A DNS error the way node's resolver raises it: the code carries the
  // meaning, not the message.
  function dnsError(code: string) {
    const error = new Error(code)
    ;(error as Error & { code: string }).code = code
    return error
  }

  function fakeDns(overrides: Partial<MailDnsResolver> = {}): MailDnsResolver {
    return {
      resolveMx: () => Promise.reject(dnsError("ENOTFOUND")),
      resolve4: () => Promise.reject(dnsError("ENOTFOUND")),
      resolve6: () => Promise.reject(dnsError("ENOTFOUND")),
      ...overrides,
    }
  }

  it("accepts a domain with a mail server", async () => {
    const dns = fakeDns({
      resolveMx: () =>
        Promise.resolve([{ exchange: "mx.example.com", priority: 10 }]),
    })

    await expect(
      enforceDeliverableEmail("person@example.com", dns)
    ).resolves.toBeUndefined()
  })

  it("refuses a domain that does not exist", async () => {
    await expect(
      enforceDeliverableEmail("person@no-such-domain-anywhere.example", fakeDns())
    ).rejects.toThrow("EMAIL_NO_MAILBOX")
  })

  it("accepts a domain with no mail server record but a plain address", async () => {
    // Mail falls back to the domain's ordinary address record, so this domain
    // can still receive it.
    const dns = fakeDns({
      resolveMx: () => Promise.reject(dnsError("ENODATA")),
      resolve4: () => Promise.resolve(["93.184.216.34"]),
    })

    await expect(
      enforceDeliverableEmail("person@example.com", dns)
    ).resolves.toBeUndefined()
  })

  it("refuses a domain that has published it takes no mail", async () => {
    // A single record pointing at "." is the standard way a domain says it
    // accepts no mail at all, even though the domain itself exists.
    const dns = fakeDns({
      resolveMx: () => Promise.resolve([{ exchange: ".", priority: 0 }]),
      resolve4: () => Promise.resolve(["93.184.216.34"]),
    })

    await expect(
      enforceDeliverableEmail("person@example.com", dns)
    ).rejects.toThrow("EMAIL_NO_MAILBOX")
  })

  it("refuses a throwaway provider without asking DNS at all", async () => {
    const calls: string[] = []
    const dns = fakeDns({
      resolveMx: (domain) => {
        calls.push(domain)
        return Promise.reject(dnsError("ENOTFOUND"))
      },
    })

    await expect(
      enforceDeliverableEmail("person@mailinator.com", dns)
    ).rejects.toThrow("EMAIL_THROWAWAY")
    await expect(
      enforceDeliverableEmail("person@anything.yopmail.com", dns)
    ).rejects.toThrow("EMAIL_THROWAWAY")
    expect(calls).toEqual([])
  })

  it("accepts the address when DNS itself is down", async () => {
    // Fail open: a slow or broken resolver must never block a real person.
    const dns = fakeDns({
      resolveMx: () => Promise.reject(dnsError("ETIMEOUT")),
    })

    await expect(
      enforceDeliverableEmail("person@example.com", dns)
    ).resolves.toBeUndefined()
  })
})

describe("human check", () => {
  const SITE_KEY = "1x00000000000000000000AA"
  const SECRET_KEY = "1x0000000000000000000000000000000AA"

  type FetchCall = { url: string; body: string }

  function configureKeys() {
    process.env.CUSTOM_SHELL_TURNSTILE_SITE_KEY = SITE_KEY
    process.env.CUSTOM_SHELL_TURNSTILE_SECRET_KEY = SECRET_KEY
  }

  function respondWith(verdict: unknown, init: ResponseInit = {}) {
    const calls: FetchCall[] = []
    vi.stubGlobal("fetch", (url: string, options: RequestInit) => {
      calls.push({ url, body: String(options.body) })
      return Promise.resolve(new Response(JSON.stringify(verdict), init))
    })
    return calls
  }

  afterEach(() => {
    vi.unstubAllGlobals()
    delete process.env.CUSTOM_SHELL_TURNSTILE_SITE_KEY
    delete process.env.CUSTOM_SHELL_TURNSTILE_SECRET_KEY
  })

  it("is switched off, and never calls out, when the keys are unset", async () => {
    const calls = respondWith({ success: false })

    expect(getHumanCheckSiteKey()).toBeNull()
    await expect(enforceHumanCheck(undefined)).resolves.toBeUndefined()
    expect(calls).toEqual([])
  })

  it("stays off when only one of the two keys is set", async () => {
    process.env.CUSTOM_SHELL_TURNSTILE_SITE_KEY = SITE_KEY
    const calls = respondWith({ success: false })

    // A site key with no secret would put a widget on the form whose answer
    // this server has no way to check.
    expect(getHumanCheckSiteKey()).toBeNull()
    await expect(enforceHumanCheck(undefined)).resolves.toBeUndefined()
    expect(calls).toEqual([])
  })

  it("accepts the request when Cloudflare confirms the answer", async () => {
    configureKeys()
    const calls = respondWith({ success: true })

    await expect(enforceHumanCheck("widget-answer")).resolves.toBeUndefined()
    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe(
      "https://challenges.cloudflare.com/turnstile/v0/siteverify"
    )
    expect(calls[0].body).toContain("response=widget-answer")
  })

  it("refuses when the form sent no answer at all", async () => {
    configureKeys()
    const calls = respondWith({ success: true })

    await expect(enforceHumanCheck(undefined)).rejects.toThrow(
      "HUMAN_CHECK_FAILED"
    )
    // Refused here, without troubling Cloudflare over an empty answer.
    expect(calls).toEqual([])
  })

  it("refuses when Cloudflare rejects the answer", async () => {
    configureKeys()
    respondWith({ success: false, "error-codes": ["invalid-input-response"] })

    await expect(enforceHumanCheck("stale-answer")).rejects.toThrow(
      "HUMAN_CHECK_FAILED"
    )
  })

  it("refuses when Cloudflare is unreachable or unhappy", async () => {
    configureKeys()

    // Fails closed, unlike the breached-password check: an unreachable guard
    // that waves everyone through is the opening a bot is waiting for.
    vi.stubGlobal("fetch", () => Promise.reject(new Error("network down")))
    await expect(enforceHumanCheck("widget-answer")).rejects.toThrow(
      "HUMAN_CHECK_FAILED"
    )

    respondWith({}, { status: 503 })
    await expect(enforceHumanCheck("widget-answer")).rejects.toThrow(
      "HUMAN_CHECK_FAILED"
    )
  })

  it("hands the browser the site key only, never the secret", async () => {
    configureKeys()
    expect(getHumanCheckSiteKey()).toBe(SITE_KEY)
    expect(getHumanCheckSiteKey()).not.toBe(SECRET_KEY)
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

  // The table's Archive (n) sends the whole selection in one request, so the
  // guard that protects a single archive has to hold for the batch too, and the
  // caller has to be told exactly what went through.
  it("archives a whole selection in one pass and leaves the default plan alone", async () => {
    const team = await createPlan(planInput(), database)
    const starter = await createPlan(
      planInput({
        slug: "starter",
        stripePriceIdMonthly: "price_starter_monthly",
      }),
      database
    )
    const defaultPlan = await getDefaultPlan(database)

    const result = await archivePlans(
      [team.id, starter.id, defaultPlan!.id],
      database
    )
    expect([...result.archived].sort()).toEqual([team.id, starter.id].sort())
    expect(result.kept).toEqual([defaultPlan!.id])
    expect((await getPlanBySlug("team", database))?.active).toBe(false)
    expect((await getPlanBySlug("free", database))?.active).toBe(true)

    // Running it again takes nothing: those two are already archived.
    await expect(
      archivePlans([team.id, starter.id], database)
    ).resolves.toEqual({ archived: [], kept: [team.id, starter.id] })
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

  describe("one free trial per person", () => {
    const trialStart = new Date("2026-08-01T00:00:00.000Z")

    /** The event a trial arrives on, with Stripe's own start and end dates. */
    function trialEvent(userId: string, overrides: Record<string, unknown> = {}) {
      return subscriptionEvent(userId, {
        status: "trialing",
        trial_start: Math.floor(trialStart.getTime() / 1_000),
        trial_end: Math.floor(new Date("2026-08-15").getTime() / 1_000),
        ...overrides,
      })
    }

    async function firstTrialOf(userId: string) {
      const [row] = await database
        .select({ firstTrialAt: customShellUsers.firstTrialAt })
        .from(customShellUsers)
        .where(eq(customShellUsers.id, userId))

      return row.firstTrialAt
    }

    it("writes the trial down the day it starts, not the day it was delivered", async () => {
      const user = await createUser()
      expect(await firstTrialOf(user.id)).toBeNull()

      await applyStripeEvent(trialEvent(user.id), database)

      expect(await firstTrialOf(user.id)).toEqual(trialStart)
    })

    it("leaves the first date alone when a later trial arrives", async () => {
      const user = await createUser()
      await applyStripeEvent(trialEvent(user.id), database)

      // Cancel, come back, and Stripe starts a second trial — which is exactly
      // the loop this feature closes. The date must not move.
      const laterTrial = {
        ...(trialEvent(user.id, {
          id: "sub_456",
          trial_start: Math.floor(new Date("2026-11-01").getTime() / 1_000),
        }) as Record<string, unknown>),
        id: "evt_later",
        type: "customer.subscription.updated",
      } as never

      await applyStripeEvent(laterTrial, database)

      expect(await firstTrialOf(user.id)).toEqual(trialStart)
    })

    it("does not spend the trial on a subscription that never had one", async () => {
      const user = await createUser()

      await applyStripeEvent(subscriptionEvent(user.id), database)

      expect(await firstTrialOf(user.id)).toBeNull()
    })

    it("gives the plan's trial to a first-timer and none to a returner", () => {
      const plan = { trialDays: 14 } as CustomShellPlan

      expect(trialDaysFor({ firstTrialAt: null }, plan)).toBe(14)
      expect(trialDaysFor({ firstTrialAt: trialStart }, plan)).toBe(0)
    })

    it("leaves a plan that never offered a trial exactly as it was", () => {
      const plan = { trialDays: 0 } as CustomShellPlan

      expect(trialDaysFor({ firstTrialAt: null }, plan)).toBe(0)
      expect(trialDaysFor({ firstTrialAt: trialStart }, plan)).toBe(0)
    })
  })
})

const periodEndSeconds = Math.floor(new Date("2027-01-01").getTime() / 1_000)

/** What Stripe answers after a cancel call, shaped like its real payloads. */
function stripeAnswer(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_cancel",
    status: "active",
    cancel_at_period_end: true,
    items: { data: [{ current_period_end: periodEndSeconds }] },
    ...overrides,
  } as never
}

const neverCallsStripe = {
  cancelNow: () => {
    throw new Error("stripe was called")
  },
  stopRenewal: () => {
    throw new Error("stripe was called")
  },
}

async function seedStripeSubscription(
  userId: string,
  overrides: Partial<typeof customShellSubscriptions.$inferInsert> = {}
) {
  const plan = await getPlanBySlug("pro", database)
  const timestamp = now()
  const [row] = await database
    .insert(customShellSubscriptions)
    .values({
      id: uuid(),
      userId,
      planId: plan!.id,
      stripeCustomerId: `cus_${userId.slice(0, 8)}`,
      stripeSubscriptionId: "sub_cancel",
      status: "active",
      interval: "monthly",
      source: "stripe",
      currentPeriodEnd: new Date("2027-01-01"),
      cancelAtPeriodEnd: false,
      createdAt: timestamp,
      updatedAt: timestamp,
      ...overrides,
    })
    .returning()

  return row
}

describe("admin cancels subscriptions", () => {
  it("stops the renewal at period end and keeps access until then", async () => {
    const user = await createUser()
    await seedStripeSubscription(user.id)

    const result = await cancelSubscriptionByAdmin(
      user.id,
      "period_end",
      database,
      {
        ...neverCallsStripe,
        stopRenewal: async () => stripeAnswer(),
      }
    )

    expect(result.mode).toBe("period_end")
    expect(result.endsAt).toBe(new Date("2027-01-01").toISOString())

    const { entitlements } = await loadEntitlements(user.id, database)
    expect(entitlements.isPaid).toBe(true)
    expect(entitlements.cancelAtPeriodEnd).toBe(true)
  })

  it("ends it immediately and drops them to the free plan", async () => {
    const user = await createUser()
    await seedStripeSubscription(user.id)

    const result = await cancelSubscriptionByAdmin(
      user.id,
      "immediate",
      database,
      {
        ...neverCallsStripe,
        cancelNow: async () =>
          stripeAnswer({ status: "canceled", cancel_at_period_end: false }),
      }
    )

    expect(result.endsAt).toBeNull()

    const { entitlements } = await loadEntitlements(user.id, database)
    expect(entitlements.isPaid).toBe(false)
    expect(entitlements.planSlug).toBe("free")
  })

  it("ends a granted plan without talking to Stripe", async () => {
    const user = await createUser()
    const plan = await getPlanBySlug("pro", database)
    await grantManualPlan(user.id, plan!.id, null, database)

    const result = await cancelSubscriptionByAdmin(
      user.id,
      "period_end",
      database,
      neverCallsStripe
    )

    // A grant has no billing period, so whichever mode was asked for it ends now.
    expect(result.mode).toBe("immediate")

    const rows = await database
      .select()
      .from(customShellSubscriptions)
      .where(eq(customShellSubscriptions.userId, user.id))
    expect(rows).toHaveLength(0)
  })

  it("refuses a second period-end cancel but still allows ending it now", async () => {
    const user = await createUser()
    await seedStripeSubscription(user.id, { cancelAtPeriodEnd: true })

    await expect(
      cancelSubscriptionByAdmin(user.id, "period_end", database, neverCallsStripe)
    ).rejects.toThrow("ALREADY_ENDING")

    const result = await cancelSubscriptionByAdmin(
      user.id,
      "immediate",
      database,
      {
        ...neverCallsStripe,
        cancelNow: async () =>
          stripeAnswer({ status: "canceled", cancel_at_period_end: false }),
      }
    )
    expect(result.mode).toBe("immediate")
  })

  it("says so when there is nothing to cancel", async () => {
    const user = await createUser()

    await expect(
      cancelSubscriptionByAdmin(user.id, "period_end", database, neverCallsStripe)
    ).rejects.toThrow("SUBSCRIPTION_NOT_FOUND")

    // A subscription that already ran out is nothing to cancel either.
    await seedStripeSubscription(user.id, { status: "canceled" })
    await expect(
      cancelSubscriptionByAdmin(user.id, "immediate", database, neverCallsStripe)
    ).rejects.toThrow("SUBSCRIPTION_NOT_FOUND")
  })
})

describe("billing history", () => {
  /** A Stripe subscription event, shaped like the real payloads. */
  function event(
    userId: string,
    {
      id = "evt_1",
      type = "customer.subscription.updated",
      price = "price_pro_monthly",
      ...overrides
    }: Record<string, unknown> = {}
  ) {
    return {
      id,
      type,
      data: {
        object: {
          id: "sub_history",
          customer: "cus_history",
          status: "active",
          cancel_at_period_end: false,
          trial_end: null,
          metadata: { userId },
          items: {
            data: [
              {
                price: { id: price },
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

  async function historyOf(userId: string) {
    return listSubscriptionEvents(userId, database)
  }

  beforeEach(async () => {
    await database
      .update(customShellPlans)
      .set({ stripePriceIdMonthly: "price_pro_monthly" })
      .where(eq(customShellPlans.slug, "pro"))
  })

  it("records the first subscription once, however often it is delivered", async () => {
    const user = await createUser()

    await applyStripeEvent(
      event(user.id, { type: "customer.subscription.created" }),
      database
    )
    // The same delivery again, which is what Stripe's "resend" button does.
    await applyStripeEvent(
      event(user.id, { type: "customer.subscription.created" }),
      database
    )

    const history = await historyOf(user.id)
    expect(history).toHaveLength(1)
    expect(history[0].kind).toBe("subscribed")
    expect(history[0].planName).toBe("Pro")
    expect(describeSubscriptionEvent(history[0])).toBe("Subscribed to Pro.")
  })

  it("records a trial as a trial, not as a subscription", async () => {
    const user = await createUser()

    await applyStripeEvent(
      event(user.id, {
        type: "customer.subscription.created",
        status: "trialing",
      }),
      database
    )

    const [first] = await historyOf(user.id)
    expect(first.kind).toBe("trial_started")

    // The trial running out and the plan starting to be paid for is its own
    // moment, not a second "subscribed".
    await applyStripeEvent(event(user.id, { id: "evt_2" }), database)

    const history = await historyOf(user.id)
    expect(history.map((row) => row.kind)).toEqual([
      "trial_converted",
      "trial_started",
    ])
  })

  it("names both plans when someone switches", async () => {
    const user = await createUser()
    await createPlan(planInput(), database)
    await applyStripeEvent(
      event(user.id, { type: "customer.subscription.created" }),
      database
    )

    await applyStripeEvent(
      event(user.id, { id: "evt_2", price: "price_team_monthly" }),
      database
    )

    const [latest] = await historyOf(user.id)
    expect(latest.kind).toBe("plan_changed")
    expect(describeSubscriptionEvent(latest)).toBe("Switched from Pro to Team.")
  })

  it("records a failed payment and the payment that puts it right", async () => {
    const user = await createUser()
    await applyStripeEvent(
      event(user.id, { type: "customer.subscription.created" }),
      database
    )

    await applyStripeEvent(
      event(user.id, { id: "evt_2", status: "past_due" }),
      database
    )
    await applyStripeEvent(event(user.id, { id: "evt_3" }), database)

    const history = await historyOf(user.id)
    expect(history.map((row) => row.kind)).toEqual([
      "payment_recovered",
      "payment_failed",
      "subscribed",
    ])
  })

  it("records a comp plan turning into a paid one", async () => {
    const user = await createUser()
    const plan = await getPlanBySlug("pro", database)
    await grantManualPlan(user.id, plan!.id, null, database)

    // The same plan, now actually being paid for: nothing about the row changes
    // except who is paying, and that is the whole event.
    await applyStripeEvent(
      event(user.id, { type: "customer.subscription.created" }),
      database
    )

    const history = await historyOf(user.id)
    expect(history.map((row) => row.kind)).toEqual([
      "subscribed",
      "plan_granted",
    ])
    expect(history[0].source).toBe("stripe")
  })

  it("says nothing about a renewal, because nothing changed", async () => {
    const user = await createUser()
    await applyStripeEvent(
      event(user.id, { type: "customer.subscription.created" }),
      database
    )

    // A new billing period on the same plan: a real Stripe event, and not a
    // thing that happened to the person.
    await applyStripeEvent(event(user.id, { id: "evt_2" }), database)

    expect(await historyOf(user.id)).toHaveLength(1)
  })

  it("credits an admin cancel to the admin and does not repeat it for Stripe", async () => {
    const user = await createUser()
    await seedStripeSubscription(user.id, {
      stripeCustomerId: "cus_history",
      stripeSubscriptionId: "sub_history",
    })

    // Midday, not midnight: the sentence names the day in the reader's own
    // timezone, so a moment on the stroke of midnight UTC would read as the day
    // before for anyone west of Greenwich, this machine included.
    const endsAt = new Date(2027, 0, 1, 12)
    await cancelSubscriptionByAdmin(user.id, "period_end", database, {
      ...neverCallsStripe,
      stopRenewal: async () =>
        stripeAnswer({
          items: {
            data: [{ current_period_end: Math.floor(endsAt.getTime() / 1_000) }],
          },
        }),
    })

    const [afterCancel] = await historyOf(user.id)
    expect(afterCancel.kind).toBe("cancel_scheduled")
    expect(afterCancel.source).toBe("admin")
    expect(describeSubscriptionEvent(afterCancel)).toBe(
      "An admin set Pro to end on Jan 1, 2027, with no renewal."
    )

    // Stripe's own event for the same cancel arrives afterwards and finds the
    // row already saying it, so it adds nothing.
    await applyStripeEvent(
      event(user.id, { id: "evt_after", cancel_at_period_end: true }),
      database
    )

    expect(await historyOf(user.id)).toHaveLength(1)
  })

  it("records a granted plan and its removal", async () => {
    const user = await createUser()
    const plan = await getPlanBySlug("pro", database)

    // Midday for the same reason the cancel test uses it.
    await grantManualPlan(user.id, plan!.id, new Date(2027, 2, 1, 12), database)
    await grantManualPlan(user.id, null, null, database)
    // Removing a grant that was never there changed nothing, so it says nothing.
    await grantManualPlan(user.id, null, null, database)

    const history = await historyOf(user.id)
    expect(history.map((row) => row.kind)).toEqual([
      "grant_removed",
      "plan_granted",
    ])
    expect(history.every((row) => row.source === "admin")).toBe(true)
    expect(describeSubscriptionEvent(history[1])).toBe(
      "An admin granted Pro until Mar 1, 2027."
    )
  })

  it("goes when the account goes", async () => {
    const user = await createUser()
    const plan = await getPlanBySlug("pro", database)
    await grantManualPlan(user.id, plan!.id, null, database)

    await database
      .delete(customShellUsers)
      .where(eq(customShellUsers.id, user.id))

    expect(await historyOf(user.id)).toHaveLength(0)
  })
})

/** Taken from the function itself, so the two cannot drift apart. */
type SubscriptionForCardTest = Parameters<typeof findExpiringCard>[0]

describe("card expiring before renewal", () => {
  const RENEWS_ON = new Date("2026-09-15T00:00:00.000Z")
  const TODAY = new Date("2026-08-10T00:00:00.000Z")

  /** A live Stripe subscription as `findExpiringCard` reads it. */
  function subscriptionRow(
    overrides: Partial<SubscriptionForCardTest> = {}
  ): SubscriptionForCardTest {
    return {
      source: "stripe",
      status: "active",
      stripeSubscriptionId: "sub_card",
      currentPeriodEnd: RENEWS_ON,
      cancelAtPeriodEnd: false,
      ...overrides,
    }
  }

  /** What Stripe answers, with a card on the subscription, the customer, or both. */
  function stripeSubscription({
    onSubscription = null,
    onCustomer = null,
  }: {
    onSubscription?: { month: number; year: number; last4: string } | null
    onCustomer?: { month: number; year: number; last4: string } | null
  }) {
    const method = (card: { month: number; year: number; last4: string }) => ({
      type: "card",
      card: {
        brand: "Visa",
        last4: card.last4,
        exp_month: card.month,
        exp_year: card.year,
      },
    })

    return {
      id: "sub_card",
      default_payment_method: onSubscription ? method(onSubscription) : null,
      customer: {
        id: "cus_card",
        invoice_settings: {
          default_payment_method: onCustomer ? method(onCustomer) : null,
        },
      },
    } as never
  }

  const neverAsksStripe = () => {
    throw new Error("stripe was called")
  }

  it("warns when the card runs out before the renewal", async () => {
    const warning = await findExpiringCard(subscriptionRow(), TODAY, async () =>
      stripeSubscription({ onSubscription: { month: 8, year: 2026, last4: "4242" } })
    )

    expect(warning).toEqual({
      brand: "Visa",
      last4: "4242",
      expMonth: 8,
      expYear: 2026,
      // Aug 31 has not arrived on Aug 10, so it is a warning, not a fact.
      expired: false,
    })
  })

  it("says nothing when the card outlives the renewal", async () => {
    // The card dies at the end of September; the renewal is on the 15th.
    const warning = await findExpiringCard(subscriptionRow(), TODAY, async () =>
      stripeSubscription({ onSubscription: { month: 9, year: 2026, last4: "4242" } })
    )

    expect(warning).toBeNull()
  })

  it("marks a card that has already run out", async () => {
    const warning = await findExpiringCard(subscriptionRow(), TODAY, async () =>
      stripeSubscription({ onSubscription: { month: 6, year: 2026, last4: "1881" } })
    )

    expect(warning?.expired).toBe(true)
    expect(warning?.last4).toBe("1881")
  })

  it("falls back to the customer's card, and prefers the subscription's own", async () => {
    const fromCustomer = await findExpiringCard(
      subscriptionRow(),
      TODAY,
      async () =>
        stripeSubscription({ onCustomer: { month: 8, year: 2026, last4: "0001" } })
    )
    expect(fromCustomer?.last4).toBe("0001")

    // Stripe charges the subscription's own card when it has one, so that is
    // the one the warning has to be about.
    const both = await findExpiringCard(subscriptionRow(), TODAY, async () =>
      stripeSubscription({
        onSubscription: { month: 8, year: 2026, last4: "0002" },
        onCustomer: { month: 8, year: 2026, last4: "0001" },
      })
    )
    expect(both?.last4).toBe("0002")
  })

  it("says nothing about a plan that is already set to end", async () => {
    // Nothing renews, so no payment can fail.
    const warning = await findExpiringCard(
      subscriptionRow({ cancelAtPeriodEnd: true }),
      TODAY,
      neverAsksStripe
    )

    expect(warning).toBeNull()
  })

  it("says nothing about a granted plan or a lapsed one, and never asks Stripe", async () => {
    expect(
      await findExpiringCard(
        subscriptionRow({ source: "manual", stripeSubscriptionId: null }),
        TODAY,
        neverAsksStripe
      )
    ).toBeNull()

    expect(
      await findExpiringCard(
        subscriptionRow({ status: "canceled" }),
        TODAY,
        neverAsksStripe
      )
    ).toBeNull()
  })

  it("says nothing when the saved method is not a card", async () => {
    const warning = await findExpiringCard(subscriptionRow(), TODAY, async () =>
      ({
        id: "sub_card",
        default_payment_method: { type: "us_bank_account", card: null },
        customer: { id: "cus_card", invoice_settings: {} },
      }) as never
    )

    expect(warning).toBeNull()
  })

  it("stays quiet when Stripe will not answer, so the page still loads", async () => {
    // Quiet for the reader, not quiet in the logs: a warning that silently
    // stopped working would look exactly like nobody's card expiring.
    const reported = vi.spyOn(console, "error").mockImplementation(() => {})

    const warning = await findExpiringCard(subscriptionRow(), TODAY, async () => {
      throw new Error("Stripe is down")
    })

    expect(warning).toBeNull()
    expect(reported).toHaveBeenCalledWith(
      "Card expiry check could not run",
      "sub_card",
      expect.any(Error)
    )

    reported.mockRestore()
  })
})

describe("admin account management", () => {
  it("refuses to demote, suspend or delete the last admin", async () => {
    const admin = await createUser({ role: "admin" })

    expect(await countOtherActiveAdmins(admin.id, database)).toBe(0)
    await expect(
      updateUserRole(admin.id, "member", database)
    ).rejects.toThrow("LAST_ADMIN")
    await expect(
      setUserStatus(admin.id, "suspended", database)
    ).rejects.toThrow("LAST_ADMIN")
  })

  it("creates an invited account that cannot sign in until the link sets a password", async () => {
    // Email is unconfigured in tests, so the link is logged; keep it quiet.
    const info = vi.spyOn(console, "info").mockImplementation(() => {})
    try {
      const result = await createAccountByAdmin(
        "invited@example.test",
        "Invited Person",
        "member",
        database
      )
      expect(result.delivered).toBe(false)

      const [created] = await database
        .select()
        .from(customShellUsers)
        .where(eq(customShellUsers.id, result.id))

      expect(created.role).toBe("member")
      expect(created.status).toBe("active")
      expect(created.emailVerifiedAt).toBeNull()
      expect(created.passwordHash).toBeNull()
      // Nothing typed can match an account with no password.
      expect(await verifyPassword(created.passwordHash, "anything")).toBe(false)

      // The set-password link is a reset token, so the reset page can spend it
      // — and completing a reset is what marks the email verified.
      const [tokenRow] = await database
        .select()
        .from(customShellAuthTokens)
        .where(eq(customShellAuthTokens.userId, created.id))
      expect(tokenRow.purpose).toBe("reset_password")
    } finally {
      info.mockRestore()
    }
  })

  it("refuses to invite an email that already has an account", async () => {
    await createUser({ email: "taken@example.test" })

    await expect(
      createAccountByAdmin(
        "taken@example.test",
        "Someone Else",
        "member",
        database
      )
    ).rejects.toThrow("ACCOUNT_EXISTS")
  })

  it("refuses to delete the last admin, and leaves them active", async () => {
    const admin = await createUser({ role: "admin" })
    const second = await createUser({ role: "admin" })

    // `second` is the one pressing the button, so the guard is judging `admin`
    // against the admins that would still be able to sign in afterwards.
    await deleteUserAccounts(second.id, [admin.id], database)
    await expect(
      deleteUserAccounts(admin.id, [second.id], database)
    ).rejects.toThrow("LAST_ADMIN")

    const [remaining] = await database
      .select()
      .from(customShellUsers)
      .where(eq(customShellUsers.id, second.id))

    expect(remaining.status).toBe("active")
    expect(remaining.deletedAt).toBeNull()
  })

  it("ends the sessions of an account it suspends", async () => {
    await createUser({ role: "admin" })
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

    await setUserStatus(member.id, "suspended", database)

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

    // Marked, not removed: every row is still there, and only the two that
    // were named are on their way out.
    expect(result).toEqual({ marked: 2, deleted: 0 })
    const remaining = await database.select().from(customShellUsers)
    expect(remaining).toHaveLength(3)
    expect(
      remaining
        .filter((row) => row.status === "pending_deletion")
        .map((row) => row.id)
        .sort()
    ).toEqual([second.id, third.id].sort())
    expect(remaining.find((row) => row.id === actor.id)?.status).toBe("active")
  })

  it("removes an account for good when it is deleted a second time", async () => {
    const actor = await createUser({ role: "admin" })
    const member = await createUser()

    await deleteUserAccounts(actor.id, [member.id], database)
    const result = await deleteUserAccounts(actor.id, [member.id], database)

    expect(result).toEqual({ marked: 0, deleted: 1 })
    const remaining = await database.select().from(customShellUsers)
    expect(remaining.map((row) => row.id)).toEqual([actor.id])
  })

  it("cancels a paying account's plan before it deletes anything", async () => {
    const actor = await createUser({ role: "admin" })
    const member = await createUser()
    await seedStripeSubscription(member.id)
    const cancelled: string[] = []

    const result = await deleteUserAccounts(actor.id, [member.id], database, {
      ...neverCallsStripe,
      cancelNow: async (subscriptionId: string) => {
        cancelled.push(subscriptionId)
        return stripeAnswer({ status: "canceled", cancel_at_period_end: false })
      },
    })

    expect(result).toEqual({ marked: 1, deleted: 0 })
    expect(cancelled).toEqual(["sub_cancel"])

    const { entitlements } = await loadEntitlements(member.id, database)
    expect(entitlements.isPaid).toBe(false)
  })

  it("deletes nothing when Stripe will not cancel the plan", async () => {
    const actor = await createUser({ role: "admin" })
    const member = await createUser()
    await seedStripeSubscription(member.id)

    await expect(
      deleteUserAccounts(actor.id, [member.id], database, {
        ...neverCallsStripe,
        cancelNow: async () => {
          throw new Error("Stripe is down")
        },
      })
    ).rejects.toThrow("SUBSCRIPTION_CANCEL_FAILED")

    // Still here, still paying: a delete that could not stop the money did not
    // happen at all.
    const [row] = await database
      .select()
      .from(customShellUsers)
      .where(eq(customShellUsers.id, member.id))
    expect(row.status).toBe("active")

    const { entitlements } = await loadEntitlements(member.id, database)
    expect(entitlements.isPaid).toBe(true)
  })

  it("deletes an account on a granted plan without calling Stripe", async () => {
    const actor = await createUser({ role: "admin" })
    const member = await createUser()
    const plan = await getPlanBySlug("pro", database)
    await grantManualPlan(member.id, plan!.id, null, database)

    const result = await deleteUserAccounts(
      actor.id,
      [member.id],
      database,
      neverCallsStripe
    )

    expect(result).toEqual({ marked: 1, deleted: 0 })
    expect(
      await database
        .select()
        .from(customShellSubscriptions)
        .where(eq(customShellSubscriptions.userId, member.id))
    ).toHaveLength(0)
  })

  it("does not restart the window when an account is deleted twice", async () => {
    const actor = await createUser({ role: "admin" })
    const member = await createUser()

    await markAccountsForDeletion(actor.id, [member.id], database)
    const [first] = await database
      .select({ deletedAt: customShellUsers.deletedAt })
      .from(customShellUsers)
      .where(eq(customShellUsers.id, member.id))

    // A second marking matches nothing, so the clock keeps the time it had.
    expect(
      await markAccountsForDeletion(actor.id, [member.id], database)
    ).toEqual([])

    const [second] = await database
      .select({ deletedAt: customShellUsers.deletedAt })
      .from(customShellUsers)
      .where(eq(customShellUsers.id, member.id))

    expect(second.deletedAt).toEqual(first.deletedAt)
  })

  it("signs a deleted account out and refuses it at sign-in", async () => {
    const actor = await createUser({ role: "admin" })
    const member = await createUser()
    const token = "doomed-session-token"

    await database.insert(customShellSessions).values({
      id: uuid(),
      userId: member.id,
      tokenHash: hashSessionToken(token),
      expiresAt: createSessionExpiresAt(),
      createdAt: now(),
    })

    await deleteUserAccounts(actor.id, [member.id], database)

    expect(await findUserBySessionToken(token, database)).toBeNull()
    expect(
      await database
        .select()
        .from(customShellSessions)
        .where(eq(customShellSessions.userId, member.id))
    ).toHaveLength(0)
  })

  it("will not suspend or unsuspend an account that is on its way out", async () => {
    const actor = await createUser({ role: "admin" })
    const member = await createUser()

    await deleteUserAccounts(actor.id, [member.id], database)

    await expect(
      setUserStatus(member.id, "suspended", database)
    ).rejects.toThrow("ACCOUNT_PENDING_DELETION")
    await expect(setUserStatus(member.id, "active", database)).rejects.toThrow(
      "ACCOUNT_PENDING_DELETION"
    )
  })

  it("brings a deleted account back, with everything it owned", async () => {
    const actor = await createUser({ role: "admin" })
    const member = await createUser()

    await deleteUserAccounts(actor.id, [member.id], database)
    expect(await restoreUserAccounts([member.id], database)).toEqual({
      restored: 1,
    })

    const [restored] = await database
      .select()
      .from(customShellUsers)
      .where(eq(customShellUsers.id, member.id))

    expect(restored.status).toBe("active")
    expect(restored.deletedAt).toBeNull()
    expect(restored.deletedBy).toBeNull()
  })

  it("refuses to restore an account whose window has passed, and purges it", async () => {
    const actor = await createUser({ role: "admin" })
    const member = await createUser()

    await deleteUserAccounts(actor.id, [member.id], database)
    // Marked a day past the window, so it is out of time either way.
    await database
      .update(customShellUsers)
      .set({
        deletedAt: new Date(
          Date.now() - (ACCOUNT_RESTORE_DAYS + 1) * 24 * 60 * 60 * 1000
        ),
      })
      .where(eq(customShellUsers.id, member.id))

    await expect(
      restoreUserAccounts([member.id], database)
    ).rejects.toThrow("RESTORE_WINDOW_PASSED")

    expect(await purgeExpiredDeletions(database)).toBe(1)
    const remaining = await database.select().from(customShellUsers)
    expect(remaining.map((row) => row.id)).toEqual([actor.id])
  })

  it("leaves an account still inside its window alone when purging", async () => {
    const actor = await createUser({ role: "admin" })
    const member = await createUser()

    await deleteUserAccounts(actor.id, [member.id], database)

    expect(await purgeExpiredDeletions(database)).toBe(0)
    expect(await database.select().from(customShellUsers)).toHaveLength(2)
  })

  it("lets the owner restore their own account but not one an admin deleted", async () => {
    const actor = await createUser({ role: "admin" })
    const member = await createUser()

    // Deleted by an admin: the member proving who they are is not enough.
    await deleteUserAccounts(actor.id, [member.id], database)
    const [byAdmin] = await database
      .select()
      .from(customShellUsers)
      .where(eq(customShellUsers.id, member.id))

    await expect(restoreOwnAccount(byAdmin, database)).rejects.toThrow(
      "DELETED_BY_ADMIN"
    )

    // Deleted by themselves: their own to undo.
    await restoreUserAccounts([member.id], database)
    await markAccountsForDeletion(member.id, [member.id], database)
    const [bySelf] = await database
      .select()
      .from(customShellUsers)
      .where(eq(customShellUsers.id, member.id))

    const restored = await restoreOwnAccount(bySelf, database)
    expect(restored.status).toBe("active")
  })

  it("refuses a bulk delete that only contains yourself", async () => {
    const actor = await createUser({ role: "admin" })

    await expect(
      deleteUserAccounts(actor.id, [actor.id], database)
    ).rejects.toThrow("CANNOT_DELETE_SELF")
  })

  it("allows the change once another admin exists", async () => {
    await createUser({ role: "admin" })
    const second = await createUser({ role: "admin" })

    const result = await updateUserRole(second.id, "member", database)
    expect(result.role).toBe("member")
  })

  it("grants and revokes a plan without Stripe", async () => {
    await createUser({ role: "admin" })
    const member = await createUser()
    const pro = await getPlanBySlug("pro", database)

    await grantManualPlan(member.id, pro!.id, null, database)
    const granted = await loadEntitlements(member.id, database)
    expect(granted.entitlements.planSlug).toBe("pro")
    expect(granted.entitlements.source).toBe("manual")

    await grantManualPlan(member.id, null, null, database)
    const revoked = await loadEntitlements(member.id, database)
    expect(revoked.entitlements.planSlug).toBe("free")
  })

  it("lists accounts with their real plan and counts revenue from live plans", async () => {
    await createUser({ role: "admin", name: "Ada" })
    const member = await createUser({ name: "Blake" })
    const pro = await getPlanBySlug("pro", database)
    await grantManualPlan(member.id, pro!.id, null, database)

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

  it("filters accounts with an active sign-in lock", async () => {
    await createUser({ role: "admin" })
    const locked = await createUser({ email: "locked@example.test" })
    await createUser({ email: "open@example.test" })

    const lockKey = `login:127.0.0.1:${locked.email}`
    await enforceRateLimit(lockKey, { maxAttempts: 1, windowSeconds: 60 }, database)
    await expect(
      enforceRateLimit(lockKey, { maxAttempts: 1, windowSeconds: 60 }, database)
    ).rejects.toThrow("RATE_LIMITED")

    const result = await listAccounts(
      {
        search: "",
        role: "all",
        status: "locked_out",
        page: 1,
        pageSize: 25,
        sort: "name",
        direction: "asc",
      },
      database
    )

    expect(result.accounts.map((account) => account.id)).toEqual([locked.id])
    expect(result.accounts[0].lockedOut).toBe(true)
  })
})
