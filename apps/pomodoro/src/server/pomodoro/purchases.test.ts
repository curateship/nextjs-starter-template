import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import type Stripe from "stripe"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { type CustomShellDb } from "@/server/db"
import { loadPomodoroEntitlements } from "@/server/pomodoro/entitlements"
import {
  claimNextGeneration,
  creditsLeft,
  failGeneration,
  packCreditsLeft,
  requestGenerations,
} from "@/server/pomodoro/generation"
import {
  confirmPurchase,
  settlePurchases,
  startPurchase,
  type PurchaseStripeApi,
} from "@/server/pomodoro/purchases"
import { pomodoroGenerations, pomodoroPurchases } from "@/server/pomodoro/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"

/**
 * One-off purchases (task 07) against a real database, with Stripe replaced
 * by a table of answers, so nothing is charged and no request leaves the
 * machine. The rule the ledger keeps: bought credits are spent only after the
 * month's, a failure refunds the pot it came from, and a refund in Stripe
 * takes back what is still unspent.
 */

let client: PGlite
let db: CustomShellDb
let member: { id: string; email: string }

const GIGABYTE = 1024 * 1024 * 1024

beforeEach(async () => {
  ;({ client, db } = await createTestDatabase())
  vi.stubEnv("CUSTOM_SHELL_BILLING_ENABLED", "true")
  vi.stubEnv("CUSTOM_SHELL_APP_URL", "http://localhost:3017")
  // An admin reads as paid: Pro's 5 backgrounds a month and 2 GB.
  const user = await insertUser(db, { role: "admin" })
  member = { id: user.id, email: user.email }
})

afterEach(async () => {
  vi.unstubAllEnvs()
  await client.close()
})

/** Stripe as the test wants it: every session paid, nothing refunded. */
function fakeStripe(overrides: Partial<PurchaseStripeApi> = {}) {
  const created: Stripe.Checkout.SessionCreateParams[] = []
  let next = 0
  const api: PurchaseStripeApi = {
    createSession: async (params) => {
      created.push(params)
      next += 1
      return { id: `cs_test_session_${next}`, url: `https://checkout.test/${next}` }
    },
    loadSession: async (sessionId) =>
      ({
        id: sessionId,
        payment_status: "paid",
        status: "complete",
        // The test database has no sandbox switch, so the site is on live
        // keys and only live purchases count.
        livemode: true,
        payment_intent: `pi_${sessionId}`,
        metadata: { userId: member.id },
      }) as unknown as Stripe.Checkout.Session,
    paymentRefunded: async () => false,
    ...overrides,
  }
  return { api, created }
}

async function buy(product: "backgrounds_5" | "soundscapes_20" | "space_10gb", api: PurchaseStripeApi) {
  await startPurchase(member, product, "/uploads?kind=background", api)
  const [row] = await db
    .select()
    .from(pomodoroPurchases)
    .where(eq(pomodoroPurchases.product, product))
  await confirmPurchase(member.id, row.stripeSessionId!, api)
  return row
}

const LIMITS = { background: 1, soundscape: 1 }

describe("startPurchase", () => {
  it("asks Stripe for the price in code, and returns to the page it came from", async () => {
    const { api, created } = fakeStripe()
    const { url } = await startPurchase(member, "backgrounds_5", "/uploads?kind=background", api)
    expect(url).toBe("https://checkout.test/1")
    const [params] = created
    expect(params.mode).toBe("payment")
    expect(params.line_items?.[0].price_data?.unit_amount).toBe(500)
    expect(params.line_items?.[0].price_data?.product_data?.tax_code).toBe("txcd_10103001")
    expect(params.success_url).toBe(
      "http://localhost:3017/uploads?kind=background&purchase={CHECKOUT_SESSION_ID}"
    )
    const [row] = await db.select().from(pomodoroPurchases)
    expect(row.status).toBe("pending")
    expect(row.stripeSessionId).toBe("cs_test_session_1")
  })

  it("refuses a free account, before Stripe is asked", async () => {
    const free = await insertUser(db)
    const { api, created } = fakeStripe()
    await expect(
      startPurchase({ id: free.id, email: free.email }, "backgrounds_5", "/uploads", api)
    ).rejects.toThrow("PRO_REQUIRED")
    expect(created).toHaveLength(0)
  })

  it("refuses while payments are switched off", async () => {
    vi.stubEnv("CUSTOM_SHELL_BILLING_ENABLED", "false")
    await expect(
      startPurchase(member, "backgrounds_5", "/uploads", fakeStripe().api)
    ).rejects.toThrow("BILLING_DISABLED")
  })
})

describe("confirmPurchase", () => {
  it("records one purchase however many times the page comes back", async () => {
    const { api } = fakeStripe()
    const row = await buy("backgrounds_5", api)
    await confirmPurchase(member.id, row.stripeSessionId!, api)
    expect(await packCreditsLeft(member.id, "background")).toBe(5)
  })

  it("treats somebody else's session as not found", async () => {
    const { api } = fakeStripe()
    await startPurchase(member, "backgrounds_5", "/uploads", api)
    const [row] = await db.select().from(pomodoroPurchases)
    const stranger = await insertUser(db)
    await expect(confirmPurchase(stranger.id, row.stripeSessionId!, api)).rejects.toThrow(
      "PURCHASE_NOT_FOUND"
    )
  })
})

