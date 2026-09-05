import { describe, expect, it } from "vitest"

import {
  describeMemberSubscriptionEvent,
  memberSubscriptionEvent,
  type SubscriptionEvent,
} from "@/lib/billing/subscription-events"

const BASE_EVENT: SubscriptionEvent = {
  id: "event-1",
  kind: "subscribed",
  planName: "Team",
  detail: null,
  source: "stripe",
  createdAt: "2026-08-30T12:00:00.000Z",
}

describe("member billing history wording", () => {
  it.each([
    ["trial_started", null, "You started a trial of Team."],
    ["subscribed", null, "You subscribed to Team."],
    ["trial_converted", null, "Your trial ended and billing for Team began."],
    ["plan_changed", "Pro", "You switched from Pro to Team."],
    ["payment_failed", "past_due", "Your payment failed."],
    [
      "payment_recovered",
      null,
      "Your payment went through and Team is active again.",
    ],
    [
      "cancel_scheduled",
      "2027-01-01T12:00:00.000Z",
      "Team is set to end on Jan 1, 2027. It will not renew.",
    ],
    ["cancel_stopped", null, "The cancellation was stopped. Team will renew."],
    ["canceled", null, "Team ended."],
    [
      "paused",
      null,
      "Team was paused. Billing stopped and your account moved to the free plan.",
    ],
    ["resumed", null, "Team restarted. Billing started again."],
    [
      "plan_granted",
      "2027-03-01T12:00:00.000Z",
      "Team was added to your account until Mar 1, 2027.",
    ],
    ["grant_removed", null, "The plan added to your account was removed."],
  ])("describes %s without internal attribution", (kind, detail, expected) => {
    const memberEvent = memberSubscriptionEvent({
      ...BASE_EVENT,
      kind,
      detail,
      source: "admin",
    })

    expect(memberEvent).not.toBeNull()
    expect(memberEvent).not.toHaveProperty("source")
    expect(memberEvent).not.toHaveProperty("detail")
    expect(describeMemberSubscriptionEvent(memberEvent!)).toBe(expected)
  })

  it("hides an event kind that has no approved member wording", () => {
    expect(
      memberSubscriptionEvent({ ...BASE_EVENT, kind: "internal_note" })
    ).toBeNull()
  })

  it("uses honest fallbacks when an older row has missing detail", () => {
    const changed = memberSubscriptionEvent({
      ...BASE_EVENT,
      kind: "plan_changed",
      planName: null,
    })
    const ending = memberSubscriptionEvent({
      ...BASE_EVENT,
      kind: "cancel_scheduled",
      planName: null,
    })

    expect(describeMemberSubscriptionEvent(changed!)).toBe(
      "You switched to a new plan."
    )
    expect(describeMemberSubscriptionEvent(ending!)).toBe(
      "Your plan is set to end at the end of your current billing period. It will not renew."
    )
  })

  it("keeps only the detail used by approved member wording", () => {
    const failed = memberSubscriptionEvent({
      ...BASE_EVENT,
      kind: "payment_failed",
      detail: "past_due",
    })
    const changed = memberSubscriptionEvent({
      ...BASE_EVENT,
      kind: "plan_changed",
      detail: "Pro",
    })

    expect(failed).toMatchObject({ previousPlanName: null, endsAt: null })
    expect(JSON.stringify(failed)).not.toContain("past_due")
    expect(changed).toMatchObject({ previousPlanName: "Pro", endsAt: null })
  })
})
