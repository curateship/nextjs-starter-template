import type Stripe from "stripe"
import { PGlite } from "@electric-sql/pglite"
import { and, eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { type CustomShellDb } from "@/server/db"
import { createPlan } from "@/server/billing/plans"
import { cancelSubscriptionByAdmin } from "@/server/billing/stripe"
import {
  grantManualPlan,
  restoreUserAccounts,
  setUserStatus,
  updateUserRole,
} from "@/server/people/accounts"
import { markAccountsForDeletion } from "@/server/people/account-deletion"
import {
  customShellNotifications,
  customShellSubscriptions,
  customShellSystemEmailSends,
} from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { now, uuid } from "@/server/auth/security"

let client: PGlite
let database: CustomShellDb
const originalEmailKey = process.env.CUSTOM_SHELL_RESEND_API_KEY

beforeEach(async () => {
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  delete process.env.CUSTOM_SHELL_RESEND_API_KEY
  vi.spyOn(console, "info").mockImplementation(() => undefined)
})

afterEach(async () => {
  if (originalEmailKey === undefined) {
    delete process.env.CUSTOM_SHELL_RESEND_API_KEY
  } else {
    process.env.CUSTOM_SHELL_RESEND_API_KEY = originalEmailKey
  }
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  await client.close()
})

async function accountUpdates(userId: string) {
  return database
    .select()
    .from(customShellNotifications)
    .where(
      and(
        eq(customShellNotifications.recipientUserId, userId),
        eq(customShellNotifications.type, "account_update")
      )
    )
}

async function accountEmails(email: string) {
  return database
    .select()
    .from(customShellSystemEmailSends)
    .where(
      and(
        eq(customShellSystemEmailSends.toEmail, email),
        eq(customShellSystemEmailSends.kind, "account-updated")
      )
    )
}

describe("admin action emails", () => {
  it("tells a member once per status change and stays silent on a repeat", async () => {
    const member = await insertUser(database)

    await setUserStatus(member.id, "suspended", database)
    await setUserStatus(member.id, "suspended", database)
    await setUserStatus(member.id, "active", database)
    await setUserStatus(member.id, "active", database)

    expect(
      (await accountUpdates(member.id)).map((notice) => notice.message).sort()
    ).toEqual([
      "Your account suspension was lifted.",
      "Your account was suspended.",
    ])
    expect(await accountEmails(member.email)).toHaveLength(2)
  })

  it("tells a member about role and granted-plan changes", async () => {
    const member = await insertUser(database)
    const plan = await createPlan(
      {
        slug: "notice-pro",
        name: "Notice Pro",
        description: "",
        priceMonthlyCents: 1900,
        priceYearlyCents: 0,
        currency: "usd",
        stripePriceIdMonthly: "price_notice_pro",
        stripePriceIdYearly: null,
        trialDays: 0,
        features: {},
        isDefault: false,
        isPublic: true,
        sortOrder: 10,
        active: true,
      },
      database
    )

    await updateUserRole(member.id, "admin", database)
    await grantManualPlan(member.id, plan.id, null, database)
    await grantManualPlan(member.id, plan.id, null, database)
    await grantManualPlan(member.id, null, null, database)

    expect(
      (await accountUpdates(member.id)).map((notice) => notice.message).sort()
    ).toEqual([
      "Notice Pro was granted to your account.",
      "Notice Pro was removed from your account.",
      "Your role changed to Admin.",
    ])
    expect(await accountEmails(member.email)).toHaveLength(3)
  })

  it("tells a member when an admin cancels their Stripe subscription", async () => {
    const member = await insertUser(database)
    const plan = await createPlan(
      {
        slug: "cancel-pro",
        name: "Cancel Pro",
        description: "",
        priceMonthlyCents: 2900,
        priceYearlyCents: 0,
        currency: "usd",
        stripePriceIdMonthly: "price_cancel_pro",
        stripePriceIdYearly: null,
        trialDays: 0,
        features: {},
        isDefault: false,
        isPublic: true,
        sortOrder: 11,
        active: true,
      },
      database
    )
    const timestamp = now()
    await database.insert(customShellSubscriptions).values({
      id: uuid(),
      userId: member.id,
      planId: plan.id,
      stripeSubscriptionId: "sub_notice",
      status: "active",
      source: "stripe",
      interval: "monthly",
      currentPeriodEnd: new Date("2026-09-01T00:00:00.000Z"),
      cancelAtPeriodEnd: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    await cancelSubscriptionByAdmin(member.id, "immediate", database, {
      cancelNow: async () =>
        ({
          status: "canceled",
          cancel_at_period_end: false,
          items: { data: [] },
        }) as unknown as Stripe.Subscription,
      stopRenewal: async () => {
        throw new Error("not used")
      },
    })

    expect(await accountUpdates(member.id)).toMatchObject([
      { message: "Cancel Pro was cancelled immediately." },
    ])
    expect(await accountEmails(member.email)).toHaveLength(1)
  })

  it("sends one notice and one email to each account in a bulk restore", async () => {
    const admin = await insertUser(database, { role: "admin" })
    const members = await Promise.all(
      Array.from({ length: 10 }, () => insertUser(database))
    )
    const ids = members.map((member) => member.id)
    await markAccountsForDeletion(admin.id, ids, database)

    await expect(restoreUserAccounts(ids, database)).resolves.toEqual({
      restored: 10,
    })

    const notices = await database
      .select()
      .from(customShellNotifications)
      .where(eq(customShellNotifications.type, "account_update"))
    const sends = await database
      .select()
      .from(customShellSystemEmailSends)
      .where(eq(customShellSystemEmailSends.kind, "account-updated"))
    expect(notices).toHaveLength(10)
    expect(sends).toHaveLength(10)
  })

  it("does not send account updates while an account is closing", async () => {
    const admin = await insertUser(database, { role: "admin" })
    const member = await insertUser(database)
    const plan = await createPlan(
      {
        slug: "closing-pro",
        name: "Closing Pro",
        description: "",
        priceMonthlyCents: 3900,
        priceYearlyCents: 0,
        currency: "usd",
        stripePriceIdMonthly: "price_closing_pro",
        stripePriceIdYearly: null,
        trialDays: 0,
        features: {},
        isDefault: false,
        isPublic: true,
        sortOrder: 12,
        active: true,
      },
      database
    )
    await markAccountsForDeletion(admin.id, [member.id], database)

    await grantManualPlan(member.id, plan.id, null, database)

    expect(await accountUpdates(member.id)).toHaveLength(0)
    expect(await accountEmails(member.email)).toHaveLength(0)
  })

  it("records a delivery failure when the email service cannot be reached", async () => {
    const member = await insertUser(database)
    process.env.CUSTOM_SHELL_RESEND_API_KEY = "test-key"
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")))

    await setUserStatus(member.id, "suspended", database)

    expect(await accountEmails(member.email)).toMatchObject([
      {
        status: "failed",
        error: "The email service could not be reached.",
      },
    ])
  })
})
