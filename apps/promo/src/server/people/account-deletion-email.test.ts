import { describe, expect, it } from "vitest"

import { accountClosedEmail } from "@/server/people/account-deletion"

const DELETED_AT = new Date("2026-08-11T12:00:00.000Z")

describe("account closure email", () => {
  it("states the deadline and immediate paid-plan cancellation", () => {
    const email = accountClosedEmail({
      email: "member@example.com",
      deletedAt: DELETED_AT,
      paidPlanCancelled: true,
      canRestoreOwn: true,
    })

    expect(email).toMatchObject({
      kind: "account-closed",
      to: "member@example.com",
      tokens: {
        deletion_date: "Sep 10, 2026",
        plan_status:
          "Your paid plan was cancelled immediately and will not renew again.",
        restore_instructions:
          "To restore the account before then, sign in with this email and password, then choose Restore my account.",
      },
    })
  })

  it("does not claim a paid cancellation and explains admin restoration", () => {
    const email = accountClosedEmail({
      email: "member@example.com",
      deletedAt: DELETED_AT,
      paidPlanCancelled: false,
      canRestoreOwn: false,
    })

    expect(email.tokens).toMatchObject({
      deletion_date: "Sep 10, 2026",
      plan_status: "There was no paid plan to cancel.",
      restore_instructions:
        "To restore the account before then, contact an administrator.",
    })
  })
})