describe("bought credits", () => {
  it("are spent only after the month's, and a failure refunds the pack", async () => {
    await buy("backgrounds_5", fakeStripe().api)
    const ask = () =>
      requestGenerations(member.id, [{ kind: "background", prompt: "a forest" }], LIMITS)

    // The month's one credit first.
    const first = await ask()
    expect(first.rows[0].pot).toBe("month")
    expect(await packCreditsLeft(member.id, "background")).toBe(5)

    // Then the pack.
    const second = await ask()
    expect(second.rows[0].pot).toBe("pack")
    expect(await packCreditsLeft(member.id, "background")).toBe(4)

    // The pack's request fails for good: the credit goes back to the pack,
    // not to the month.
    await claimNextGeneration()
    const packJob = await claimNextGeneration()
    expect(packJob?.id).toBe(second.rows[0].id)
    await failGeneration(packJob!, "no key", { retry: false })
    expect(await packCreditsLeft(member.id, "background")).toBe(5)
    expect(await creditsLeft(member.id, "background", 1)).toBe(0)
  })

  it("refuses once the month and the pack are both spent", async () => {
    await expect(
      requestGenerations(member.id, [{ kind: "soundscape", prompt: "rain" }], {
        background: 1,
        soundscape: 0,
      })
    ).rejects.toThrow("GENERATION_NOT_ALLOWED")
    await requestGenerations(member.id, [{ kind: "soundscape", prompt: "rain" }], LIMITS)
    await expect(
      requestGenerations(member.id, [{ kind: "soundscape", prompt: "rain" }], LIMITS)
    ).rejects.toThrow("GENERATION_LIMIT_REACHED")
    expect(await db.select().from(pomodoroGenerations)).toHaveLength(1)
  })
})

describe("settlePurchases", () => {
  it("settles a checkout nobody came back from", async () => {
    const { api } = fakeStripe()
    await startPurchase(member, "soundscapes_20", "/uploads", api)
    // A minute and more later, the worker asks Stripe itself.
    await db.update(pomodoroPurchases).set({ createdAt: new Date(Date.now() - 2 * 60_000) })
    await settlePurchases(api)
    const [row] = await db.select().from(pomodoroPurchases)
    expect(row.status).toBe("paid")
    expect(await packCreditsLeft(member.id, "soundscape")).toBe(20)
  })

  it("takes back what a refund in Stripe took back, unspent credits only", async () => {
    const { api } = fakeStripe()
    await buy("backgrounds_5", api)
    // One month credit, then one from the pack.
    await requestGenerations(member.id, [{ kind: "background", prompt: "a" }], LIMITS)
    await requestGenerations(member.id, [{ kind: "background", prompt: "b" }], LIMITS)
    expect(await packCreditsLeft(member.id, "background")).toBe(4)

    // An hour later the worker asks about refunds.
    await db.update(pomodoroPurchases).set({ checkedAt: new Date(Date.now() - 2 * 60 * 60_000) })
    await settlePurchases(fakeStripe({ paymentRefunded: async () => true }).api)

    const [row] = await db.select().from(pomodoroPurchases)
    expect(row.status).toBe("refunded")
    expect(await packCreditsLeft(member.id, "background")).toBe(0)

    // The credit used from the refunded pack is forgiven: a new pack is full.
    await startPurchase(member, "backgrounds_5", "/uploads?kind=background", api)
    const [second] = await db
      .select()
      .from(pomodoroPurchases)
      .where(eq(pomodoroPurchases.status, "pending"))
    await confirmPurchase(member.id, second.stripeSessionId!, api)
    expect(await packCreditsLeft(member.id, "background")).toBe(5)
  })

  it("counts only purchases paid in the Stripe mode the site uses now", async () => {
    // A test-card purchase made on sandbox keys, read while on live keys.
    await buy(
      "backgrounds_5",
      fakeStripe({
        loadSession: async (sessionId) =>
          ({
            id: sessionId,
            payment_status: "paid",
            status: "complete",
            livemode: false,
            payment_intent: `pi_${sessionId}`,
            metadata: { userId: member.id },
          }) as unknown as Stripe.Checkout.Session,
      }).api
    )
    expect(await packCreditsLeft(member.id, "background")).toBe(0)
  })

  it("never gives up on a day-old session Stripe still holds open", async () => {
    const pending = fakeStripe({
      loadSession: async (sessionId) =>
        ({
          id: sessionId,
          payment_status: "unpaid",
          status: "complete",
          metadata: { userId: member.id },
        }) as unknown as Stripe.Checkout.Session,
    }).api
    await startPurchase(member, "backgrounds_5", "/uploads?kind=background", pending)
    const old = new Date(Date.now() - 30 * 60 * 60_000)
    await db.update(pomodoroPurchases).set({ createdAt: old, checkedAt: old })
    await settlePurchases(pending)
    const [row] = await db.select().from(pomodoroPurchases)
    expect(row.status).toBe("pending")
  })
})

describe("bought space", () => {
  it("adds 10 GB for a year, and nothing once the year is over", async () => {
    const before = (await loadPomodoroEntitlements(member.id)).storageLimitBytes
    await buy("space_10gb", fakeStripe().api)
    const [row] = await db.select().from(pomodoroPurchases)
    expect(row.endsAt!.getTime() - row.paidAt!.getTime()).toBeGreaterThan(364 * 24 * 60 * 60_000)
    expect((await loadPomodoroEntitlements(member.id)).storageLimitBytes).toBe(before + 10 * GIGABYTE)

    await db.update(pomodoroPurchases).set({ endsAt: new Date(Date.now() - 1000) })
    expect((await loadPomodoroEntitlements(member.id)).storageLimitBytes).toBe(before)
  })
})
